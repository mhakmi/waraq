import { describe, expect, test } from 'vitest';

import type { IsoDate } from '../paperless/schemas';
import { AccountId, BatchId, JobId } from '../upload/machine';
import {
  addDocument,
  addPages,
  type Batch,
  deletePage,
  type DocumentMetadata,
  type DraftDocument,
  filesLeftBehind,
  movePage,
  movePageToDocument,
  newBatch,
  PageId,
  pageCount,
  type PagesDocument,
  type PdfDocument,
  removeDocument,
  replacePage,
  resolveUploadFields,
  rotatePage,
  type ScannedPage,
  setOwn,
  setShared,
  splitDocument,
  withoutQueuedDocuments,
} from './batch';

function jobId(number: number): JobId {
  return JobId.parse(`0190a000-0000-7000-8000-${String(number).padStart(12, '0')}`);
}

const batchId = BatchId.parse('0190a000-0000-7000-8000-00000000ffff');
const accountId = AccountId.parse('account');

function page(name: string): ScannedPage {
  return { id: PageId.parse(name), uri: `file:///batch/${name}.jpg`, width: 1240, height: 1754, rotation: 0 };
}

function pages(document: DraftDocument | undefined): string[] {
  return document?.kind === 'pages' ? document.pages.map((each) => each.id) : [];
}

function pagesDocument(number: number, names: string[]): PagesDocument {
  return { kind: 'pages', id: jobId(number), pages: names.map(page), metadata: {} };
}

const sharedPdf: PdfDocument = {
  kind: 'pdf',
  id: jobId(9),
  pdf: { uri: 'file:///batch/lease.pdf', name: 'lease.pdf', pageCount: 3, thumbnailUri: 'file:///batch/lease.jpg' },
  metadata: { title: 'lease' },
};

function batchOf(...documents: DraftDocument[]): Batch {
  return documents.reduce(addDocument, newBatch(batchId, accountId, 0));
}

function resolve(shared: DocumentMetadata, own: DocumentMetadata) {
  const document: DraftDocument = { ...pagesDocument(1, ['a']), metadata: own };
  const batch: Batch = { ...batchOf(document), shared };
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

  test('a document set back to the batch value takes the batch value again', () => {
    const document: DraftDocument = { ...pagesDocument(1, ['a']), metadata: { correspondentId: 7 } };
    const batch = setOwn({ ...batchOf(document), shared: { correspondentId: 3 } }, document.id, {
      correspondentId: undefined,
    });
    expect(resolveUploadFields(batch, batch.documents[0], 'Scan').correspondentId).toBe(3);
  });
});

describe('batch documents', () => {
  test('a new scan adds a document after the ones already there', () => {
    const batch = batchOf(pagesDocument(1, ['a', 'b']), pagesDocument(2, ['c']));
    expect(batch.documents.map((document) => document.id)).toEqual([jobId(1), jobId(2)]);
    expect(batch.documents.map(pageCount)).toEqual([2, 1]);
  });

  test('added pages go to the end of their document only', () => {
    const batch = addPages(batchOf(pagesDocument(1, ['a']), pagesDocument(2, ['c'])), jobId(1), [page('b')]);
    expect(pages(batch.documents[0])).toEqual(['a', 'b']);
    expect(pages(batch.documents[1])).toEqual(['c']);
  });

  test('a shared PDF counts its own pages and takes no added pages', () => {
    const batch = addPages(batchOf(sharedPdf), sharedPdf.id, [page('x')]);
    expect(batch.documents[0]).toEqual(sharedPdf);
    expect(pageCount(batch.documents[0])).toBe(3);
  });

  test('removing a document leaves the others in order', () => {
    const batch = removeDocument(batchOf(pagesDocument(1, ['a']), pagesDocument(2, ['b']), pagesDocument(3, ['c'])), jobId(2));
    expect(batch.documents.map((document) => document.id)).toEqual([jobId(1), jobId(3)]);
  });
});

