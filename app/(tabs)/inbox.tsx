import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryKeys } from '../../src/cache/keys';
import { copy } from '../../src/copy';
import { type DocumentPages, positionOf, tagsAfterDone, withDocumentAt, withoutDocument } from '../../src/inbox/done';
import {
  documentsIn,
  type DocumentsByInboxTag,
  loadDocumentsByInboxTag,
  onlyFinished,
  removeInboxTags,
  restoreInboxTags,
} from '../../src/inbox/doneAll';
import { inboxSections, inboxTagIds } from '../../src/inbox/rows';
import { readableItems, useLabels } from '../../src/labels';
import { useCan } from '../../src/settings/usePermissions';
import type { DocumentId, DocumentSummary } from '../../src/paperless/schemas';
import { errorText, RequestFailed, unwrap, useOnline } from '../../src/query';
import { type AppClient, useClient, useSignedIn } from '../../src/session';
import { useColors } from '../../src/theme';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { DocumentRow } from '../../src/ui/DocumentRow';
import { Message, SavedCopyLine } from '../../src/ui/Message';
import { useShowSnackbar } from '../../src/ui/Snackbar';

const pageSize = 25;

function useInboxDocuments(client: AppClient, accountId: string, tagIds: number[]) {
  return useInfiniteQuery({
    queryKey: queryKeys.inbox(accountId, tagIds),
    enabled: tagIds.length > 0,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap(
        client.listDocuments({ tagIdsAny: tagIds, orderBy: { field: 'added', descending: true }, page: pageParam, pageSize }),
      ),
    getNextPageParam: (lastPage, pages) => (lastPage.hasNextPage ? pages.length + 1 : undefined),
  });
}

function useMarkDone(client: AppClient, accountId: string, tagIds: number[]) {
  const queryClient = useQueryClient();
  const showSnackbar = useShowSnackbar();
  const inboxKey = queryKeys.inbox(accountId, tagIds);
  const update = useMutation({
    scope: { id: 'inbox-done' },
    mutationFn: ({ id, tags }: { id: DocumentId; tags: number[] }) => unwrap(client.updateDocument(id, { tagIds: tags })),
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.document(accountId, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allDocumentLists(accountId) });
    },
  });

  const removeRow = (id: number) => queryClient.setQueryData<DocumentPages>(inboxKey, (data) => withoutDocument(data, id));

  return async function markDone(document: DocumentSummary) {
    await queryClient.cancelQueries({ queryKey: inboxKey });
    const position = positionOf(queryClient.getQueryData<DocumentPages>(inboxKey), document.id);
    const putBack = () => {
      if (position !== null) {
        queryClient.setQueryData<DocumentPages>(inboxKey, (data) => withDocumentAt(data, document, position));
      }
    };
    const undo = () => {
      putBack();
      update.mutate(
        { id: document.id, tags: document.tagIds },
        {
          onError: () => {
            removeRow(document.id);
            showSnackbar({ text: copy.inbox.undoFailed(document.title) });
          },
        },
      );
    };

    removeRow(document.id);
    showSnackbar({ text: copy.inbox.marked, action: { label: copy.inbox.undo, onPress: undo } });
    update.mutate(
      { id: document.id, tags: tagsAfterDone(document.tagIds, tagIds) },
      {
        onError: () => {
          putBack();
          showSnackbar({ text: copy.inbox.doneFailed(document.title) });
        },
      },
    );
  };
}

type AllDoneState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'running'; finished: number; total: number }
  | { kind: 'undoing' };

function useMarkAllDone(client: AppClient, accountId: string, tagIds: number[]) {
  const queryClient = useQueryClient();
  const showSnackbar = useShowSnackbar();
  const [state, setState] = useState<AllDoneState>({ kind: 'idle' });
  const inboxKey = queryKeys.inbox(accountId, tagIds);

  const refreshDocuments = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.allDocumentLists(accountId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.allDocumentDetails(accountId) });
  };

  async function undo(members: DocumentsByInboxTag) {
    setState({ kind: 'undoing' });
    const result = await restoreInboxTags(client.changeTags, members);
    setState({ kind: 'idle' });
    refreshDocuments();
    if (!result.ok) {
      showSnackbar({ text: copy.inbox.allUndoFailed });
    }
  }

  async function markDone(members: DocumentsByInboxTag) {
    const total = documentsIn(members).length;
    setState({ kind: 'running', finished: 0, total });
    await queryClient.cancelQueries({ queryKey: inboxKey });
    const outcome = await removeInboxTags(client.changeTags, members, (finished) =>
      setState({ kind: 'running', finished, total }),
    );
    setState({ kind: 'idle' });
    queryClient.setQueryData<DocumentPages>(inboxKey, (data) => outcome.finished.reduce(withoutDocument, data));
    refreshDocuments();
    const changed = onlyFinished(members, outcome.finished);
    showSnackbar({
      text: outcome.error === null ? copy.inbox.allMarked(total) : copy.inbox.allDoneFailed(outcome.finished.length, total),
      action: changed.length > 0 ? { label: copy.inbox.undo, onPress: () => undo(changed) } : undefined,
    });
  }

  async function start() {
    setState({ kind: 'loading' });
    const loaded = await loadDocumentsByInboxTag((tagId) => client.listDocumentIds({ tagIdsAll: [tagId] }), tagIds);
    setState({ kind: 'idle' });
    if (!loaded.ok) {
      showSnackbar({ text: errorText(new RequestFailed(loaded.error)) });
      return;
    }
    const count = documentsIn(loaded.value).length;
    if (count === 0) {
      refreshDocuments();
      return;
    }
    Alert.alert(copy.inbox.allDoneTitle(count), copy.inbox.allDoneMessage, [
      { text: copy.inbox.allDoneCancel, style: 'cancel' },
      { text: copy.inbox.allDoneConfirm, onPress: () => markDone(loaded.value) },
    ]);
  }

  return { state, start };
}

