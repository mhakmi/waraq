import { beforeEach, expect, test, vi } from 'vitest';

import { AccountId } from '../account/id';
import { BatchId, type JobId } from '../upload/machine';
import type { Batch } from './batch';

const kept = new Map<string, string>();
const deleted: string[] = [];
let queued: Set<JobId> | null = new Set();

vi.mock('expo-sqlite/kv-store', () => ({
  default: {
    getItem: async (key: string) => kept.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      kept.set(key, value);
    },
    removeItem: async (key: string) => {
      kept.delete(key);
    },
  },
}));
vi.mock('expo-file-system', () => ({
  Directory: class {},
  Paths: {},
  File: class {
    constructor(readonly uri: string) {}
    exists = true;
    delete() {
      deleted.push(this.uri);
    }
  },
}));
vi.mock('../upload/queue', () => ({ queuedJobIds: async () => queued }));

const accountId = AccountId.parse('account');
const first = '0190a000-0000-7000-8000-000000000001' as JobId;
const second = '0190a000-0000-7000-8000-000000000002' as JobId;

const batch: Batch = {
  id: BatchId.parse('0190a000-0000-7000-8000-0000000000b1'),
  accountId,
  createdAt: 0,
  shared: {},
  documents: [
    { kind: 'pages', id: first, pages: [{ id: 'a', uri: 'file:///batch/a.jpg', width: 1, height: 1, rotation: 0 }], metadata: {} },
    { kind: 'pages', id: second, pages: [{ id: 'b', uri: 'file:///batch/b.jpg', width: 1, height: 1, rotation: 0 }], metadata: {} },
  ] as Batch['documents'],
};

beforeEach(() => {
  kept.clear();
  kept.set('scan-batch', JSON.stringify(batch));
  deleted.length = 0;
  queued = new Set();
  vi.resetModules();
});

test('a loaded batch drops the documents that already have jobs, and discarding it leaves their files alone', async () => {
  queued = new Set([first]);
  const store = await import('./store');

  const loaded = await store.loadBatch(accountId);
  expect(loaded?.documents.map((document) => document.id)).toEqual([second]);

  store.discardBatch();
  await store.forgetBatch();
  expect(deleted).toEqual(['file:///batch/b.jpg']);
});

test('signing out deletes only the files of documents without a job', async () => {
  queued = new Set([second]);
  const store = await import('./store');

  await store.forgetBatch();

  expect(deleted).toEqual(['file:///batch/a.jpg']);
  expect(kept.has('scan-batch')).toBe(false);
});

test('when the jobs cannot be read, nothing is deleted and the batch stays whole', async () => {
  queued = null;
  const store = await import('./store');

  const loaded = await store.loadBatch(accountId);
  expect(loaded?.documents).toHaveLength(2);

  await store.forgetBatch();
  expect(deleted).toEqual([]);
});
