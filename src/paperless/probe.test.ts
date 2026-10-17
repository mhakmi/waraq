import { describe, expect, test } from 'vitest';

import { classifyNetworkMessage, classifyProbeResponse, findPaperless, paperlessTokenViewName } from './probe';
import type { ServerUrl } from './url';

const paperlessBody = JSON.stringify({ name: paperlessTokenViewName, renders: ['application/json'] });

function response(status: number, contentType: string, body: string, redirected = false) {
  return { status, contentType, body, redirected };
}

describe('classifyProbeResponse', () => {
  test.each([
    ['Paperless-ngx 3.x', response(200, 'application/json', paperlessBody), { kind: 'paperless' }],
    ['Paperless-ngx behind an http to https redirect', response(200, 'application/json', paperlessBody, true), { kind: 'paperless' }],
    [
      'a server that cannot speak version 10',
      response(406, 'application/json', '{"detail":"Invalid version in \\"Accept\\" header."}'),
      { kind: 'too_old' },
    ],
    ['a proxy login page', response(200, 'text/html; charset=utf-8', '<html>Sign in</html>'), { kind: 'login_page' }],
    ['a redirect to a login page', response(200, 'application/json', '{}', true), { kind: 'login_page' }],
    ['a proxy that refuses without JSON', response(401, 'text/plain', 'Unauthorized'), { kind: 'login_page' }],
    ['the sign-in limit', response(429, 'application/json', '{"detail":"Request was throttled."}'), { kind: 'rate_limited' }],
    ['a server error', response(502, 'text/plain', 'Bad gateway'), { kind: 'server_error', status: 502 }],
    ['another JSON API', response(200, 'application/json', '{"name":"Other API"}'), { kind: 'not_paperless', status: 200 }],
    ['a 404', response(404, 'application/json', '{"detail":"Not found."}'), { kind: 'not_paperless', status: 404 }],
    ['a 406 that is not about the version', response(406, 'application/json', '{"detail":"No"}'), { kind: 'not_paperless', status: 406 }],
  ])('%s', (_, input, expected) => {
    expect(classifyProbeResponse(input)).toEqual(expected);
  });
});

describe('classifyNetworkMessage', () => {
  test.each([
    ['java.net.UnknownHostException: Unable to resolve host "nas.lan": No address associated with hostname', 'dns'],
    ['fetch failed getaddrinfo ENOTFOUND nas.lan ENOTFOUND', 'dns'],
    ['java.net.ConnectException: Failed to connect to /10.0.2.2:8099', 'unreachable'],
    ['fetch failed connect ECONNREFUSED 127.0.0.1:8099 ECONNREFUSED', 'unreachable'],
    ['javax.net.ssl.SSLPeerUnverifiedException: Hostname nas.lan not verified', 'tls_hostname'],
    [
      'javax.net.ssl.SSLHandshakeException: java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.',
      'tls_untrusted',
    ],
    ['fetch failed self-signed certificate DEPTH_ZERO_SELF_SIGNED_CERT', 'tls_untrusted'],
    ['javax.net.ssl.SSLProtocolException: Read error', 'tls_other'],
    ['Something else', 'other'],
  ])('%s is %s', (message, expected) => {
    expect(classifyNetworkMessage(message)).toBe(expected);
  });
});

describe('findPaperless', () => {
  const baseUrl = 'https://paperless.example.com' as ServerUrl;

  test('asks for API version 10 with the extra headers and reports where the answer came from', async () => {
    const requests: { url: string; method: string; headers: Record<string, string> }[] = [];
    const result = await findPaperless(
      {
        baseUrl,
        headers: { 'CF-Access-Client-Id': 'id' },
        fetch: async (url, init) => {
          requests.push({ url, method: init.method, headers: init.headers });
          return new Response(paperlessBody, { status: 200, headers: { 'content-type': 'application/json' } });
        },
      },
      1000,
    );
    expect(requests).toEqual([
      {
        url: 'https://paperless.example.com/api/token/',
        method: 'OPTIONS',
        headers: { 'CF-Access-Client-Id': 'id', Accept: 'application/json; version=10' },
      },
    ]);
    expect(result).toEqual({
      kind: 'answered',
      answer: { kind: 'paperless' },
      status: 200,
      contentType: 'application/json',
      finalUrl: '',
    });
  });

  test('a server that never answers times out', async () => {
    const result = await findPaperless(
      {
        baseUrl,
        headers: {},
        fetch: (_, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      },
      10,
    );
    expect(result).toEqual({ kind: 'timeout' });
  });

  test('a thrown error is classified by its message and its cause', async () => {
    const result = await findPaperless(
      {
        baseUrl,
        headers: {},
        fetch: async () => {
          throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
        },
      },
      1000,
    );
    expect(result).toEqual({ kind: 'network', problem: 'unreachable', message: 'fetch failed connect ECONNREFUSED ECONNREFUSED' });
  });
});
