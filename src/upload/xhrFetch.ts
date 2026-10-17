import type { Fetch, HttpResponse } from '../paperless/client';
import type { Progress } from './drain';

const progressIntervalMs = 250;
const progressStep = 0.01;

function responseOf(xhr: XMLHttpRequest, url: string): HttpResponse {
  const finalUrl = xhr.responseURL || url;
  return {
    status: xhr.status,
    url: finalUrl,
    redirected: finalUrl !== url,
    headers: { get: (name) => xhr.getResponseHeader(name) },
    text: async () => xhr.responseText,
  };
}

// expo/fetch reads a FormData body whole into memory and reports no upload progress.
// React Native's XMLHttpRequest streams a file part from disk and goes through the same OkHttp client.
export function xhrFetch(onUploadProgress: (progress: Progress) => void): Fetch {
  return (url, init) =>
    new Promise<HttpResponse>((resolve, reject) => {
      if (init.signal.aborted) {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }
      const xhr = new XMLHttpRequest();
      let reportedAt = 0;
      let reportedRatio = 0;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total === 0) {
          return;
        }
        const now = Date.now();
        const ratio = event.loaded / event.total;
        const finished = event.loaded === event.total;
        if (!finished && now - reportedAt < progressIntervalMs && ratio - reportedRatio < progressStep) {
          return;
        }
        reportedAt = now;
        reportedRatio = ratio;
        onUploadProgress({ sent: event.loaded, total: event.total });
      };

      const abort = () => xhr.abort();
      const settle = () => init.signal.removeEventListener('abort', abort);
      xhr.onload = () => {
        settle();
        resolve(responseOf(xhr, url));
      };
      const failed = () => {
        settle();
        reject(new TypeError('Network request failed'));
      };
      xhr.onerror = failed;
      xhr.ontimeout = failed;
      xhr.onabort = () => {
        settle();
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      init.signal.addEventListener('abort', abort);

      xhr.open(init.method, url);
      for (const [name, value] of Object.entries(init.headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.send(init.body ?? null);
    });
}