describe('page editing', () => {
  const start = batchOf(pagesDocument(1, ['a', 'b', 'c']), pagesDocument(2, ['d']));

  test('rotate turns a page a quarter clockwise and comes back after four turns', () => {
    const once = rotatePage(start, jobId(1), PageId.parse('b'));
    const first = once.documents[0] as PagesDocument;
    expect(first.pages.map((each) => each.rotation)).toEqual([0, 90, 0]);
    let turned = start;
    for (let turn = 0; turn < 4; turn += 1) {
      turned = rotatePage(turned, jobId(1), PageId.parse('b'));
    }
    expect((turned.documents[0] as PagesDocument).pages[1].rotation).toBe(0);
  });

  test('a page moves earlier or later and stays in the document', () => {
    expect(pages(movePage(start, jobId(1), PageId.parse('c'), 1).documents[0])).toEqual(['a', 'c', 'b']);
    expect(pages(movePage(start, jobId(1), PageId.parse('a'), 2).documents[0])).toEqual(['b', 'c', 'a']);
  });

  test('a move past either end changes nothing', () => {
    expect(movePage(start, jobId(1), PageId.parse('a'), -1)).toEqual(start);
    expect(movePage(start, jobId(1), PageId.parse('c'), 3)).toEqual(start);
  });

  test('delete removes the page, and the last page takes its document with it', () => {
    expect(pages(deletePage(start, jobId(1), PageId.parse('b')).documents[0])).toEqual(['a', 'c']);
    const without = deletePage(start, jobId(2), PageId.parse('d'));
    expect(without.documents.map((document) => document.id)).toEqual([jobId(1)]);
  });

  test('retake puts the new page where the old one was', () => {
    const batch = replacePage(start, jobId(1), PageId.parse('b'), page('b2'));
    expect(pages(batch.documents[0])).toEqual(['a', 'b2', 'c']);
  });

  test('a page moved to another document goes to its end', () => {
    const batch = movePageToDocument(start, jobId(1), PageId.parse('a'), jobId(2));
    expect(pages(batch.documents[0])).toEqual(['b', 'c']);
    expect(pages(batch.documents[1])).toEqual(['d', 'a']);
  });

  test('moving the only page of a document removes that document', () => {
    const batch = movePageToDocument(start, jobId(2), PageId.parse('d'), jobId(1));
    expect(batch.documents.map((document) => document.id)).toEqual([jobId(1)]);
    expect(pages(batch.documents[0])).toEqual(['a', 'b', 'c', 'd']);
  });

  test('a page cannot move into a shared PDF', () => {
    const batch = batchOf(pagesDocument(1, ['a']), sharedPdf);
    expect(movePageToDocument(batch, jobId(1), PageId.parse('a'), sharedPdf.id)).toEqual(batch);
  });

  test('split makes a new document of the pages from the split on, right after the old one', () => {
    const batch = splitDocument(start, jobId(1), 1, jobId(5));
    expect(batch.documents.map((document) => document.id)).toEqual([jobId(1), jobId(5), jobId(2)]);
    expect(batch.documents.map(pages)).toEqual([['a'], ['b', 'c'], ['d']]);
    expect(batch.documents[1].metadata).toEqual({});
  });

  test('split keeps the details on the first part', () => {
    const titled = setOwn(start, jobId(1), { title: 'Lease' });
    const batch = splitDocument(titled, jobId(1), 2, jobId(5));
    expect(batch.documents[0].metadata).toEqual({ title: 'Lease' });
  });

  test('a split before the first page or after the last changes nothing', () => {
    expect(splitDocument(start, jobId(1), 0, jobId(5))).toEqual(start);
    expect(splitDocument(start, jobId(1), 3, jobId(5))).toEqual(start);
  });
});

describe('details', () => {
  test('shared and own values change only their own fields', () => {
    const start = batchOf(pagesDocument(1, ['a']), pagesDocument(2, ['b']));
    const batch = setOwn(setShared(start, { tagIds: [4] }), jobId(2), { title: 'Receipt' });
    expect(batch.shared).toEqual({ tagIds: [4] });
    expect(batch.documents.map((document) => document.metadata)).toEqual([{}, { title: 'Receipt' }]);
  });
});

describe('filesLeftBehind', () => {
  const start = batchOf(pagesDocument(1, ['a', 'b']), sharedPdf);

  test('a deleted page leaves only its own file behind', () => {
    expect(filesLeftBehind(start, deletePage(start, jobId(1), PageId.parse('a')))).toEqual(['file:///batch/a.jpg']);
  });

  test('a retake leaves the old page file behind', () => {
    const after = replacePage(start, jobId(1), PageId.parse('b'), page('b2'));
    expect(filesLeftBehind(start, after)).toEqual(['file:///batch/b.jpg']);
  });

  test('discarding a PDF document leaves the PDF and its thumbnail', () => {
    expect(filesLeftBehind(start, removeDocument(start, sharedPdf.id))).toEqual([
      'file:///batch/lease.pdf',
      'file:///batch/lease.jpg',
    ]);
  });

  test('editing that keeps every page leaves nothing', () => {
    const after = rotatePage(movePage(start, jobId(1), PageId.parse('b'), 0), jobId(1), PageId.parse('a'));
    expect(filesLeftBehind(start, after)).toEqual([]);
    expect(filesLeftBehind(start, splitDocument(start, jobId(1), 1, jobId(5)))).toEqual([]);
  });

  test('a discarded batch leaves every file', () => {
    expect(filesLeftBehind(start, null)).toHaveLength(4);
  });
});

describe('withoutQueuedDocuments', () => {
  const start = batchOf(pagesDocument(1, ['a', 'b']), sharedPdf);

  test('a document that already has a job leaves the batch, and discarding the rest leaves its files alone', () => {
    const left = withoutQueuedDocuments(start, new Set([jobId(1)]));

    expect(left?.documents.map((document) => document.id)).toEqual([sharedPdf.id]);
    expect(filesLeftBehind(left, null)).toEqual(['file:///batch/lease.pdf', 'file:///batch/lease.jpg']);
  });

  test('a batch whose every document has a job is gone', () => {
    expect(withoutQueuedDocuments(start, new Set([jobId(1), sharedPdf.id]))).toBeNull();
  });

  test('a batch with no job yet is the same batch', () => {
    expect(withoutQueuedDocuments(start, new Set([jobId(7)]))).toBe(start);
  });

});
