import { describe, expect, test } from 'vitest';

import type { Fetch } from '../paperless/client';
import { paperlessTokenViewName } from '../paperless/probe';
import type { ServerUrl } from '../paperless/url';
import { connect, type Server, signIn } from './connect';

type Answer = { status: number; body: unknown; headers?: Record<string, string>; url?: string; redirected?: boolean };

function serverAnswering(answer: (url: string, method: string) => Answer) {
  const requests: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = [];
  const fetch: Fetch = async (url, init) => {
    requests.push({ url, method: init.method, headers: init.headers, body: init.body });
    const { status, body, headers = {}, url: finalUrl = url, redirected = false } = answer(url, init.method);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const contentType = typeof body === 'string' ? 'text/html' : 'application/json';
    return {
      status,
      url: finalUrl,
      redirected,
      headers: new Headers({ 'content-type': contentType, ...headers }),
      text: async () => text,
    };
  };
  return { fetch, requests };
}

const paperless = { status: 200, body: { name: paperlessTokenViewName } };
const versionHeaders = { 'x-version': '3.3.2', 'x-api-version': '10' };
const settings = { user: { id: 3, username: 'admin' }, permissions: [] };

describe('connect', () => {
  test('finds Paperless-ngx at the address and sends the custom headers', async () => {
    const { fetch, requests } = serverAnswering(() => paperless);
    const result = await connect('http://10.0.2.2:8010', { 'X-Proxy': 'secret' }, fetch);
    expect(result).toEqual({
      kind: 'found',
      server: { baseUrl: 'http://10.0.2.2:8010', host: '10.0.2.2:8010', isHttp: true, headers: { 'X-Proxy': 'secret' } },
    });
    expect(requests[0].headers['X-Proxy']).toBe('secret');
  });

  test('refuses plain HTTP to a public host before sending anything', async () => {
    const { fetch, requests } = serverAnswering(() => paperless);
    const result = await connect('http://paperless.example.com', { 'X-Proxy': 'secret' }, fetch);
    expect(result).toEqual({
      kind: 'failed',
      host: 'paperless.example.com',
      isHttp: true,
      failure: { step: 'secure', problem: { kind: 'http_public_host' }, technical: null, requestSent: false },
    });
    expect(requests).toEqual([]);
  });

  test('an address that cannot be parsed is reported on the field, not as a failed connection', async () => {
    const { fetch } = serverAnswering(() => paperless);
    expect(await connect('https://user@example.com', {}, fetch)).toEqual({ kind: 'invalid_address' });
  });

  test('a redirect to https moves the server to the new address', async () => {
    const { fetch } = serverAnswering(() => ({ ...paperless, url: 'https://nas.lan/api/token/', redirected: true }));
    const result = await connect('http://nas.lan', {}, fetch);
    expect(result.kind === 'found' && result.server).toEqual({
      baseUrl: 'https://nas.lan',
      host: 'nas.lan',
      isHttp: false,
      headers: {},
    });
  });

  test('a proxy login page fails at Found Paperless-ngx', async () => {
    const { fetch } = serverAnswering(() => ({ status: 200, body: '<html>Sign in</html>' }));
    const result = await connect('https://docs.example.com', {}, fetch);
    expect(result.kind === 'failed' && result.failure).toEqual({
      step: 'found',
      problem: { kind: 'login_page' },
      technical: 'OPTIONS /api/token/ answered HTTP 200, text/html',
      requestSent: true,
    });
  });

  test('an unknown host fails at Reached the server with the system message', async () => {
    const message = 'java.net.UnknownHostException: Unable to resolve host "nas.lan"';
    const fetch: Fetch = async () => {
      throw new Error(message);
    };
    const result = await connect('https://nas.lan', {}, fetch);
    expect(result.kind === 'failed' && result.failure).toEqual({
      step: 'reached',
      problem: { kind: 'dns' },
      technical: message,
      requestSent: true,
    });
  });

  test('an untrusted certificate fails at Secure connection', async () => {
    const fetch: Fetch = async () => {
      throw new Error('java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.');
    };
    const result = await connect('https://nas.lan', {}, fetch);
    expect(result.kind === 'failed' && result.failure.step).toBe('secure');
    expect(result.kind === 'failed' && result.failure.problem).toEqual({ kind: 'tls_untrusted' });
  });
});

