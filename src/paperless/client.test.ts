import { describe, expect, test } from 'vitest';

import { createPaperlessClient, obtainToken } from './client';
import type { DocumentId } from './schemas';
import type { ServerUrl } from './url';

const baseUrl = 'https://paperless.example.com' as ServerUrl;

function answering(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status, headers });
}

function clientAnswering(status: number, body: unknown, headers: Record<string, string> = {}) {
  return createPaperlessClient({
    baseUrl,
    auth: { kind: 'token', token: 'token' },
    fetch: answering(status, body, headers),
    appendFile: () => {},
  });
}

describe('obtainToken', () => {
  const credentials = { username: 'someone', password: 'secret' };

  test.each([
    [{ non_field_errors: ['MFA code is required'] }, { kind: 'mfa_required' }],
    [{ non_field_errors: ['Invalid MFA code'] }, { kind: 'mfa_invalid' }],
    [{ non_field_errors: ['Unable to log in with provided credentials.'] }, { kind: 'bad_credentials' }],
  ])('a 400 with %j maps to %j', async (body, error) => {
    const result = await obtainToken({ baseUrl, fetch: answering(400, body) }, credentials);
    expect(result).toEqual({ ok: false, error });
  });

  test('the throttle maps to rate_limited', async () => {
    const result = await obtainToken(
      { baseUrl, fetch: answering(429, { detail: 'Request was throttled.' }) },
      credentials,
    );
    expect(result).toEqual({ ok: false, error: { kind: 'rate_limited' } });
  });
});

describe('probeServer', () => {
  const settings = { user: { id: 1, username: 'someone' }, permissions: [] };

  test('a server that refuses API version 10 is unsupported', async () => {
    const result = await clientAnswering(406, { detail: 'Invalid version' }).probeServer();
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported_version', serverVersion: null, apiVersion: null },
    });
  });

  test('a server whose newest API version is 9 is unsupported', async () => {
    const headers = { 'x-api-version': '9', 'x-version': '2.20.15' };
    const result = await clientAnswering(200, settings, headers).probeServer();
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported_version', serverVersion: '2.20.15', apiVersion: 9 },
    });
  });

  test('a response without version headers is unsupported', async () => {
    const result = await clientAnswering(200, settings).probeServer();
    expect(result).toEqual({
      ok: false,
      error: { kind: 'unsupported_version', serverVersion: null, apiVersion: null },
    });
  });
});

describe('notes', () => {
  test('an error object sent with status 200 is an error', async () => {
    const result = await clientAnswering(200, { error: 'Error saving note' }).addNote(
      1 as DocumentId,
      'text',
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'rejected', status: 200, body: 'Error saving note' },
    });
  });
});
