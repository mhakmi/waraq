import { describe, expect, test } from 'vitest';

import { changesFor, draftFor, draftProblem, hasChanges, type LabelItem } from './labelKinds';

const tag: LabelItem = { id: 4, name: 'Bills', documentCount: 3, color: '#1f78b4', isInboxTag: false };
const selectField: LabelItem = {
  id: 7,
  name: 'Paid with',
  documentCount: 0,
  dataType: 'select',
  selectOptions: [
    { id: 'a1', label: 'Card' },
    { id: 'b2', label: 'Cash' },
  ],
};

describe('changesFor a new label', () => {
  test('a tag sends its name, color, and inbox flag', () => {
    const draft = { ...draftFor(null), name: ' Taxes ', color: '#e31a1c', isInboxTag: true };
    expect(JSON.parse(JSON.stringify(changesFor('tags', null, draft)))).toEqual({
      name: 'Taxes',
      color: '#e31a1c',
      isInboxTag: true,
    });
  });

  test('a correspondent sends only its name, whatever else the draft holds', () => {
    const draft = { ...draftFor(null), name: 'Northfield Hydro', path: 'ignored', isInboxTag: true };
    expect(JSON.parse(JSON.stringify(changesFor('correspondents', null, draft)))).toEqual({ name: 'Northfield Hydro' });
  });

  test('a select field sends its type and the options that are filled in', () => {
    const draft = { ...draftFor(null), name: 'Paid with', dataType: 'select' as const, selectOptions: ['Card', ' ', ' Cash '] };
    expect(JSON.parse(JSON.stringify(changesFor('customFields', null, draft)))).toEqual({
      name: 'Paid with',
      dataType: 'select',
      selectOptions: [{ label: 'Card' }, { label: 'Cash' }],
    });
  });

  test('a text field sends no options', () => {
    const draft = { ...draftFor(null), name: 'Account number', dataType: 'string' as const, selectOptions: ['left over'] };
    expect(JSON.parse(JSON.stringify(changesFor('customFields', null, draft)))).toEqual({
      name: 'Account number',
      dataType: 'string',
    });
  });
});

describe('changesFor an existing label', () => {
  test('an untouched draft changes nothing', () => {
    expect(hasChanges(changesFor('tags', tag, draftFor(tag)))).toBe(false);
    expect(hasChanges(changesFor('customFields', selectField, draftFor(selectField)))).toBe(false);
  });

  test('turning on the inbox flag sends only that', () => {
    const changes = changesFor('tags', tag, { ...draftFor(tag), isInboxTag: true });
    expect(JSON.parse(JSON.stringify(changes))).toEqual({ isInboxTag: true });
  });

  test('renaming a select field sends its options as they are, with their ids', () => {
    const changes = changesFor('customFields', selectField, { ...draftFor(selectField), name: 'Paid by' });
    expect(JSON.parse(JSON.stringify(changes))).toEqual({ name: 'Paid by', selectOptions: selectField.selectOptions });
  });

  test("a field's type cannot change after it is made", () => {
    const changes = changesFor('customFields', selectField, { ...draftFor(selectField), dataType: 'string' });
    expect(hasChanges(changes)).toBe(false);
  });

  test("a storage path sends its new template", () => {
    const path: LabelItem = { id: 2, name: 'By year', documentCount: 9, path: '{{ created_year }}/{{ title }}' };
    const changes = changesFor('storagePaths', path, { ...draftFor(path), path: '{{ correspondent }}/{{ title }}' });
    expect(JSON.parse(JSON.stringify(changes))).toEqual({ path: '{{ correspondent }}/{{ title }}' });
  });
});

describe('draftProblem', () => {
  const blank = draftFor(null);
  const emptySelect = { ...blank, name: 'Paid with', dataType: 'select' as const, selectOptions: [' ', ''] };

  test('a name is needed for every kind', () => {
    expect(draftProblem('tags', { ...blank, name: '  ' }, true)).toBe('nameMissing');
  });

  test('a storage path needs a template, and a correspondent does not', () => {
    expect(draftProblem('storagePaths', { ...blank, name: 'By year' }, true)).toBe('pathMissing');
    expect(draftProblem('correspondents', { ...blank, name: 'Hydro' }, true)).toBeNull();
  });

  test('a new select field needs an option, and a rename of one does not', () => {
    expect(draftProblem('customFields', emptySelect, true)).toBe('optionsMissing');
    expect(draftProblem('customFields', emptySelect, false)).toBeNull();
  });
});
