import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { formatCalendarDate } from '../../src/format';
import { type InboxRow, inboxSections, inboxTagIds } from '../../src/inbox/rows';
import { RequestFailed, unwrap } from '../../src/query';
import { type AppClient, useClient, useSession, useSignedIn } from '../../src/session';
import { hostOf } from '../../src/signin/connect';
import { touchTarget, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';

const pageSize = 25;

function errorText(error: Error): string {
  const errors = copy.inbox.errors;
  if (!(error instanceof RequestFailed)) {
    return errors.other;
  }
  switch (error.failure.kind) {
    case 'network':
    case 'timeout':
    case 'server':
      return errors.network;
    case 'unauthorized':
      return errors.signedOut;
    case 'forbidden':
      return errors.forbidden;
    default:
      return errors.other;
  }
}

function useInbox(client: AppClient, accountId: string) {
  const tags = useQuery({ queryKey: [accountId, 'tags'], queryFn: () => unwrap(client.listTags()) });
  // A failure here is not shown, so an account that may not read correspondents still sees its inbox.
  const correspondents = useQuery({
    queryKey: [accountId, 'correspondents'],
    queryFn: () => unwrap(client.listCorrespondents()),
  });
  const tagIds = inboxTagIds(tags.data ?? []);
  const documents = useInfiniteQuery({
    queryKey: [accountId, 'inbox', tagIds],
    enabled: tagIds.length > 0,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap(
        client.listDocuments({ tagIdsAny: tagIds, orderBy: { field: 'added', descending: true }, page: pageParam, pageSize }),
      ),
    getNextPageParam: (lastPage, pages) => (lastPage.hasNextPage ? pages.length + 1 : undefined),
  });
  return { tags, correspondents, tagIds, documents };
}

export default function InboxScreen() {
  const colors = useColors();
  const client = useClient();
  const { account } = useSignedIn();
  const { tags, correspondents, tagIds, documents } = useInbox(client, account.id);

  const items = documents.data?.pages.flatMap((page) => page.items) ?? [];
  const sections = inboxSections(items, tags.data ?? [], correspondents.data ?? [], new Date());
  const count = documents.data?.pages[0]?.count;
  const refresh = () => {
    tags.refetch();
    correspondents.refetch();
    documents.refetch();
  };

  let body: ReactNode;
  if (tags.isError || documents.isError) {
    const error = tags.error ?? documents.error;
    body = (
      <Message title={copy.inbox.errorTitle} lead={error ? errorText(error) : copy.inbox.errors.other}>
        <Button label={copy.inbox.tryAgain} onPress={refresh} variant="outline" />
      </Message>
    );
  } else if ((tags.fetchStatus === 'paused' && !tags.data) || (documents.fetchStatus === 'paused' && !documents.data)) {
    body = <Message title={copy.inbox.offlineTitle} lead={copy.inbox.offlineLead} />;
  } else if (tags.isSuccess && tagIds.length === 0) {
    body = <Message title={copy.inbox.noInboxTagTitle} lead={copy.inbox.noInboxTagLead} />;
  } else if (!documents.isSuccess) {
    body = <ActivityIndicator style={styles.loading} color={colors.accent} size="large" />;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <TopBar count={count} />
      {body ?? (
        <SectionList
          sections={sections}
          keyExtractor={(row) => String(row.document.id)}
          renderItem={({ item, index }) => (
            <DocumentRow row={item} divided={index > 0} client={client} serverUrl={account.serverUrl} />
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

function TopBar({ count }: { count: number | undefined }) {
  const colors = useColors();
  const { account } = useSignedIn();
  const session = useSession();

  function askToSignOut() {
    Alert.alert(copy.account.signOutTitle, copy.account.signOutMessage(account.username, hostOf(account.serverUrl)), [
      { text: copy.account.cancel, style: 'cancel' },
      { text: copy.account.signOut, style: 'destructive', onPress: () => session.signOut() },
    ]);
  }

  return (
    <View style={styles.topBar}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
          {copy.shell.inbox}
        </Text>
        {count !== undefined && (
          <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{copy.inbox.newCount(count)}</Text>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.shell.account} onPress={askToSignOut} style={styles.iconButton}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={[styles.avatarText, { color: colors.onAccent }]}>{account.username.slice(0, 1).toUpperCase()}</Text>
        </View>
      </Pressable>
    </View>
  );
}

type DocumentRowProps = { row: InboxRow; divided: boolean; client: AppClient; serverUrl: string };

function DocumentRow({ row, divided, client, serverUrl }: DocumentRowProps) {
  const colors = useColors();
  const thumbnail = client.documentFile(row.document.id, 'thumb');
  const meta = copy.inbox.meta(row.correspondent, formatCalendarDate(row.document.created, copy.locale));
  return (
    <View style={[styles.row, divided && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <Image
        source={{
          uri: thumbnail.url,
          headers: thumbnail.headers,
          cacheKey: `${serverUrl}/${row.document.id}/${row.document.modified}`,
        }}
        contentFit="cover"
        accessible={false}
        style={[styles.thumb, { backgroundColor: colors.paper, borderColor: colors.line }]}
      />
      <View style={styles.rowMain}>
        <Text style={[styles.docTitle, { color: colors.ink }]}>{row.document.title}</Text>
        <Text style={[styles.meta, { color: colors.inkMuted }]}>{meta}</Text>
        <View style={styles.tags}>
          {row.tags.map((tag) => (
            <Text
              key={tag.id}
              style={[
                styles.tag,
                tag.isInboxTag
                  ? { backgroundColor: colors.accentSoft, color: colors.onAccentSoft }
                  : { backgroundColor: colors.surfaceSunken, color: colors.ink },
              ]}
            >
              {tag.name}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function Message({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.message}>
      <Text accessibilityRole="header" style={[styles.messageTitle, { color: colors.ink }]}>
        {title}
      </Text>
      <Text style={[styles.messageLead, { color: colors.inkMuted }]}>{lead}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { marginBlockStart: 48 },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingInlineStart: 20, paddingInlineEnd: 8 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '500' },
  subtitle: { fontSize: 13 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '600' },
  groupHead: { paddingBlockStart: 16, paddingBlockEnd: 6, paddingInline: 20, fontSize: 13.5, fontWeight: '600' },
  listEnd: { paddingBlockEnd: 120 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingBlock: 12, paddingInlineStart: 20, paddingInlineEnd: 12, minHeight: 88 },
  thumb: { width: 48, height: 64, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, minWidth: 0, gap: 4 },
  docTitle: { fontSize: 15.5, fontWeight: '500' },
  meta: { fontSize: 13.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBlockStart: 2 },
  tag: { paddingBlock: 2, paddingInline: 8, borderRadius: 6, fontSize: 12.5, fontWeight: '500', overflow: 'hidden' },
  message: { paddingInline: 20, paddingBlockStart: 32, gap: 8, alignItems: 'flex-start' },
  messageTitle: { fontSize: 18, fontWeight: '500' },
  messageLead: { fontSize: 15 },
});
