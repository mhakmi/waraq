import { accountIdFor } from '../account/id';
import type { StoredAccount } from '../account/types';
import { createPaperlessClient, type Fetch, obtainToken, type TokenError } from '../paperless/client';
import { classifyNetworkMessage, findPaperless, type NetworkProblem, probePath } from '../paperless/probe';
import { normalizeServerUrl, type ServerUrl } from '../paperless/url';

export type CheckStep = 'reached' | 'secure' | 'found' | 'signedIn';

export const checkSteps: CheckStep[] = ['reached', 'secure', 'found', 'signedIn'];

export type Problem =
  | { kind: 'dns' }
  | { kind: 'unreachable' }
  | { kind: 'timeout' }
  | { kind: 'tls_untrusted' }
  | { kind: 'tls_hostname' }
  | { kind: 'tls_other' }
  | { kind: 'http_public_host' }
  | { kind: 'login_page' }
  | { kind: 'not_paperless'; status: number }
  | { kind: 'server_error'; status: number }
  | { kind: 'too_old'; serverVersion: string | null }
  | { kind: 'bad_credentials' }
  | { kind: 'bad_token' }
  | { kind: 'mfa_invalid' }
  | { kind: 'rate_limited' }
  | { kind: 'no_ui_settings' }
  | { kind: 'unexpected' };

export type SignInFailure = { step: CheckStep; problem: Problem; technical: string | null; requestSent: boolean };

export type Server = { baseUrl: ServerUrl; host: string; isHttp: boolean; headers: Record<string, string> };

export type ConnectResult =
  | { kind: 'found'; server: Server }
  | { kind: 'invalid_address' }
  | { kind: 'failed'; host: string; isHttp: boolean; failure: SignInFailure };

export type Credentials =
  | { kind: 'password'; username: string; password: string; code: string | null }
  | { kind: 'token'; token: string };

export type SignInResult =
  | { kind: 'signed_in'; stored: StoredAccount }
  | { kind: 'code_required' }
  | { kind: 'failed'; failure: SignInFailure };

export const probeTimeoutMs = 15_000;

