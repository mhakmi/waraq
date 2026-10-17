// Paperless-ngx sends its version headers only to a signed-in user, so the probe asks something that
// needs no sign-in and that only Paperless-ngx answers this way: OPTIONS /api/token/ with
// "Accept: application/json; version=10". Paperless-ngx 3.x answers 200 with JSON that names its
// token view, "Paperless Obtain Auth Token". A server that cannot speak API version 10 answers 406.
// The probe counts against the token view's limit of five requests a minute, like a sign-in does.

import { apiVersion, type Fetch } from './client';
import { describeError } from './errors';
import type { ServerUrl } from './url';

export type ProbeResponse = {
  status: number;
  contentType: string;
  body: string;
  redirected: boolean;
};

export type ProbeAnswer =
  | { kind: 'paperless' }
  | { kind: 'too_old' }
  | { kind: 'login_page' }
  | { kind: 'rate_limited' }
  | { kind: 'server_error'; status: number }
  | { kind: 'not_paperless'; status: number };

export type NetworkProblem = 'dns' | 'unreachable' | 'tls_untrusted' | 'tls_hostname' | 'tls_other' | 'other';

export type ProbeResult =
  | { kind: 'answered'; answer: ProbeAnswer; status: number; contentType: string; finalUrl: string }
  | { kind: 'network'; problem: NetworkProblem; message: string }
  | { kind: 'timeout' };

export const paperlessTokenViewName = 'Paperless Obtain Auth Token';
export const probePath = 'api/token/';

function jsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function fieldOf(value: unknown, field: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[field] : undefined;
}

export function classifyProbeResponse(response: ProbeResponse): ProbeAnswer {
  const contentType = response.contentType.toLowerCase();
  const body = contentType.includes('json') ? jsonBody(response.body) : null;
  if (response.status === 200 && fieldOf(body, 'name') === paperlessTokenViewName) {
    return { kind: 'paperless' };
  }
  if (response.redirected || contentType.includes('html')) {
    return { kind: 'login_page' };
  }
  if (response.status === 429) {
    return { kind: 'rate_limited' };
  }
  if (response.status >= 500) {
    return { kind: 'server_error', status: response.status };
  }
  const detail = fieldOf(body, 'detail');
  if (response.status === 406 && typeof detail === 'string' && detail.toLowerCase().includes('version')) {
    return { kind: 'too_old' };
  }
  if ((response.status === 401 || response.status === 403) && body === null) {
    return { kind: 'login_page' };
  }
  return { kind: 'not_paperless', status: response.status };
}

// The messages come from OkHttp on the phone, through expo/fetch, and from Node in tests.
const networkPatterns: [RegExp, NetworkProblem][] = [
  [/unable to resolve host|unknownhost|no address associated|nodename nor servname|enotfound|eai_again/i, 'dns'],
  [/econnrefused|connection refused|failed to connect|ehostunreach|enetunreach|unreachable|etimedout/i, 'unreachable'],
  [/hostname .* not verified|altname|does not match certificate/i, 'tls_hostname'],
  [/trust anchor|certpathvalidator|self[- ]signed|unable to (get|verify)|certificate/i, 'tls_untrusted'],
  [/ssl|tls|handshake/i, 'tls_other'],
];

export function classifyNetworkMessage(message: string): NetworkProblem {
  const match = networkPatterns.find(([pattern]) => pattern.test(message));
  return match ? match[1] : 'other';
}

export async function findPaperless(
  server: { baseUrl: ServerUrl; fetch: Fetch; headers: Record<string, string> },
  timeoutMs: number,
): Promise<ProbeResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await server.fetch(`${server.baseUrl}/${probePath}`, {
      method: 'OPTIONS',
      headers: { ...server.headers, Accept: `application/json; version=${apiVersion}` },
      signal: controller.signal,
    });
    const body = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const answer = classifyProbeResponse({ status: response.status, contentType, body, redirected: response.redirected });
    return { kind: 'answered', answer, status: response.status, contentType, finalUrl: response.url };
  } catch (error) {
    if (timedOut) {
      return { kind: 'timeout' };
    }
    const message = describeError(error);
    return { kind: 'network', problem: classifyNetworkMessage(message), message };
  } finally {
    clearTimeout(timer);
  }
}
