import { describe, expect, test } from 'vitest';

import { formatCalendarDate } from '../format';
import type { Correspondent, DocumentSummary, IsoDate, Tag } from '../paperless/schemas';
import { groupFor, inboxSections, inboxTagIds, listRows } from './rows';

function tag(id: number, name: string, isInboxTag = false): Tag {
  return { id, name, color: '#000000', textColor: '#ffffff', isInboxTag, parentId: null, documentCount: 1 };
}

function document(id: number, added: string, tagIds: number[], correspondentId: number | null): DocumentSummary {
  return {
    id,
    title: `Document ${id}`,
    created: '2026-09-27',
    added,
    modified: added,
    correspondentId,
    documentTypeId: null,
    storagePathId: null,
    tagIds,
    archiveSerialNumber: null,
    pageCount: 1,
    originalFileName: null,
    content: '',
    searchHit: null,
  } as DocumentSummary;
}

const tags = [tag(1, 'Inbox', true), tag(2, 'Bills'), tag(3, 'To file', true)];
const correspondents: Correspondent[] = [
  { id: 9, name: 'Northfield Hydro', documentCount: 1 },
];

describe('groupFor', () => {
  const now = new Date(2026, 9, 16, 9, 0);

  test.each([
    [new Date(2026, 9, 16, 0, 5), 'today'],
    [new Date(2026, 9, 15, 23, 55), 'week'],
    [new Date(2026, 9, 10, 12, 0), 'week'],
    [new Date(2026, 9, 9, 12, 0), 'earlier'],
  ])('%s is %s', (added, group) => {
    expect(groupFor(added, now)).toBe(group);
  });
});

describe('inboxSections', () => {
  test('keeps the server order inside groups, names the correspondent, and marks inbox tags', () => {
    const now = new Date(2026, 9, 16, 9, 0);
    const sections = inboxSections(
      [
        document(2, new Date(2026, 9, 16, 8, 0).toISOString(), [2, 1], 9),
        document(7, new Date(2026, 9, 13, 8, 0).toISOString(), [1], null),
        document(8, new Date(2026, 9, 2, 8, 0).toISOString(), [3, 42], 77),
      ],
      tags,
      { readable: true, items: correspondents },
      now,
    );
    expect(
      sections.map((section) => [
        section.group,
        section.data.map((row) => [row.document.id, row.correspondent, row.tags.map((t) => [t.name, t.isInboxTag])]),
      ]),
    ).toEqual([
      ['today', [[2, { kind: 'named', name: 'Northfield Hydro' }, [['Bills', false], ['Inbox', true]]]]],
      ['week', [[7, { kind: 'none' }, [['Inbox', true]]]]],
      ['earlier', [[8, { kind: 'unknown' }, [['To file', true]]]]],
    ]);
  });
});

describe('listRows', () => {
  test('knows no correspondent for any row when the account may not read correspondents', () => {
    const documents = [document(2, '2026-10-16T08:00:00Z', [], 9), document(7, '2026-10-16T08:00:00Z', [], null)];
    const rows = listRows(documents, tags, { readable: false });
    expect(rows.map((row) => row.correspondent)).toEqual([{ kind: 'unknown' }, { kind: 'unknown' }]);
  });
});

test('inboxTagIds finds every inbox tag', () => {
  expect(inboxTagIds(tags)).toEqual([1, 3]);
});

describe('formatCalendarDate', () => {
  test('shows the calendar date without moving it a day', () => {
    expect(formatCalendarDate('2026-09-27' as IsoDate, 'en-CA')).toBe('Sep 27, 2026');
    expect(formatCalendarDate('2026-01-01' as IsoDate, 'en-CA')).toBe('Jan 1, 2026');
  });
});
