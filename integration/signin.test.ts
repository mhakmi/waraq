import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { connect, type Server, signIn } from '../src/signin/connect';
import { serverUrl, token, uniqueName } from './helpers';

async function found(address: string): Promise<Server> {
  const result = await connect(address, {}, fetch);
  if (result.kind !== 'found') {
    throw new Error(`No Paperless-ngx at ${address}: ${JSON.stringify(result)}`);
  }
  return result.server;
}

// The probe and the token request share a limit of five a minute, so the suite probes once.
let server: Server;

beforeAll(async () => {
  server = await found(serverUrl);
});

describe('connect', () => {
  let proxy: HttpServer;
  let proxyAddress: string;

  beforeAll(async () => {
    proxy = createServer((_, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html><body>Sign in to continue</body></html>');
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    proxyAddress = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    proxy.close();
  });

  test('finds the test server without signing in', () => {
    expect(server.baseUrl).toBe(serverUrl);
  });

  test('a port where nothing listens fails at Reached the server', async () => {
    const result = await connect('http://127.0.0.1:1', {}, fetch);
    expect(result.kind === 'failed' && [result.failure.step, result.failure.problem]).toEqual([
      'reached',
      { kind: 'unreachable' },
    ]);
  });

  test('a proxy that answers with a web page fails at Found Paperless-ngx', async () => {
    const result = await connect(proxyAddress, {}, fetch);
    expect(result.kind === 'failed' && [result.failure.step, result.failure.problem]).toEqual([
      'found',
      { kind: 'login_page' },
    ]);
  });
});

describe('signIn', () => {
  test('a password sign-in reads the version and the user', async () => {
    const result = await signIn(
      server,
      { kind: 'password', username: 'admin', password: 'waraq-dev-password', code: null },
      fetch,
      Date.now(),
    );
    if (result.kind !== 'signed_in') {
      throw new Error(JSON.stringify(result));
    }
    expect(result.stored.account.username).toBe('admin');
    expect(result.stored.account.apiVersion).toBeGreaterThanOrEqual(10);
    expect(result.stored.account.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('an API token signs in without the token endpoint', async () => {
    const result = await signIn(server, { kind: 'token', token }, fetch, Date.now());
    expect(result.kind === 'signed_in' && result.stored.secrets.token).toBe(token);
  });
});

describe('an account without view_uisettings', () => {
  const username = uniqueName('signin-no-ui-settings');
  const password = `${uniqueName('pw')}-Aa1!`;
  let userId: number;

  beforeAll(async () => {
    const response = await fetch(`${serverUrl}/api/users/`, {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, user_permissions: ['view_document'] }),
    });
    if (!response.ok) {
      throw new Error(`Could not create ${username}: ${response.status} ${await response.text()}`);
    }
    userId = ((await response.json()) as { id: number }).id;
  });

  afterAll(async () => {
    await fetch(`${serverUrl}/api/users/${userId}/`, { method: 'DELETE', headers: { Authorization: `Token ${token}` } });
  });

  test('gets a token, then fails at Signed in with the missing permission', async () => {
    const result = await signIn(server, { kind: 'password', username, password, code: null }, fetch, Date.now());
    expect(result.kind === 'failed' && [result.failure.step, result.failure.problem]).toEqual([
      'signedIn',
      { kind: 'no_ui_settings' },
    ]);
  });
});
