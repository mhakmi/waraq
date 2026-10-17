import type { UploadFields } from '../paperless/client';
import type { CustomFieldValue, IsoDate } from '../paperless/schemas';
import type { AccountId, BatchId, JobId } from '../upload/machine';

export type ScannedPage = { uri: string; width: number; height: number };

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

export type DraftDocument = { id: JobId; pages: ScannedPage[]; metadata: DocumentMetadata };

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

function mergeCustomFields(
  batchFields: CustomFieldValue[] = [],
  documentFields: CustomFieldValue[] = [],
): CustomFieldValue[] {
  const byField = new Map<number, CustomFieldValue>();
  for (const field of [...batchFields, ...documentFields]) {
    byField.set(field.fieldId, field);
  }
  return Array.from(byField.values());
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
    customFields: mergeCustomFields(shared.customFields, own.customFields),
  };
}
