import { describe, expect, test } from 'vitest';

import type { SavedView } from '../paperless/schemas';
import { viewParameters } from './views';

function view(rules: [number, string | null][], sortField: string | null = 'created', sortReverse = true): SavedView {
  return {
    id: 1,
    name: 'View',
    sortField,
    sortReverse,
    filterRules: rules.map(([ruleType, value]) => ({ ruleType, value })),
    pageSize: null,
  };
}

describe('viewParameters', () => {
  test('joins repeated tag rules and adds the view order', () => {
    expect(viewParameters(view([[6, '2'], [6, '5'], [3, '9']]))).toEqual({
      ok: true,
      parameters: { tags__id__all: '2,5', correspondent__id: '9', ordering: '-created' },
    });
  });

  test('an empty correspondent, type, or storage path means none is set', () => {
    expect(viewParameters(view([[3, null], [4, null], [25, null]], 'title', false))).toEqual({
      ok: true,
      parameters: {
        correspondent__isnull: '1',
        document_type__isnull: '1',
        storage_path__isnull: '1',
        ordering: 'title',
      },
    });
  });

  test('date, text, and inbox rules pass their value through', () => {
    expect(viewParameters(view([[44, '2026-01-01'], [43, '2026-06-30'], [20, 'hydro'], [5, '1']], null))).toEqual({
      ok: true,
      parameters: {
        created__date__gte: '2026-01-01',
        created__date__lte: '2026-06-30',
        query: 'hydro',
        is_in_inbox: '1',
      },
    });
  });

  test('a rule type this app does not know makes the view unusable instead of wrong', () => {
    expect(viewParameters(view([[6, '2'], [99, 'x']]))).toEqual({ ok: false, unknownRuleTypes: [99] });
  });
});
