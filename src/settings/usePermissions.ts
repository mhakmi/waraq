import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '../cache/keys';
import { unwrap } from '../query';
import { useClient, useSignedIn } from '../session';
import { can, djangoModels, type PermissionAction, type PermissionArea, type Permissions } from './permissions';

export function useUiSettings() {
  const client = useClient();
  const { account } = useSignedIn();
  return useQuery({
    queryKey: queryKeys.uiSettings(account.id),
    queryFn: () => unwrap(client.readUiSettings()),
    staleTime: 5 * 60_000,
  });
}

export function usePermissions(): Permissions {
  const { data } = useUiSettings();
  return useMemo(
    () => (data === undefined ? { kind: 'notLoaded' } : { kind: 'loaded', codenames: new Set(data.permissions) }),
    [data],
  );
}

export function useCan(): (action: PermissionAction, area: PermissionArea) => boolean {
  const permissions = usePermissions();
  return (action, area) => can(permissions, action, djangoModels[area]);
}