describe('signIn', () => {
  const server: Server = {
    baseUrl: 'https://docs.example.com' as ServerUrl,
    host: 'docs.example.com',
    isHttp: false,
    headers: { 'X-Proxy': 'secret' },
  };
  const password = { kind: 'password', username: ' admin ', password: 'pw', code: null } as const;

  function signedInServer(tokenAnswer: Answer) {
    return serverAnswering((url) =>
      url.endsWith('/api/token/') ? tokenAnswer : { status: 200, body: settings, headers: versionHeaders },
    );
  }

  test('a password sign-in keeps the token, the header values, and the server version', async () => {
    const { fetch, requests } = signedInServer({ status: 200, body: { token: 'abc' } });
    const result = await signIn(server, password, fetch, 1_000);
    if (result.kind !== 'signed_in') {
      throw new Error(JSON.stringify(result));
    }
    expect(result.stored.secrets).toEqual({ token: 'abc', headerValues: { 'X-Proxy': 'secret' } });
    expect(result.stored.account).toMatchObject({
      serverUrl: 'https://docs.example.com',
      username: 'admin',
      serverVersion: '3.3.2',
      apiVersion: 10,
      extraHeaders: ['X-Proxy'],
      addedAt: 1_000,
    });
    expect(requests[0].body).toBe(JSON.stringify({ username: 'admin', password: 'pw' }));
    expect(requests[1].headers).toMatchObject({ Authorization: 'Token abc', 'X-Proxy': 'secret' });
  });

  test('a server that wants a code asks for it instead of failing', async () => {
    const { fetch } = signedInServer({ status: 400, body: { non_field_errors: ['MFA code is required'] } });
    expect(await signIn(server, password, fetch, 1_000)).toEqual({ kind: 'code_required' });
  });

  test('the code goes with the next try, and a wrong one fails at Signed in', async () => {
    const { fetch, requests } = signedInServer({ status: 400, body: { non_field_errors: ['Invalid MFA code'] } });
    const result = await signIn(server, { ...password, code: ' 123456 ' }, fetch, 1_000);
    expect(requests[0].body).toBe(JSON.stringify({ username: 'admin', password: 'pw', code: '123456' }));
    expect(result).toEqual({
      kind: 'failed',
      failure: { step: 'signedIn', problem: { kind: 'mfa_invalid' }, technical: null, requestSent: true },
    });
  });

  test('a wrong password fails at Signed in', async () => {
    const { fetch } = signedInServer({
      status: 400,
      body: { non_field_errors: ['Unable to log in with provided credentials.'] },
    });
    const result = await signIn(server, password, fetch, 1_000);
    expect(result.kind === 'failed' && result.failure.problem).toEqual({ kind: 'bad_credentials' });
  });

  test('a token the server refuses is a bad token', async () => {
    const { fetch } = serverAnswering(() => ({ status: 401, body: { detail: 'Invalid token.' } }));
    const result = await signIn(server, { kind: 'token', token: 'nope' }, fetch, 1_000);
    expect(result.kind === 'failed' && result.failure.problem).toEqual({ kind: 'bad_token' });
  });

  test('a server below API version 10 fails at Found Paperless-ngx and names its version', async () => {
    const { fetch } = serverAnswering(() => ({
      status: 200,
      body: settings,
      headers: { 'x-version': '2.20.15', 'x-api-version': '9' },
    }));
    const result = await signIn(server, { kind: 'token', token: 'abc' }, fetch, 1_000);
    expect(result.kind === 'failed' && result.failure).toEqual({
      step: 'found',
      problem: { kind: 'too_old', serverVersion: '2.20.15' },
      technical: 'X-Version 2.20.15, X-Api-Version 9',
      requestSent: true,
    });
  });
});
