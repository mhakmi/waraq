import type { QueryKey } from '@tanstack/react-query';

import type { DocumentQuery, LabelKind } from '../paperless/client';

export const queryKeys = {
  labels: (accountId: string, kind: LabelKind) => [accountId, 'labels', kind] as const,
  savedViews: (accountId: string) => [accountId, 'savedViews'] as const,
  allDocumentLists: (accountId: string) => [accountId, 'documents'] as const,
  inbox: (accountId: string, tagIds: number[]) => [accountId, 'documents', 'inbox', tagIds] as const,
  documentList: (accountId: string, query: DocumentQuery) => [accountId, 'documents', 'list', query] as const,
  documentCount: (accountId: string, query: DocumentQuery) => [accountId, 'documents', 'count', query] as const,
  allDocumentDetails: (accountId: string) => [accountId, 'document'] as const,
  document: (accountId: string, id: number) => [accountId, 'document', id] as const,
  notes: (accountId: string, id: number) => [accountId, 'notes', id] as const,
  autocomplete: (accountId: string, term: string) => [accountId, 'autocomplete', term] as const,
  uiSettings: (accountId: string) => [accountId, 'uiSettings'] as const,
};

function isFullTextList(key: QueryKey): boolean {
  const query = key[3];
  return typeof query === 'object' && query !== null && 'query' in query && query.query !== undefined;
}

export function shouldPersist(key: QueryKey): boolean {
  switch (key[1]) {
    case 'labels':
    case 'savedViews':
    case 'document':
    case 'notes':
    case 'uiSettings':
      return true;
    case 'documents':
      return (key[2] === 'inbox' || key[2] === 'list') && !isFullTextList(key);
    default:
      return false;
  }
}

export function thumbnailCacheKey(serverUrl: string, id: number, modified: string): string {
  return `${serverUrl}/${id}/${modified}`;
}
