import { expect, test } from 'vitest';

import { permissionRows } from './permissions';

const words = {
  noOwner: 'No owner',
  nobody: 'Only the owner',
  unknownUser: (id: number) => `User ${id}`,
  unknownGroup: (id: number) => `Group ${id}`,
  group: (name: string) => `${name} (group)`,
};

const users = [
  { id: 2, username: 'sam', fullName: 'Sam Rivera' },
  { id: 5, username: 'kim', fullName: '' },
];
const groups = [{ id: 1, name: 'Family' }];

test('names the owner and everyone who may view or change, users first, then groups', () => {
  const rows = permissionRows(
    { ownerId: 2, view: { users: [5, 9], groups: [1] }, change: { users: [], groups: [1] } },
    users,
    groups,
    words,
  );
  expect(rows).toEqual({ owner: 'Sam Rivera', canView: 'kim, User 9, Family (group)', canChange: 'Family (group)' });
});

test('a document with no owner and no one granted says so', () => {
  const rows = permissionRows({ ownerId: null, view: { users: [], groups: [] }, change: { users: [], groups: [3] } }, users, groups, words);
  expect(rows).toEqual({ owner: 'No owner', canView: 'Only the owner', canChange: 'Group 3' });
});
