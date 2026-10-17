import type { DocumentOrderField, DocumentQuery } from '../paperless/client';
import type { IsoDate } from '../paperless/schemas';

export type TagMode = 'all' | 'any';

export type DocumentFilter = {
  text: string;
  tagIds: number[];
  tagMode: TagMode;
  correspondentId: number | null;
  documentTypeId: number | null;
  storagePathId: number | null;
  createdFrom: IsoDate | null;
  createdTo: IsoDate | null;
};

export const emptyFilter: DocumentFilter = {
  text: '',
  tagIds: [],
  tagMode: 'all',
  correspondentId: null,
  documentTypeId: null,
  storagePathId: null,
  createdFrom: null,
  createdTo: null,
};

export const sortChoices = ['newest', 'oldest', 'added', 'title'] as const;
export type SortChoice = (typeof sortChoices)[number];
export type ListOrder = SortChoice | 'server';

const sortOrders: Record<SortChoice, { field: DocumentOrderField; descending: boolean }> = {
  newest: { field: 'created', descending: true },
  oldest: { field: 'created', descending: false },
  added: { field: 'added', descending: true },
  title: { field: 'title', descending: false },
};

export function documentQuery(
  filter: DocumentFilter,
  order: ListOrder,
  savedViewDefaults?: Record<string, string>,
): DocumentQuery {
  const text = filter.text.trim();
  const tags = filter.tagIds.length > 0 ? filter.tagIds : undefined;
  return {
    query: text === '' ? undefined : text,
    tagIdsAll: filter.tagMode === 'all' ? tags : undefined,
    tagIdsAny: filter.tagMode === 'any' ? tags : undefined,
    correspondentId: filter.correspondentId ?? undefined,
    documentTypeId: filter.documentTypeId ?? undefined,
    storagePathId: filter.storagePathId ?? undefined,
    createdFrom: filter.createdFrom ?? undefined,
    createdTo: filter.createdTo ?? undefined,
    orderBy: order === 'server' ? undefined : sortOrders[order],
    savedViewDefaults,
  };
}

export function activeFilterCount(filter: DocumentFilter): number {
  const set = [
    filter.tagIds.length > 0,
    filter.correspondentId !== null,
    filter.documentTypeId !== null,
    filter.storagePathId !== null,
    filter.createdFrom !== null || filter.createdTo !== null,
  ];
  return set.filter(Boolean).length;
}
