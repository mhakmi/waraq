import { describe, expect, test } from 'vitest';

import { appendRolling, describeThrown, formatEntry, redact } from './log';

const secrets = { values: [] as string[], headerNames: ['CF-Access-Client-Secret'] };

const token = 'f3c9a1d07be24c55a8e1d2c3b4a59687';
const headerValue = 'cf-access-9Qz7LmX2';
const password = 'correct horse battery staple';

function entryFor(thrown: unknown): string {
  const { message, stack } = describeThrown(thrown);
  const known = { ...secrets, values: [token, headerValue] };
  return formatEntry({
    kind: 'error',
    time: new Date('2026-10-23T08:00:00Z'),
    appVersion: '0.3.0',
    android: '16',
    message: redact(message, known),
    stack: redact(stack, known),
  });
}

describe('a crash entry', () => {
  test('holds the time, the kind, the app and Android versions, the message, and the stack', () => {
    const error = new TypeError('Cannot read property name of undefined');
    error.stack = 'TypeError: Cannot read property name of undefined\n    at SettingsScreen (index.bundle:1:2)';
    expect(entryFor(error)).toBe(
      [
        '=== 2026-10-23T08:00:00.000Z error',
        'App 0.3.0, Android 16',
        'TypeError: Cannot read property name of undefined',
        'TypeError: Cannot read property name of undefined\n    at SettingsScreen (index.bundle:1:2)',
        '',
      ].join('\n'),
    );
  });

  test.each([
    ['the token in a header', `Request failed with Authorization: Token ${token}`],
    ['the token on its own', `unexpected answer for ${token}`],
    ['an Authorization header as JSON', `{"Authorization":"Token ${token}","Accept":"application/json"}`],
    ['basic auth', 'headers: { authorization: "Basic YWRtaW46c2VjcmV0cGFzcw==" }'],
    ['a password in a sign-in body', `{"username":"admin","password":"${password}"}`],
    ['a password in a form', `username=admin&password=${encodeURIComponent(password)}&code=123456`],
    ['a custom header value', `CF-Access-Client-Id: ${headerValue}`],
    ['the userinfo of the server address', 'Could not reach https://admin:hunter22@paperless.example.com:8443/api/'],
    ['a password with an @ in the address', 'Could not reach https://admin:p@hunter22@paperless.example.com/'],
    ['a sign-in body inside a JSON string', JSON.stringify({ body: JSON.stringify({ username: 'a', password }) })],
    ['a quoted password with a quote in it', '{"password":"ab\\"hunter22"}'],
    ['a lowercase scheme', `authorization: token ${token}`],
    ['headers written as pairs', `[["authorization","bearer ${token}"]]`],
    ['a field named after a password', 'new_password1=hunter22&pwd=hunter22'],
    ['an unquoted password with spaces', `password: ${password}`],
    ['a cookie with several pairs', 'Cookie: csrftoken=abc123; sessionid=hunter22'],
    ['the token URL-encoded', `?next=${encodeURIComponent(`a ${token}`)}`],
    ['a token past the length the message is cut to', `${'x'.repeat(1985)}${token}`],
  ])('leaves out %s', (_, message) => {
    const entry = entryFor(new Error(message));
    for (const secret of [token, headerValue, 'horse', 'battery', 'hunter22', 'YWRtaW46c2VjcmV0cGFzcw==']) {
      expect(entry).not.toContain(secret);
    }
    expect(entry).toContain('[removed]');
  });

  test('leaves out the value of a custom header by its name, before its value is known', () => {
    expect(redact('{"CF-Access-Client-Secret":"not-yet-known-value"}', secrets)).not.toContain('not-yet-known-value');
  });

  test('keeps the rest of the address, so the report still says which server', () => {
    expect(entryFor(new Error('Could not reach https://admin:hunter22@paperless.example.com/api/'))).toContain(
      'https://[removed]@paperless.example.com/api/',
    );
  });

  test('describes a thrown value that is not an Error', () => {
    expect(describeThrown({ status: 500 })).toEqual({ message: '{"status":500}', stack: '' });
  });
});

describe('appendRolling', () => {
  const entry = (number: number) => `=== 2026-10-23T08:00:0${number}.000Z error\nApp 0.3.0, Android 16\nError ${number}\n\n`;

  test('adds an entry after the ones already there', () => {
    expect(appendRolling(entry(1), entry(2))).toBe(entry(1) + entry(2));
  });

  test('drops the oldest whole entries once the log passes its limit', () => {
    const log = entry(1) + entry(2) + entry(3);
    const limit = (entry(3) + entry(4)).length;
    expect(appendRolling(log, entry(4), limit)).toBe(entry(3) + entry(4));
  });

  test('keeps a new entry even when it alone is over the limit', () => {
    expect(appendRolling(entry(1), entry(2), 10)).toBe(entry(2));
  });
});
