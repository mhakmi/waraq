import { describe, expect, test } from 'vitest';

import { normalizeServerUrl } from './url';

describe('normalizeServerUrl', () => {
  test.each([
    ['paperless.example.com', 'https://paperless.example.com'],
    ['  paperless.example.com  ', 'https://paperless.example.com'],
    ['https://paperless.example.com/', 'https://paperless.example.com'],
    ['http://192.168.1.20:8000', 'http://192.168.1.20:8000'],
    ['HTTPS://Paperless.Example.com', 'https://paperless.example.com'],
    ['https://example.com/paperless/', 'https://example.com/paperless'],
    ['https://example.com/api', 'https://example.com'],
    ['https://example.com/api/', 'https://example.com'],
    ['https://example.com/paperless/api//', 'https://example.com/paperless'],
    ['https://example.com/apis', 'https://example.com/apis'],
    ['https://example.com:443', 'https://example.com'],
    ['https://example.com:8443', 'https://example.com:8443'],
    ['localhost:8010', 'https://localhost:8010'],
    ['http://[::1]:8000', 'http://[::1]:8000'],
  ])('%s becomes %s', (input, expected) => {
    expect(normalizeServerUrl(input)).toEqual({ ok: true, value: expected });
  });

  test.each([
    ['', { kind: 'empty' }],
    ['   ', { kind: 'empty' }],
    ['ftp://example.com', { kind: 'unsupported_scheme', scheme: 'ftp' }],
    ['file:///etc/passwd', { kind: 'unsupported_scheme', scheme: 'file' }],
    ['https://', { kind: 'malformed' }],
    ['https://exa mple.com', { kind: 'malformed' }],
    ['https://user:secret@example.com', { kind: 'malformed' }],
    ['https://example.com\\@10.0.0.1', { kind: 'malformed' }],
    ['https://example.com/?next=/', { kind: 'malformed' }],
    ['https://example.com/#top', { kind: 'malformed' }],
    ['https://example.com:99999', { kind: 'malformed' }],
    ['https://-example.com', { kind: 'malformed' }],
    ['https://example..com', { kind: 'malformed' }],
    ['https://300.1.1.1', { kind: 'malformed' }],
  ])('%j is rejected', (input, error) => {
    expect(normalizeServerUrl(input)).toEqual({ ok: false, error });
  });
});

describe('http is allowed only for private hosts', () => {
  test.each([
    'http://10.0.2.2:8010',
    'http://10.255.255.255',
    'http://172.16.0.1',
    'http://172.31.255.254',
    'http://192.168.0.10',
    'http://127.0.0.1:8000',
    'http://100.64.0.1',
    'http://100.127.255.255',
    'http://localhost:8000',
    'http://paperless.local',
    'http://nas.lan',
    'http://paperless.home.arpa',
    'http://paperless.tail1234.ts.net',
    'http://nas',
    'http://nas.',
    'http://[::1]',
    'http://[fd7a:115c:a1e0::1]',
    'http://[fe80::1]',
  ])('%s is accepted', (input) => {
    expect(normalizeServerUrl(input).ok).toBe(true);
  });

  test.each([
    ['http://paperless.example.com', 'paperless.example.com'],
    ['http://8.8.8.8', '8.8.8.8'],
    ['http://172.32.0.1', '172.32.0.1'],
    ['http://172.15.255.255', '172.15.255.255'],
    ['http://100.128.0.1', '100.128.0.1'],
    ['http://192.169.0.1', '192.169.0.1'],
    ['http://11.0.0.1', '11.0.0.1'],
    ['http://local.example.com', 'local.example.com'],
    ['http://example.lan.com', 'example.lan.com'],
    ['http://[2001:db8::1]', '[2001:db8::1]'],
    ['http://[::ffff:8.8.8.8]', '[::ffff:8.8.8.8]'],
  ])('%s is refused', (input, host) => {
    expect(normalizeServerUrl(input)).toEqual({ ok: false, error: { kind: 'http_to_public_host', host } });
  });

  test.each(['http://134744072', 'http://0x08080808', 'http://010.8.8.8', 'http://10.0.0.0x1', 'http://8.8.8'])(
    '%s, a number the resolver would read as an address, is malformed',
    (input) => {
      expect(normalizeServerUrl(input)).toEqual({ ok: false, error: { kind: 'malformed' } });
    },
  );

  test('https to a public host is accepted', () => {
    expect(normalizeServerUrl('https://8.8.8.8').ok).toBe(true);
  });
});
