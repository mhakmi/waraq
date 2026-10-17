import { describe, expect, test } from 'vitest';

import type { DocumentSummary } from '../paperless/schemas';
import { type DocumentPage, type DocumentPages, positionOf, tagsAfterDone, withDocumentAt, withoutDocument } from './done';

function document(id: number): DocumentSummary {
  return { id } as DocumentSummary;
}

function page(ids: number[], count: number): DocumentPage {
  return { count, hasNextPage: true, items: ids.map(document) };
}

function shape(data: DocumentPages | undefined) {
  return data?.pages.map((item) => [item.items.map((row) => row.id), item.count]);
}

test('tagsAfterDone removes every inbox tag and keeps the rest in order', () => {
  expect(tagsAfterDone([4, 1, 7, 3], [1, 3])).toEqual([4, 7]);
});

describe('withoutDocument', () => {
  const data = { pages: [page([1, 2], 3), page([3], 3)], pageParams: [1, 2] };

  test('drops the row and lowers the count on every page', () => {
    expect(shape(withoutDocument(data, 3))).toEqual([
      [[1, 2], 2],
      [[], 2],
    ]);
  });

  test('leaves the list as it was when the row is not there', () => {
    expect(withoutDocument(data, 9)).toBe(data);
    expect(withoutDocument(undefined, 1)).toBeUndefined();
  });
});

describe('withDocumentAt', () => {
  const data = { pages: [page([1, 2, 3], 4), page([4], 4)], pageParams: [1, 2] };

  test('puts a removed row back where it was, with its count', () => {
    const position = positionOf(data, 2);
    if (position === null) {
      throw new Error('row 2 is in the list');
    }
    expect(shape(withDocumentAt(withoutDocument(data, 2), document(2), position))).toEqual(shape(data));
  });

  test('does not add a row twice or onto a page that is gone', () => {
    expect(withDocumentAt(data, document(2), { page: 0, index: 0 })).toBe(data);
    const onePage = { pages: [page([1], 1)], pageParams: [1] };
    expect(withDocumentAt(onePage, document(5), { page: 3, index: 0 })).toBe(onePage);
  });
});
