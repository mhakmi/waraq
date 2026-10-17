import { describe, expect, test } from 'vitest';

import { normalizeServerUrl } from './url';

describe('normalizeServerUrl', () => {
  test.each([
    ['paperless.example.com', 'https://paperless.example.com'],
    ['  paperless.example.com  ', 'https://paperless.example.com'],
    ['https://paperless.example.com/', 'https://paperless.example.com'],
    ['http://192.168.1.20:8000', 'http://192.168.1.20:8000'],
    ['HTTP://Paperless.Example.com', 'http://paperless.example.com'],
    ['https://example.com/paperless/', 'https://example.com/paperless'],
    ['https://example.com/api', 'https://example.com'],
    ['https://example.com/api/', 'https://example.com'],
    ['https://example.com/paperless/api//', 'https://example.com/paperless'],
    ['https://example.com/apis', 'https://example.com/apis'],
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
    ['https://example.com/?next=/', { kind: 'malformed' }],
  ])('%j is rejected', (input, error) => {
    expect(normalizeServerUrl(input)).toEqual({ ok: false, error });
  });
});
