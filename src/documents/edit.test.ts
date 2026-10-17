import { describe, expect, test } from 'vitest';

import type { IsoDate } from '../paperless/schemas';
import { documentChanges, type EditableFields, parseArchiveNumber } from './edit';

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
