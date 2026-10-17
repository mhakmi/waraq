import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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

export function useCreateLabel() {
  const client = useClient();
  const queryClient = useQueryClient();
  const { account } = useSignedIn();
  const [failed, setFailed] = useState(false);

  async function create(kind: 'tags' | 'correspondents', name: string): Promise<Named | null> {
    const result = kind === 'tags' ? await client.createTag(name) : await client.createCorrespondent(name);
    if (!result.ok) {
      setFailed(true);
      return null;
    }
    setFailed(false);
    await queryClient.invalidateQueries({ queryKey: queryKeys.labels(account.id, kind) });
    return result.value;
  }

  return { create, failed };
}
