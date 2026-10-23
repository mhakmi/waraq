import { z } from 'zod';

import type { Rotation } from '../../modules/scanner';
import type { UploadFields } from '../paperless/client';
import type { CustomFieldValue, IsoDate } from '../paperless/schemas';
import type { AccountId } from '../account/id';
import type { BatchId, JobId } from '../upload/machine';

export type { Rotation };

export const PageId = z.string().min(1).brand<'PageId'>();
export type PageId = z.infer<typeof PageId>;

export type ScannedPage = {
  id: PageId;
  uri: string;
  width: number;
  height: number;
  rotation: Rotation;
};

export type PdfFile = { uri: string; name: string; pageCount: number; thumbnailUri: string };

export type DocumentMetadata = {
  title?: string;
  created?: IsoDate;
  correspondentId?: number | null;
  documentTypeId?: number | null;
  storagePathId?: number | null;
  tagIds?: number[];
  archiveSerialNumber?: number | null;
  customFields?: CustomFieldValue[];
};

export type PagesDocument = { kind: 'pages'; id: JobId; pages: ScannedPage[]; metadata: DocumentMetadata };

export type PdfDocument = { kind: 'pdf'; id: JobId; pdf: PdfFile; metadata: DocumentMetadata };

export type DraftDocument = PagesDocument | PdfDocument;

export type Batch = {
  id: BatchId;
  accountId: AccountId;
  createdAt: number;
  shared: DocumentMetadata;
  documents: DraftDocument[];
};

function choose<Value>(documentValue: Value | null | undefined, batchValue: Value | null | undefined): Value | null {
  if (documentValue !== undefined) {
    return documentValue;
  }
  return batchValue ?? null;
}

function chooseTitle(documentTitle: string | undefined, batchTitle: string | undefined, defaultTitle: string): string {
  for (const title of [documentTitle, batchTitle]) {
    if (title !== undefined && title.trim() !== '') {
      return title.trim();
    }
  }
  return defaultTitle;
}

export type ResolvedCustomField = {
  fieldId: number;
  value: CustomFieldValue['value'];
  fromBatch: boolean;
};

export function resolveCustomFields(batchFields: CustomFieldValue[] = [], documentFields: CustomFieldValue[] = []): ResolvedCustomField[] {
  const resolved = batchFields.map((entry) => {
    const own = documentFields.find((candidate) => candidate.fieldId === entry.fieldId);
    return own === undefined ? { ...entry, fromBatch: true } : { ...own, fromBatch: false };
  });
  for (const own of documentFields) {
    if (!batchFields.some((entry) => entry.fieldId === own.fieldId)) {
      resolved.push({ ...own, fromBatch: false });
    }
  }
  return resolved;
}

function uploadCustomFields(batchFields: CustomFieldValue[] | undefined, documentFields: CustomFieldValue[] | undefined): CustomFieldValue[] {
  return resolveCustomFields(batchFields, documentFields).flatMap((entry) =>
    entry.value === null ? [] : [{ fieldId: entry.fieldId, value: entry.value }],
  );
}

export function withCustomField(entries: CustomFieldValue[] = [], fieldId: number, value: CustomFieldValue['value']): CustomFieldValue[] {
  const others = entries.filter((entry) => entry.fieldId !== fieldId);
  const index = entries.findIndex((entry) => entry.fieldId === fieldId);
  const position = index === -1 ? others.length : index;
  return [...others.slice(0, position), { fieldId, value }, ...others.slice(position)];
}

export function withoutCustomField(entries: CustomFieldValue[] = [], fieldId: number): CustomFieldValue[] {
  return entries.filter((entry) => entry.fieldId !== fieldId);
}

export function resolveUploadFields(batch: Batch, document: DraftDocument, defaultTitle: string): UploadFields {
  const shared = batch.shared;
  const own = document.metadata;
  return {
    title: chooseTitle(own.title, shared.title, defaultTitle),
    created: choose(own.created, shared.created),
    correspondentId: choose(own.correspondentId, shared.correspondentId),
    documentTypeId: choose(own.documentTypeId, shared.documentTypeId),
    storagePathId: choose(own.storagePathId, shared.storagePathId),
    tagIds: Array.from(new Set([...(shared.tagIds ?? []), ...(own.tagIds ?? [])])),
    archiveSerialNumber: choose(own.archiveSerialNumber, shared.archiveSerialNumber),
    customFields: uploadCustomFields(shared.customFields, own.customFields),
  };
}

export function pageCount(document: DraftDocument): number {
  return document.kind === 'pages' ? document.pages.length : document.pdf.pageCount;
}

export function filesOf(document: DraftDocument): string[] {
  if (document.kind === 'pages') {
    return document.pages.map((page) => page.uri);
  }
  return [document.pdf.uri, document.pdf.thumbnailUri];
}

