import { describe, expect, test } from 'vitest';

import { documentQueryParameters } from '../paperless/client';
import type { IsoDate, SavedView } from '../paperless/schemas';
import { documentQuery, emptyFilter } from './filter';
import { viewParameters, viewRules } from './views';

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

describe('viewRules', () => {
  function listParameters(parameters: Record<string, unknown>) {
    const { page, page_size, fields, truncate_content, ...rest } = parameters;
    return Object.fromEntries(Object.entries(rest).flatMap(([name, value]) => (value === undefined ? [] : [[name, String(value)]])));
  }

  test('a search, filters, and a sort saved as a view give back the same parameters', () => {
    const query = documentQuery(
      {
        ...emptyFilter,
        text: 'hydro bill',
        tagIds: [2, 5],
        correspondentId: 9,
        documentTypeId: 3,
        storagePathId: 4,
        createdFrom: '2026-01-01' as IsoDate,
        createdTo: '2026-12-31' as IsoDate,
      },
      'oldest',
    );
    const sent = documentQueryParameters(query);
    const rules = viewRules(sent);
    if (!rules.ok) {
      throw new Error(`unknown parameters ${rules.unknownParameters}`);
    }
    expect(rules.view.sortField).toBe('created');
    expect(rules.view.sortReverse).toBe(false);
    const back = viewParameters(rules.view);
    expect(back.ok && back.parameters).toEqual(listParameters(sent));
  });

  test('a saved view with filters on top keeps both, and none-set rules stay none-set', () => {
    const saved = viewParameters(view([[3, null], [22, '7'], [22, '8']], 'title', false));
    if (!saved.ok) {
      throw new Error('the view did not read');
    }
    const sent = documentQueryParameters({ ...documentQuery({ ...emptyFilter, documentTypeId: 2 }, 'server', saved.parameters) });
    const rules = viewRules(sent);
    const back = rules.ok ? viewParameters(rules.view) : null;
    expect(back?.ok && back.parameters).toEqual(listParameters(sent));
    expect(rules.ok && rules.view.filterRules).toEqual(
      expect.arrayContaining([
        { ruleType: 3, value: null },
        { ruleType: 22, value: '7' },
        { ruleType: 22, value: '8' },
        { ruleType: 4, value: '2' },
      ]),
    );
  });

  test('a parameter the rule table does not know is named', () => {
    expect(viewRules({ id__in: '1,2' })).toEqual({ ok: false, unknownParameters: ['id__in'] });
  });
});
