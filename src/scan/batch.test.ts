import { describe, expect, test } from 'vitest';

import type { IsoDate } from '../paperless/schemas';
import { AccountId, BatchId, JobId } from '../upload/machine';
import { type Batch, type DocumentMetadata, type DraftDocument, resolveUploadFields } from './batch';

function resolve(shared: DocumentMetadata, own: DocumentMetadata) {
  const document: DraftDocument = {
    id: JobId.parse('0190a000-0000-7000-8000-000000000001'),
    pages: [{ uri: 'file:///page-1.jpg', width: 1240, height: 1754 }],
    metadata: own,
  };
  const batch: Batch = {
    id: BatchId.parse('0190a000-0000-7000-8000-000000000002'),
    accountId: AccountId.parse('account'),
    createdAt: 0,
    shared,
    documents: [document],
  };
  return resolveUploadFields(batch, document, 'Scan');
}

const march = '2026-03-01' as IsoDate;
const april = '2026-04-01' as IsoDate;

describe('resolveUploadFields', () => {
  test('nothing set anywhere gives the default title and no metadata', () => {
    expect(resolve({}, {})).toEqual({
      title: 'Scan',
      created: null,
      correspondentId: null,
      documentTypeId: null,
      storagePathId: null,
      tagIds: [],
      archiveSerialNumber: null,
      customFields: [],
    });
  });

  test('a value left unset on the document takes the batch value', () => {
    const fields = resolve(
      { title: 'Bills', created: march, correspondentId: 3, documentTypeId: 4, storagePathId: 5, archiveSerialNumber: 6 },
      {},
    );
    expect(fields).toMatchObject({
      title: 'Bills',
      created: march,
      correspondentId: 3,
      documentTypeId: 4,
      storagePathId: 5,
      archiveSerialNumber: 6,
    });
  });

  test('a value set on the document wins over the batch', () => {
    const fields = resolve(
      { title: 'Bills', created: march, correspondentId: 3, documentTypeId: 4 },
      { title: 'Water bill', created: april, correspondentId: 7, documentTypeId: 8 },
    );
    expect(fields).toMatchObject({ title: 'Water bill', created: april, correspondentId: 7, documentTypeId: 8 });
  });

  test('null on the document means none, even when the batch has a value', () => {
    const fields = resolve(
      { correspondentId: 3, documentTypeId: 4, storagePathId: 5, archiveSerialNumber: 6 },
      { correspondentId: null, documentTypeId: null, storagePathId: null, archiveSerialNumber: null },
    );
    expect(fields).toMatchObject({
      correspondentId: null,
      documentTypeId: null,
      storagePathId: null,
      archiveSerialNumber: null,
    });
  });

  test('tags are the union of batch and document tags, without repeats', () => {
    expect(resolve({ tagIds: [1, 2] }, { tagIds: [2, 3] }).tagIds).toEqual([1, 2, 3]);
  });

  test('a blank title falls back to the batch title, then the default', () => {
    expect(resolve({ title: 'Bills' }, { title: '  ' }).title).toBe('Bills');
    expect(resolve({ title: '' }, {}).title).toBe('Scan');
  });

  test('custom fields merge by field, and the document value wins', () => {
    const fields = resolve(
      { customFields: [{ fieldId: 1, value: 'batch' }, { fieldId: 2, value: 10 }] },
      { customFields: [{ fieldId: 2, value: 20 }, { fieldId: 3, value: true }] },
    );
    expect(fields.customFields).toEqual([
      { fieldId: 1, value: 'batch' },
      { fieldId: 2, value: 20 },
      { fieldId: 3, value: true },
    ]);
  });
});
