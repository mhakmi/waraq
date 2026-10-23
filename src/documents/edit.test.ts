import { describe, expect, test } from 'vitest';

import type { CustomField, CustomFieldValue, IsoDate } from '../paperless/schemas';
import { addedField, customFieldChanges, customFieldEdits, documentChanges, type EditableFields, parseArchiveNumber } from './edit';

const original: EditableFields = {
  title: 'Electricity bill, September',
  created: '2026-09-27' as IsoDate,
  correspondentId: 9,
  documentTypeId: 1,
  storagePathId: null,
  tagIds: [2, 3, 1],
  archiveSerialNumber: 12,
};

describe('documentChanges', () => {
  test('an untouched form changes nothing', () => {
    expect(documentChanges(original, { ...original })).toEqual({});
  });

  test('holds only the fields that differ', () => {
    expect(documentChanges(original, { ...original, title: 'Electricity bill, September 2026', documentTypeId: null })).toEqual({
      title: 'Electricity bill, September 2026',
      documentTypeId: null,
    });
  });

  test('the same tags in another order are no change, and a removed tag is', () => {
    expect(documentChanges(original, { ...original, tagIds: [1, 2, 3] })).toEqual({});
    expect(documentChanges(original, { ...original, tagIds: [2, 3] })).toEqual({ tagIds: [2, 3] });
  });

  test('spaces around the title are dropped before comparing', () => {
    expect(documentChanges(original, { ...original, title: '  Electricity bill, September ' })).toEqual({});
  });

  test('every field can change at once', () => {
    const draft: EditableFields = {
      title: 'New',
      created: '2026-01-01' as IsoDate,
      correspondentId: null,
      documentTypeId: 2,
      storagePathId: 4,
      tagIds: [5],
      archiveSerialNumber: null,
    };
    expect(documentChanges(original, draft)).toEqual(draft);
  });
});

describe('parseArchiveNumber', () => {
  test.each([
    ['', { ok: true, value: null }],
    [' 12 ', { ok: true, value: 12 }],
    ['0', { ok: true, value: 0 }],
    ['4294967295', { ok: true, value: 4294967295 }],
    ['4294967296', { ok: false }],
    ['-3', { ok: false }],
    ['1.5', { ok: false }],
    ['12a', { ok: false }],
  ])('%j reads as %j', (text, expected) => {
    expect(parseArchiveNumber(text)).toEqual(expected);
  });
});

describe('customFieldChanges', () => {
  const definitions: CustomField[] = [
    { id: 1, name: 'Amount due', dataType: 'monetary', selectOptions: [], defaultCurrency: 'CAD', documentCount: 1 },
    { id: 2, name: 'Paid', dataType: 'boolean', selectOptions: [], defaultCurrency: null, documentCount: 1 },
    { id: 3, name: 'Count', dataType: 'integer', selectOptions: [], defaultCurrency: null, documentCount: 1 },
    { id: 4, name: 'Newer', dataType: 'unsupported', selectOptions: [], defaultCurrency: null, documentCount: 1 },
  ];
  const stored: CustomFieldValue[] = [
    { fieldId: 1, value: '83.6' },
    { fieldId: 2, value: null },
    { fieldId: 4, value: { any: 'shape' } as never },
  ];

  test('untouched fields change nothing, even a value the app would write another way', () => {
    const result = customFieldChanges(stored, customFieldEdits(stored, definitions), definitions);
    expect(result).toEqual({ changed: new Set(), problems: new Map(), values: null });
  });

  test('one change sends the whole set, with untouched and unknown values as they came', () => {
    const edits = customFieldEdits(stored, definitions).map((edit) =>
      edit.fieldId === 2 ? { ...edit, draft: { type: 'toggle' as const, on: true } } : edit,
    );
    const result = customFieldChanges(stored, edits, definitions);
    expect(result.changed).toEqual(new Set([2]));
    expect(result.values).toEqual([
      { fieldId: 1, value: '83.6' },
      { fieldId: 2, value: true },
      { fieldId: 4, value: { any: 'shape' } },
    ]);
  });

  test('adding and removing fields count as changes', () => {
    const edits = [...customFieldEdits(stored, definitions).filter((edit) => edit.fieldId !== 1), addedField(definitions[2])];
    const result = customFieldChanges(stored, edits, definitions);
    expect(result.changed).toEqual(new Set([1, 3]));
    expect(result.values).toEqual([
      { fieldId: 2, value: null },
      { fieldId: 4, value: { any: 'shape' } },
      { fieldId: 3, value: null },
    ]);
  });

  test('a draft that does not check holds the save back', () => {
    const edits = [...customFieldEdits(stored, definitions), { fieldId: 3, draft: { type: 'text' as const, text: '1.5', input: 'number' as const } }];
    const result = customFieldChanges(stored, edits, definitions);
    expect(result.problems).toEqual(new Map([[3, 'notWholeNumber']]));
    expect(result.values).toBeNull();
  });
});
