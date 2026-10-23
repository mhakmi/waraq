import { describe, expect, test } from 'vitest';

import { documentQueryParameters } from '../paperless/client';
import type { IsoDate } from '../paperless/schemas';
import { activeFilterCount, documentQuery, type DocumentFilter, emptyFilter, type ListOrder } from './filter';

function parametersFor(filter: DocumentFilter, order: ListOrder, view?: Record<string, string>) {
  const { fields, truncate_content, ...rest } = documentQueryParameters(documentQuery(filter, order, view));
  return rest;
}

describe('documentQuery', () => {
  test('an empty filter sends only the sort', () => {
    expect(parametersFor(emptyFilter, 'newest')).toEqual({ ordering: '-created' });
  });

  test('every field becomes its Paperless-ngx parameter', () => {
    const filter: DocumentFilter = {
      text: '  hydro  ',
      tagIds: [2, 5],
      tagMode: 'all',
      correspondentId: 9,
      documentTypeId: 4,
      storagePathId: 3,
      createdFrom: '2026-01-01' as IsoDate,
      createdTo: '2026-12-31' as IsoDate,
    };
    expect(parametersFor(filter, 'title')).toEqual({
      query: 'hydro',
      tags__id__all: '2,5',
      correspondent__id: 9,
      document_type__id: 4,
      storage_path__id: 3,
      created__date__gte: '2026-01-01',
      created__date__lte: '2026-12-31',
      ordering: 'title',
    });
  });

  test('has any sends the tags as tags__id__in', () => {
    expect(parametersFor({ ...emptyFilter, tagIds: [2, 5], tagMode: 'any' }, 'oldest')).toEqual({
      tags__id__in: '2,5',
      ordering: 'created',
    });
  });

  test('blank text and the server order leave the server to order by best match', () => {
    expect(parametersFor({ ...emptyFilter, text: '   ' }, 'server')).toEqual({});
    expect(parametersFor({ ...emptyFilter, text: 'lease' }, 'server')).toEqual({ query: 'lease' });
  });

  test('a saved view supplies parameters, and the filter and sort win where both set one', () => {
    const view = { tags__id__all: '7', ordering: 'title', is_in_inbox: '1' };
    expect(parametersFor({ ...emptyFilter, tagIds: [2] }, 'added', view)).toEqual({
      tags__id__all: '2',
      ordering: '-added',
      is_in_inbox: '1',
    });
    expect(parametersFor(emptyFilter, 'server', view)).toEqual(view);
  });
});

test('activeFilterCount counts a created range once and ignores the search text', () => {
  expect(activeFilterCount({ ...emptyFilter, text: 'hydro' })).toBe(0);
  expect(
    activeFilterCount({
      ...emptyFilter,
      tagIds: [1],
      correspondentId: 2,
      createdFrom: '2026-01-01' as IsoDate,
      createdTo: '2026-02-01' as IsoDate,
    }),
  ).toBe(3);
});
