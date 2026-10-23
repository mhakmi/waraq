import type { LabelChanges, LabelKind } from '../paperless/client';
import type { CustomFieldDataType } from '../paperless/schemas';

export type LabelEditor = 'color' | 'inboxTag' | 'pathTemplate' | 'fieldType';

export const labelEditors: Record<LabelKind, LabelEditor[]> = {
  tags: ['color', 'inboxTag'],
  correspondents: [],
  documentTypes: [],
  storagePaths: ['pathTemplate'],
  customFields: ['fieldType'],
};

export const labelKindOrder: LabelKind[] = ['tags', 'correspondents', 'documentTypes', 'storagePaths', 'customFields'];

export function isLabelKind(value: string): value is LabelKind {
  return (labelKindOrder as string[]).includes(value);
}

export type LabelItem = {
  id: number;
  name: string;
  documentCount: number;
  color?: string;
  isInboxTag?: boolean;
  path?: string;
  dataType?: CustomFieldDataType | 'unsupported';
  selectOptions?: { id: string; label: string }[];
};

export type LabelDraft = {
  name: string;
  color: string;
  isInboxTag: boolean;
  path: string;
  dataType: CustomFieldDataType;
  selectOptions: string[];
};

export const tagColors = [
  '#a6cee3',
  '#1f78b4',
  '#b2df8a',
  '#33a02c',
  '#fb9a99',
  '#e31a1c',
  '#fdbf6f',
  '#ff7f00',
  '#cab2d6',
  '#6a3d9a',
  '#b15928',
  '#000000',
] as const;

export function draftFor(item: LabelItem | null): LabelDraft {
  const dataType = item?.dataType;
  return {
    name: item?.name ?? '',
    color: item?.color ?? tagColors[1],
    isInboxTag: item?.isInboxTag ?? false,
    path: item?.path ?? '',
    dataType: dataType === undefined || dataType === 'unsupported' ? 'string' : dataType,
    selectOptions: item?.selectOptions?.map((option) => option.label) ?? ['', ''],
  };
}

export type DraftProblem = 'nameMissing' | 'pathMissing' | 'optionsMissing';

function filledOptions(draft: LabelDraft): string[] {
  return draft.selectOptions.map((option) => option.trim()).filter((option) => option !== '');
}

export function draftProblem(kind: LabelKind, draft: LabelDraft, creating: boolean): DraftProblem | null {
  const editors = labelEditors[kind];
  if (draft.name.trim() === '') {
    return 'nameMissing';
  }
  if (editors.includes('pathTemplate') && draft.path.trim() === '') {
    return 'pathMissing';
  }
  if (creating && editors.includes('fieldType') && draft.dataType === 'select' && filledOptions(draft).length === 0) {
    return 'optionsMissing';
  }
  return null;
}

function editableFields(kind: LabelKind, draft: LabelDraft): LabelChanges {
  const editors = labelEditors[kind];
  return {
    name: draft.name.trim(),
    color: editors.includes('color') ? draft.color : undefined,
    isInboxTag: editors.includes('inboxTag') ? draft.isInboxTag : undefined,
    path: editors.includes('pathTemplate') ? draft.path.trim() : undefined,
  };
}

function typeFields(kind: LabelKind, draft: LabelDraft): LabelChanges {
  if (!labelEditors[kind].includes('fieldType')) {
    return {};
  }
  const options = draft.dataType === 'select' ? filledOptions(draft).map((label) => ({ label })) : undefined;
  return { dataType: draft.dataType, selectOptions: options };
}

export function changesFor(kind: LabelKind, item: LabelItem | null, draft: LabelDraft): LabelChanges {
  if (item === null) {
    return { ...editableFields(kind, draft), ...typeFields(kind, draft) };
  }
  const before = editableFields(kind, draftFor(item));
  const after = editableFields(kind, draft);
  const changes: LabelChanges = {
    name: after.name === before.name ? undefined : after.name,
    color: after.color === before.color ? undefined : after.color,
    isInboxTag: after.isInboxTag === before.isInboxTag ? undefined : after.isInboxTag,
    path: after.path === before.path ? undefined : after.path,
  };
  // Paperless-ngx 3.3.2 refuses a change to a select field that leaves its options out.
  if (item.dataType === 'select' && hasChanges(changes)) {
    changes.selectOptions = item.selectOptions;
  }
  return changes;
}

export function hasChanges(changes: LabelChanges): boolean {
  return Object.values(changes).some((value) => value !== undefined);
}
