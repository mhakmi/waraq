import { expect, test } from 'vitest';

import { AccountId, BatchId, JobId } from '../upload/machine';
import { type Batch, PageId } from './batch';
import { parseStoredBatch } from './stored';

const batch: Batch = {
  id: BatchId.parse('0190a000-0000-7000-8000-00000000ffff'),
  accountId: AccountId.parse('account'),
  createdAt: 1_760_000_000_000,
  shared: { tagIds: [4], storagePathId: 2, correspondentId: null },
  documents: [
    {
      kind: 'pages',
      id: JobId.parse('0190a000-0000-7000-8000-000000000001'),
      pages: [{ id: PageId.parse('page-1'), uri: 'file:///batch/a.jpg', width: 611, height: 882, rotation: 90 }],
      metadata: { title: 'Lease renewal notice', documentTypeId: 3 },
    },
    {
      kind: 'pdf',
      id: JobId.parse('0190a000-0000-7000-8000-000000000002'),
      pdf: { uri: 'file:///batch/b.pdf', name: 'receipt.pdf', pageCount: 2, thumbnailUri: 'file:///batch/b.jpg' },
      metadata: {},
    },
  ],
};

test('a saved batch reads back the same after a restart', () => {
  expect(parseStoredBatch(JSON.stringify(batch))).toEqual(batch);
});

test('a missing or unreadable record means no batch', () => {
  expect(parseStoredBatch(null)).toBeNull();
  expect(parseStoredBatch('{not json')).toBeNull();
  expect(parseStoredBatch(JSON.stringify({ ...batch, documents: [{ kind: 'pages' }] }))).toBeNull();
});

test('a rotation that is not a quarter turn is refused', () => {
  const tilted = JSON.parse(JSON.stringify(batch));
  tilted.documents[0].pages[0].rotation = 45;
  expect(parseStoredBatch(JSON.stringify(tilted))).toBeNull();
});