function subtitle(state: AllDoneState, count: number): string {
  switch (state.kind) {
    case 'running':
      return copy.inbox.allDoneProgress(state.finished, state.total);
    case 'undoing':
      return copy.inbox.allDoneUndoing;
    default:
      return copy.inbox.newCount(count);
  }
}

export default function InboxScreen() {
  const colors = useColors();
  const client = useClient();
  const router = useRouter();
  const online = useOnline();
  const { account } = useSignedIn();
  const { tags, correspondents } = useLabels();
  const tagIds = inboxTagIds(tags.data ?? []);
  const documents = useInboxDocuments(client, account.id, tagIds);
  const markDone = useMarkDone(client, account.id, tagIds);
  const allDone = useMarkAllDone(client, account.id, tagIds);
  const mayChangeDocuments = useCan()('change', 'documents');

  const items = documents.data?.pages.flatMap((page) => page.items) ?? [];
  const sections = inboxSections(items, tags.data ?? [], readableItems(correspondents), new Date());
  const count = documents.data?.pages[0]?.count;
  const savedCopy = documents.data !== undefined && (!online || documents.isError);
  const refresh = () => {
    tags.refetch();
    correspondents.refetch();
    documents.refetch();
  };

  let body: ReactNode;
  if ((tags.isError && !tags.data) || (documents.isError && !documents.data)) {
    const error = tags.error ?? documents.error;
    body = (
      <Message title={copy.inbox.errorTitle} lead={errorText(error, copy.inbox.forbidden)}>
        <Button label={copy.inbox.tryAgain} onPress={refresh} variant="outline" />
      </Message>
    );
  } else if ((tags.fetchStatus === 'paused' && !tags.data) || (documents.fetchStatus === 'paused' && !documents.data)) {
    body = <Message title={copy.inbox.offlineTitle} lead={copy.inbox.offlineLead} />;
  } else if (tags.isSuccess && tagIds.length === 0) {
    body = <Message title={copy.inbox.noInboxTagTitle} lead={copy.inbox.noInboxTagLead} />;
  } else if (!documents.data) {
    body = <ActivityIndicator style={styles.loading} color={colors.accent} size="large" />;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <View style={styles.topBar}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
            {copy.shell.inbox}
          </Text>
          {count !== undefined && (
            <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{subtitle(allDone.state, count)}</Text>
          )}
        </View>
        {mayChangeDocuments && count !== undefined && count > 0 && (
          <Button
            label={copy.inbox.allDone}
            accessibilityLabel={copy.inbox.allDoneLabel(count)}
            icon="check"
            variant="outline"
            compact
            busy={allDone.state.kind !== 'idle'}
            onPress={allDone.start}
          />
        )}
        <AccountButton />
      </View>
      {savedCopy && <SavedCopyLine />}
      {body ?? (
        <SectionList
          sections={sections}
          keyExtractor={(row) => String(row.document.id)}
          ListHeaderComponent={
            items.length > 0 && mayChangeDocuments ? (
              <Text style={[styles.hint, { color: colors.inkMuted }]}>{copy.inbox.doneHint}</Text>
            ) : undefined
          }
          renderItem={({ item, index }) => (
            <DocumentRow
              row={item}
              divided={index > 0}
              client={client}
              serverUrl={account.serverUrl}
              onPress={() => router.push(`/document/${item.document.id}`)}
              action={
                mayChangeDocuments && (
                  <Button
                    label={copy.inbox.done}
                    accessibilityLabel={copy.inbox.doneLabel(item.document.title)}
                    icon="check"
                    variant="outline"
                    compact
                    onPress={() => markDone(item.document)}
                  />
                )
              }
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" style={[styles.groupHead, { color: colors.inkMuted }]}>
              {copy.inbox.groups[section.group]}
            </Text>
          )}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={documents.isRefetching && !documents.isFetchingNextPage}
              onRefresh={refresh}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surfaceRaised}
            />
          }
          onEndReached={() => {
            if (documents.hasNextPage && !documents.isFetchingNextPage) {
              documents.fetchNextPage();
            }
          }}
          ListEmptyComponent={<Message title={copy.inbox.emptyTitle} lead={copy.inbox.emptyLead} />}
          ListFooterComponent={documents.isFetchingNextPage ? <ActivityIndicator color={colors.accent} /> : undefined}
          contentContainerStyle={styles.listEnd}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { marginBlockStart: 48 },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingInlineStart: 20, paddingInlineEnd: 8 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '500' },
  subtitle: { fontSize: 13 },
  hint: { paddingInline: 20, paddingBlockEnd: 4, fontSize: 13.5 },
  groupHead: { paddingBlockStart: 16, paddingBlockEnd: 6, paddingInline: 20, fontSize: 13.5, fontWeight: '600' },
  listEnd: { paddingBlockEnd: 200 },
});
