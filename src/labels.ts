import { useQuery } from '@tanstack/react-query';

import { queryKeys } from './cache/keys';
import { unwrap } from './query';
import { useClient, useSignedIn } from './session';

const labelsStaleMs = 5 * 60_000;

export type Named = { id: number; name: string };

export function useLabels() {
  const client = useClient();
  const { account } = useSignedIn();
  const common = { staleTime: labelsStaleMs };
  return {
    tags: useQuery({ ...common, queryKey: queryKeys.labels(account.id, 'tags'), queryFn: () => unwrap(client.listTags()) }),
    correspondents: useQuery({
      ...common,
      queryKey: queryKeys.labels(account.id, 'correspondents'),
      queryFn: () => unwrap(client.listCorrespondents()),
    }),
    documentTypes: useQuery({
      ...common,
      queryKey: queryKeys.labels(account.id, 'documentTypes'),
      queryFn: () => unwrap(client.listDocumentTypes()),
    }),
    storagePaths: useQuery({
      ...common,
      queryKey: queryKeys.labels(account.id, 'storagePaths'),
      queryFn: () => unwrap(client.listStoragePaths()),
    }),
    customFields: useQuery({
      ...common,
      queryKey: queryKeys.labels(account.id, 'customFields'),
      queryFn: () => unwrap(client.listCustomFields()),
    }),
  };
}

export type Labels = ReturnType<typeof useLabels>;

export function nameOf(items: Named[] | undefined, id: number | null): string | null {
  if (id === null) {
    return null;
  }
  return items?.find((item) => item.id === id)?.name ?? null;
}
