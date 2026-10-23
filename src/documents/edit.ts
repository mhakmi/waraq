import type { DocumentChanges } from '../paperless/client';
import type { CustomField, CustomFieldValue, DocumentDetail, IsoDate } from '../paperless/schemas';
import { type Draft, type Problem, readValue, writeDraft } from './customFields';

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

export type CustomFieldEdit = { fieldId: number; draft: Draft | null };

export function customFieldEdits(values: CustomFieldValue[], fields: CustomField[]): CustomFieldEdit[] {
  return values.map((entry) => {
    const field = fields.find((candidate) => candidate.id === entry.fieldId);
    return { fieldId: entry.fieldId, draft: field === undefined ? null : readValue(field, entry.value) };
  });
}

export function addedField(field: CustomField): CustomFieldEdit {
  return { fieldId: field.id, draft: readValue(field, null) };
}

export type CustomFieldChanges = {
  changed: Set<number>;
  problems: Map<number, Problem>;
  // Paperless replaces the document's whole set, so this holds every field.
  values: CustomFieldValue[] | null;
};

export function customFieldChanges(original: CustomFieldValue[], edits: CustomFieldEdit[], fields: CustomField[]): CustomFieldChanges {
  const changed = new Set<number>();
  const problems = new Map<number, Problem>();
  const values: CustomFieldValue[] = [];
  for (const edit of edits) {
    const before = original.find((entry) => entry.fieldId === edit.fieldId);
    const field = fields.find((candidate) => candidate.id === edit.fieldId);
    if (edit.draft === null || field === undefined) {
      values.push(before ?? { fieldId: edit.fieldId, value: null });
      continue;
    }
    const untouched = before !== undefined && JSON.stringify(readValue(field, before.value)) === JSON.stringify(edit.draft);
    if (untouched) {
      values.push(before);
      continue;
    }
    changed.add(edit.fieldId);
    const result = writeDraft(field, edit.draft);
    if (result.ok) {
      values.push({ fieldId: edit.fieldId, value: result.value });
    } else {
      problems.set(edit.fieldId, result.problem);
    }
  }
  for (const entry of original) {
    if (!edits.some((edit) => edit.fieldId === entry.fieldId)) {
      changed.add(entry.fieldId);
    }
  }
  return { changed, problems, values: changed.size === 0 || problems.size > 0 ? null : values };
}
