import { expect, test } from 'vitest';

import { recentSearchLimit, withRecentSearch } from './recent';

test('a search goes first, once, whatever its letter case', () => {
  expect(withRecentSearch(['lease', 'Hydro', 'warranty'], ' hydro ')).toEqual(['hydro', 'lease', 'warranty']);
});

test('a blank search is not kept', () => {
  expect(withRecentSearch(['lease'], '   ')).toEqual(['lease']);
});

test('the list keeps only the newest searches', () => {
  const full = Array.from({ length: recentSearchLimit }, (_, index) => `term ${index}`);
  const next = withRecentSearch(full, 'new');
  expect(next).toHaveLength(recentSearchLimit);
  expect(next[0]).toBe('new');
  expect(next).not.toContain(`term ${recentSearchLimit - 1}`);
});
