import { describe, expect, test } from 'vitest';

import { queryKeys, shouldPersist } from './keys';

describe('shouldPersist', () => {
  test.each([
    [queryKeys.labels('a', 'tags'), true],
    [queryKeys.savedViews('a'), true],
    [queryKeys.inbox('a', [1]), true],
    [queryKeys.documentList('a', { tagIdsAll: [2] }), true],
    [queryKeys.document('a', 2), true],
    [queryKeys.notes('a', 2), true],
    [queryKeys.uiSettings('a'), true],
    [queryKeys.documentList('a', { query: 'hydro' }), false],
    [queryKeys.documentCount('a', { tagIdsAll: [2] }), false],
    [queryKeys.autocomplete('a', 'hyd'), false],
  ])('%j is %s', (key, expected) => {
    expect(shouldPersist(key)).toBe(expected);
  });
});

test('every key is scoped by its account, and the list prefix covers the inbox and every list', () => {
  const prefix = queryKeys.allDocumentLists('a');
  for (const key of [queryKeys.inbox('a', [1]), queryKeys.documentList('a', {}), queryKeys.documentCount('a', {})]) {
    expect(key.slice(0, prefix.length)).toEqual(prefix);
  }
  expect(queryKeys.document('a', 2)).not.toEqual(queryKeys.document('b', 2));
});
