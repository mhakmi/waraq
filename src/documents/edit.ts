import type { DocumentChanges } from '../paperless/client';
import type { DocumentDetail, IsoDate } from '../paperless/schemas';

export type EditableFields = {
  title: string;
  created: IsoDate;
  correspondentId: number | null;
  documentTypeId: number | null;
  storagePathId: number | null;
  tagIds: number[];
  archiveSerialNumber: number | null;
};

export function editableFields(document: DocumentDetail): EditableFields {
  return {
    title: document.title,
    created: document.created,
    correspondentId: document.correspondentId,
    documentTypeId: document.documentTypeId,
    storagePathId: document.storagePathId,
    tagIds: document.tagIds,
    archiveSerialNumber: document.archiveSerialNumber,
  };
}

function sameTags(first: number[], second: number[]): boolean {
  const set = new Set(first);
  return set.size === new Set(second).size && second.every((id) => set.has(id));
}

export function documentChanges(original: EditableFields, draft: EditableFields): DocumentChanges {
  const changes: DocumentChanges = {};
  const title = draft.title.trim();
  if (title !== original.title) {
    changes.title = title;
  }
  if (draft.created !== original.created) {
    changes.created = draft.created;
  }
  if (draft.correspondentId !== original.correspondentId) {
    changes.correspondentId = draft.correspondentId;
  }
  if (draft.documentTypeId !== original.documentTypeId) {
    changes.documentTypeId = draft.documentTypeId;
  }
  if (draft.storagePathId !== original.storagePathId) {
    changes.storagePathId = draft.storagePathId;
  }
  if (!sameTags(draft.tagIds, original.tagIds)) {
    changes.tagIds = draft.tagIds;
  }
  if (draft.archiveSerialNumber !== original.archiveSerialNumber) {
    changes.archiveSerialNumber = draft.archiveSerialNumber;
  }
  return changes;
}

const largestArchiveNumber = 4_294_967_295;

export function parseArchiveNumber(text: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false };
  }
  const value = Number(trimmed);
  return value <= largestArchiveNumber ? { ok: true, value } : { ok: false };
}
