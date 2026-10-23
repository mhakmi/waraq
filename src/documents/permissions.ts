import type { DocumentPermissions, Group, User } from '../paperless/schemas';

export type PermissionWords = {
  noOwner: string;
  nobody: string;
  unknownUser: (id: number) => string;
  unknownGroup: (id: number) => string;
  group: (name: string) => string;
};

export type PermissionRows = { owner: string; canView: string; canChange: string };

function userName(users: User[], id: number, words: PermissionWords): string {
  const user = users.find((candidate) => candidate.id === id);
  if (user === undefined) {
    return words.unknownUser(id);
  }
  return user.fullName === '' ? user.username : user.fullName;
}

function people(granted: DocumentPermissions['view'], users: User[], groups: Group[], words: PermissionWords): string {
  const names = [
    ...granted.users.map((id) => userName(users, id, words)),
    ...granted.groups.map((id) => {
      const group = groups.find((candidate) => candidate.id === id);
      return group === undefined ? words.unknownGroup(id) : words.group(group.name);
    }),
  ];
  return names.length === 0 ? words.nobody : names.join(', ');
}

export function permissionRows(permissions: DocumentPermissions, users: User[], groups: Group[], words: PermissionWords): PermissionRows {
  return {
    owner: permissions.ownerId === null ? words.noOwner : userName(users, permissions.ownerId, words),
    canView: people(permissions.view, users, groups, words),
    canChange: people(permissions.change, users, groups, words),
  };
}