export function batchFiles(batch: Batch | null): string[] {
  return batch === null ? [] : batch.documents.flatMap(filesOf);
}

export function filesLeftBehind(before: Batch | null, after: Batch | null): string[] {
  const kept = new Set(batchFiles(after));
  return batchFiles(before).filter((uri) => !kept.has(uri));
}

// Upload makes the jobs, then clears the batch. A batch with jobs for some of its documents lost that second step.
export function withoutQueuedDocuments(batch: Batch, queued: ReadonlySet<JobId>): Batch | null {
  const documents = batch.documents.filter((document) => !queued.has(document.id));
  if (documents.length === batch.documents.length) {
    return batch;
  }
  return documents.length === 0 ? null : { ...batch, documents };
}

export function newBatch(id: BatchId, accountId: AccountId, now: number): Batch {
  return { id, accountId, createdAt: now, shared: {}, documents: [] };
}

export function addDocument(batch: Batch, document: DraftDocument): Batch {
  return { ...batch, documents: [...batch.documents, document] };
}

export function removeDocument(batch: Batch, documentId: JobId): Batch {
  return { ...batch, documents: batch.documents.filter((document) => document.id !== documentId) };
}

function changePages(batch: Batch, documentId: JobId, change: (pages: ScannedPage[]) => ScannedPage[]): Batch {
  const documents = batch.documents.flatMap((document): DraftDocument[] => {
    if (document.id !== documentId || document.kind !== 'pages') {
      return [document];
    }
    const pages = change(document.pages);
    return pages.length === 0 ? [] : [{ ...document, pages }];
  });
  return { ...batch, documents };
}

export function addPages(batch: Batch, documentId: JobId, pages: ScannedPage[]): Batch {
  return changePages(batch, documentId, (current) => [...current, ...pages]);
}

export function rotatePage(batch: Batch, documentId: JobId, pageId: PageId): Batch {
  return changePages(batch, documentId, (pages) =>
    pages.map((page) => (page.id === pageId ? { ...page, rotation: ((page.rotation + 90) % 360) as Rotation } : page)),
  );
}

export function deletePage(batch: Batch, documentId: JobId, pageId: PageId): Batch {
  return changePages(batch, documentId, (pages) => pages.filter((page) => page.id !== pageId));
}

export function replacePage(batch: Batch, documentId: JobId, pageId: PageId, replacement: ScannedPage): Batch {
  return changePages(batch, documentId, (pages) => pages.map((page) => (page.id === pageId ? replacement : page)));
}

export function movePage(batch: Batch, documentId: JobId, pageId: PageId, toIndex: number): Batch {
  return changePages(batch, documentId, (pages) => {
    const page = pages.find((candidate) => candidate.id === pageId);
    if (page === undefined || toIndex < 0 || toIndex >= pages.length) {
      return pages;
    }
    const others = pages.filter((candidate) => candidate.id !== pageId);
    return [...others.slice(0, toIndex), page, ...others.slice(toIndex)];
  });
}

export function movePageToDocument(batch: Batch, fromId: JobId, pageId: PageId, toId: JobId): Batch {
  const source = batch.documents.find((document) => document.id === fromId);
  const target = batch.documents.find((document) => document.id === toId);
  const page = source?.kind === 'pages' ? source.pages.find((candidate) => candidate.id === pageId) : undefined;
  if (page === undefined || target?.kind !== 'pages' || fromId === toId) {
    return batch;
  }
  return deletePage(addPages(batch, toId, [page]), fromId, pageId);
}

export function splitDocument(batch: Batch, documentId: JobId, firstPageOfNew: number, newId: JobId): Batch {
  const index = batch.documents.findIndex((document) => document.id === documentId);
  const document = batch.documents[index];
  if (document?.kind !== 'pages' || firstPageOfNew <= 0 || firstPageOfNew >= document.pages.length) {
    return batch;
  }
  const kept: PagesDocument = { ...document, pages: document.pages.slice(0, firstPageOfNew) };
  const split: PagesDocument = { kind: 'pages', id: newId, pages: document.pages.slice(firstPageOfNew), metadata: {} };
  const documents = [...batch.documents.slice(0, index), kept, split, ...batch.documents.slice(index + 1)];
  return { ...batch, documents };
}

export function setShared(batch: Batch, change: DocumentMetadata): Batch {
  return { ...batch, shared: { ...batch.shared, ...change } };
}

export function setOwn(batch: Batch, documentId: JobId, change: DocumentMetadata): Batch {
  const documents = batch.documents.map((document) =>
    document.id === documentId ? { ...document, metadata: { ...document.metadata, ...change } } : document,
  );
  return { ...batch, documents };
}
