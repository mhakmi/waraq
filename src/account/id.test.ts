import { expect, test } from 'vitest';

import type { ServerUrl } from '../paperless/url';
import { accountIdFor } from './id';

const docs = 'https://docs.example.com' as ServerUrl;
const other = 'https://paperless.example.org' as ServerUrl;

test('the same server and user always get the same id, which can name a secure-store key', () => {
  const id = accountIdFor(docs, 'admin');

  expect(accountIdFor(docs, 'admin')).toBe(id);
  expect(id).toMatch(/^[0-9a-f]{16}$/);
});

test('another user or another server gets another id', () => {
  const id = accountIdFor(docs, 'admin');

  expect(accountIdFor(docs, 'sam')).not.toBe(id);
  expect(accountIdFor(other, 'admin')).not.toBe(id);
  expect(accountIdFor(docs, 'Admin')).not.toBe(id);
});
