import type { InfiniteData } from '@tanstack/react-query';

import type { DocumentSummary } from '../paperless/schemas';

export type DocumentPage = { count: number; items: DocumentSummary[]; hasNextPage: boolean };
export type DocumentPages = InfiniteData<DocumentPage, number>;
export type RowPosition = { page: number; index: number };

export function tagsAfterDone(tagIds: number[], inboxTagIds: number[]): number[] {
  return tagIds.filter((id) => !inboxTagIds.includes(id));
}

export function positionOf(data: DocumentPages | undefined, id: number): RowPosition | null {
  for (const [page, items] of (data?.pages ?? []).entries()) {
    const index = items.items.findIndex((item) => item.id === id);
    if (index !== -1) {
      return { page, index };
    }
  }
  return null;
}

export function withoutDocument(data: DocumentPages | undefined, id: number): DocumentPages | undefined {
  if (data === undefined || positionOf(data, id) === null) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      count: page.count - 1,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

export function withDocumentAt(
  data: DocumentPages | undefined,
  document: DocumentSummary,
  position: RowPosition,
): DocumentPages | undefined {
  if (data === undefined || positionOf(data, document.id) !== null || position.page >= data.pages.length) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page, index) => ({
      ...page,
      count: page.count + 1,
      items:
        index === position.page
          ? [...page.items.slice(0, position.index), document, ...page.items.slice(position.index)]
          : page.items,
    })),
  };
}
