"""A proxy in front of the dev server that slows down large uploads.

The emulator's own network shaping does not slow traffic to the host, so the upload flow
cannot kill the app while a send is still running. This proxy passes every request to the
dev server as it is, and reads a request body above the size limit at a fixed rate, so an
upload of a few megabytes takes a minute or more.

    python3 dev/slow-proxy.py <listen port> <upstream port> [bytes per second] [slow above bytes]
"""

import http.client
import http.server
import sys
import time

listen_port = int(sys.argv[1])
upstream_port = int(sys.argv[2])
bytes_per_second = int(sys.argv[3]) if len(sys.argv) > 3 else 300_000
slow_above = int(sys.argv[4]) if len(sys.argv) > 4 else 1_000_000
chunk = 32_768


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def forward(self):
        body = self.read_body()
        upstream = http.client.HTTPConnection('127.0.0.1', upstream_port, timeout=600)
        headers = {name: value for name, value in self.headers.items() if name.lower() != 'transfer-encoding'}
        if body is not None:
            headers['Content-Length'] = str(len(body))
        upstream.request(self.command, self.path, body=body, headers=headers)
        response = upstream.getresponse()
        payload = response.read()
        self.send_response(response.status, response.reason)
        for name, value in response.getheaders():
            if name.lower() not in ('transfer-encoding', 'content-length', 'connection'):
                self.send_header(name, value)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
        upstream.close()

    def read_body(self):
        length = self.headers.get('Content-Length')
        if length is None:
            if self.headers.get('Transfer-Encoding', '').lower() == 'chunked':
                return self.read_chunked()
            return None
        return self.read_slowly(int(length))

    def read_chunked(self):
        parts = []
        while True:
            size = int(self.rfile.readline().strip().split(b';')[0], 16)
            if size == 0:
                self.rfile.readline()
                return b''.join(parts)
            parts.append(self.read_slowly(size))
            self.rfile.readline()

    def read_slowly(self, length):
        slow = length > slow_above
        if slow:
            self.log_message('reading %d bytes at %d bytes a second', length, bytes_per_second)
        parts = []
        left = length
        while left > 0:
            part = self.rfile.read(min(chunk, left))
            if not part:
                break
            parts.append(part)
            left -= len(part)
            if slow:
                time.sleep(len(part) / bytes_per_second)
        return b''.join(parts)

    do_GET = do_POST = do_PATCH = do_PUT = do_DELETE = do_OPTIONS = do_HEAD = forward


http.server.ThreadingHTTPServer(('0.0.0.0', listen_port), Handler).serve_forever()