export function hostOf(url: ServerUrl): string {
  return url.replace(/^https?:\/\//, '');
}

function serverAt(baseUrl: ServerUrl, headers: Record<string, string>): Server {
  return { baseUrl, host: hostOf(baseUrl), isHttp: baseUrl.startsWith('http://'), headers };
}

function networkProblem(problem: NetworkProblem): { step: CheckStep; problem: Problem } {
  switch (problem) {
    case 'dns':
      return { step: 'reached', problem: { kind: 'dns' } };
    case 'unreachable':
    case 'other':
      return { step: 'reached', problem: { kind: 'unreachable' } };
    case 'tls_untrusted':
    case 'tls_hostname':
    case 'tls_other':
      return { step: 'secure', problem: { kind: problem } };
  }
}

function failed(step: CheckStep, problem: Problem, technical: string | null): SignInFailure {
  return { step, problem, technical, requestSent: true };
}

export async function connect(address: string, headers: Record<string, string>, fetch: Fetch): Promise<ConnectResult> {
  const parsed = normalizeServerUrl(address);
  if (!parsed.ok) {
    if (parsed.error.kind === 'http_to_public_host') {
      const failure: SignInFailure = { step: 'secure', problem: { kind: 'http_public_host' }, technical: null, requestSent: false };
      return { kind: 'failed', host: parsed.error.host, isHttp: true, failure };
    }
    return { kind: 'invalid_address' };
  }
  const server = serverAt(parsed.value, headers);
  const fail = (failure: SignInFailure): ConnectResult => ({ kind: 'failed', host: server.host, isHttp: server.isHttp, failure });

  const result = await findPaperless({ baseUrl: server.baseUrl, fetch, headers }, probeTimeoutMs);
  if (result.kind === 'timeout') {
    return fail(failed('reached', { kind: 'timeout' }, null));
  }
  if (result.kind === 'network') {
    const { step, problem } = networkProblem(result.problem);
    return fail(failed(step, problem, result.message));
  }

  const technical = `OPTIONS /${probePath} answered HTTP ${result.status}, ${result.contentType || 'no content type'}`;
  switch (result.answer.kind) {
    case 'paperless':
      return followRedirect(server, result.finalUrl);
    case 'too_old':
      return fail(failed('found', { kind: 'too_old', serverVersion: null }, technical));
    case 'login_page':
    case 'rate_limited':
      return fail(failed('found', { kind: result.answer.kind }, technical));
    case 'server_error':
    case 'not_paperless':
      return fail(failed('found', { kind: result.answer.kind, status: result.answer.status }, technical));
  }
}

function followRedirect(server: Server, finalUrl: string): ConnectResult {
  const suffix = `/${probePath}`;
  if (finalUrl === '' || finalUrl === `${server.baseUrl}${suffix}` || !finalUrl.endsWith(suffix)) {
    return { kind: 'found', server };
  }
  const moved = normalizeServerUrl(finalUrl.slice(0, -suffix.length));
  if (!moved.ok) {
    const problem: Problem = moved.error.kind === 'http_to_public_host' ? { kind: 'http_public_host' } : { kind: 'unexpected' };
    return { kind: 'failed', host: server.host, isHttp: server.isHttp, failure: failed('secure', problem, `Redirected to ${finalUrl}`) };
  }
  return { kind: 'found', server: serverAt(moved.value, server.headers) };
}

type SignInError = TokenError | { kind: 'unsupported_version'; serverVersion: string | null; apiVersion: number | null };

function signInFailure(error: SignInError, credentials: Credentials): SignInFailure {
  switch (error.kind) {
    case 'network': {
      const { step, problem } = networkProblem(classifyNetworkMessage(error.message));
      return failed(step === 'secure' ? 'secure' : 'signedIn', problem, error.message);
    }
    case 'timeout':
      return failed('signedIn', { kind: 'timeout' }, null);
    case 'bad_credentials':
    case 'mfa_invalid':
    case 'rate_limited':
      return failed('signedIn', { kind: error.kind }, null);
    case 'mfa_required':
      return failed('signedIn', { kind: 'mfa_invalid' }, null);
    case 'unauthorized':
      return failed('signedIn', credentials.kind === 'token' ? { kind: 'bad_token' } : { kind: 'unexpected' }, 'HTTP 401');
    case 'forbidden':
      return failed('signedIn', { kind: 'unexpected' }, 'HTTP 403');
    case 'not_found':
      return failed('found', { kind: 'not_paperless', status: 404 }, 'HTTP 404');
    case 'server':
      return failed('signedIn', { kind: 'server_error', status: error.status }, `HTTP ${error.status}`);
    case 'rejected':
      return failed('signedIn', { kind: 'unexpected' }, `HTTP ${error.status}: ${error.body.slice(0, 200)}`);
    case 'invalid_response':
      return failed('signedIn', { kind: 'login_page' }, error.message);
    case 'unsupported_version':
      return failed(
        'found',
        { kind: 'too_old', serverVersion: error.serverVersion },
        `X-Version ${error.serverVersion ?? 'missing'}, X-Api-Version ${error.apiVersion ?? 'missing'}`,
      );
  }
}

export async function signIn(server: Server, credentials: Credentials, fetch: Fetch, now: number): Promise<SignInResult> {
  let token: string;
  if (credentials.kind === 'token') {
    token = credentials.token.trim();
  } else {
    const code = credentials.code === null ? {} : { code: credentials.code.trim() };
    const result = await obtainToken(
      { baseUrl: server.baseUrl, fetch, extraHeaders: server.headers },
      { username: credentials.username.trim(), password: credentials.password, ...code },
    );
    if (!result.ok) {
      if (result.error.kind === 'mfa_required' && credentials.code === null) {
        return { kind: 'code_required' };
      }
      return { kind: 'failed', failure: signInFailure(result.error, credentials) };
    }
    token = result.value;
  }

  const client = createPaperlessClient({
    baseUrl: server.baseUrl,
    auth: { kind: 'token', token },
    extraHeaders: server.headers,
    fetch,
    appendFile: () => {},
  });
  const info = await client.probeServer();
  if (!info.ok && info.error.kind === 'forbidden') {
    return { kind: 'failed', failure: failed('signedIn', { kind: 'no_ui_settings' }, 'GET /api/ui_settings/ answered HTTP 403') };
  }
  if (!info.ok) {
    return { kind: 'failed', failure: signInFailure(info.error, credentials) };
  }
  return {
    kind: 'signed_in',
    stored: {
      account: {
        id: accountIdFor(server.baseUrl, info.value.user.username),
        serverUrl: server.baseUrl,
        username: info.value.user.username,
        serverVersion: info.value.serverVersion,
        apiVersion: info.value.apiVersion,
        extraHeaders: Object.keys(server.headers),
        addedAt: now,
      },
      secrets: { token, headerValues: server.headers },
    },
  };
}
