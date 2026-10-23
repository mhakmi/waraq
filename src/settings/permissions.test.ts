import { describe, expect, test } from 'vitest';

import { accountAccess, can } from './permissions';

describe('can', () => {
  const known = { kind: 'loaded' as const, codenames: new Set(['view_tag', 'add_tag']) };

  test('allows what the account holds and nothing else', () => {
    expect(can(known, 'add', 'tag')).toBe(true);
    expect(can(known, 'delete', 'tag')).toBe(false);
    expect(can(known, 'add', 'correspondent')).toBe(false);
  });

  test('allows everything until the server has answered', () => {
    expect(can({ kind: 'notLoaded' }, 'delete', 'document')).toBe(true);
  });
});

describe('accountAccess', () => {
  test('groups the codenames by area, in the order see, add, change, delete', () => {
    const access = accountAccess(new Set(['change_document', 'view_document', 'view_note', 'add_note', 'view_global_statistics']));
    const byArea = Object.fromEntries(access.areas.map((entry) => [entry.area, entry.allowed]));
    expect(byArea.documents).toEqual(['view', 'change']);
    expect(byArea.notes).toEqual(['view', 'add']);
    expect(byArea.tags).toEqual([]);
    expect(access.special).toEqual([
      { permission: 'statistics', allowed: true },
      { permission: 'systemStatus', allowed: false },
    ]);
  });
});
