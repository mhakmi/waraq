export type PermissionAction = 'view' | 'add' | 'change' | 'delete';

export const permissionActions: PermissionAction[] = ['view', 'add', 'change', 'delete'];

export type Permissions = { kind: 'notLoaded' } | { kind: 'loaded'; codenames: ReadonlySet<string> };

export function codename(action: PermissionAction, djangoModel: string): string {
  return `${action}_${djangoModel}`;
}

export function can(permissions: Permissions, action: PermissionAction, djangoModel: string): boolean {
  return permissions.kind === 'notLoaded' || permissions.codenames.has(codename(action, djangoModel));
}

export const djangoModels = {
  documents: 'document',
  notes: 'note',
  tags: 'tag',
  correspondents: 'correspondent',
  documentTypes: 'documenttype',
  storagePaths: 'storagepath',
  customFields: 'customfield',
  savedViews: 'savedview',
  shareLinks: 'sharelink',
  workflows: 'workflow',
  mailAccounts: 'mailaccount',
  mailRules: 'mailrule',
  tasks: 'paperlesstask',
  history: 'logentry',
  webSettings: 'uisettings',
  serverSettings: 'applicationconfiguration',
  users: 'user',
  groups: 'group',
} as const;

export type PermissionArea = keyof typeof djangoModels;

export const specialPermissions = [
  { permission: 'statistics', codename: 'view_global_statistics' },
  { permission: 'systemStatus', codename: 'view_system_monitoring' },
] as const;

export type SpecialPermission = (typeof specialPermissions)[number]['permission'];

export type AccountAccess = {
  areas: { area: PermissionArea; allowed: PermissionAction[] }[];
  special: { permission: SpecialPermission; allowed: boolean }[];
};

export function accountAccess(codenames: ReadonlySet<string>): AccountAccess {
  const areas = Object.keys(djangoModels) as PermissionArea[];
  return {
    areas: areas.map((area) => ({
      area,
      allowed: permissionActions.filter((action) => codenames.has(codename(action, djangoModels[area]))),
    })),
    special: specialPermissions.map((special) => ({ permission: special.permission, allowed: codenames.has(special.codename) })),
  };
}
