import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryKeys } from '../../src/cache/keys';
import { copy } from '../../src/copy';
import {
  activeFilterCount,
  documentQuery,
  type DocumentFilter,
  emptyFilter,
  type ListOrder,
  sortChoices,
} from '../../src/documents/filter';
import { viewParameters } from '../../src/documents/views';
import { listRows } from '../../src/inbox/rows';
import { readableItems, useLabels } from '../../src/labels';
import type { SavedView } from '../../src/paperless/schemas';
import { errorText, unwrap, useOnline } from '../../src/query';
import { useClient, useSignedIn } from '../../src/session';
import { useCan } from '../../src/settings/usePermissions';
import { touchTarget, useColors } from '../../src/theme';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { Chip } from '../../src/ui/Chip';
import { DocumentRow } from '../../src/ui/DocumentRow';
import { FilterSheet } from '../../src/ui/FilterSheet';
import { SaveViewSheet } from '../../src/ui/SaveViewSheet';
import { Icon } from '../../src/ui/Icon';
import { Message, SavedCopyLine } from '../../src/ui/Message';
import { type LabelMatch, SearchPanel } from '../../src/ui/SearchPanel';
import { Sheet } from '../../src/ui/Sheet';
import { useShowSnackbar } from '../../src/ui/Snackbar';

const pageSize = 25;

function orderLabel(order: ListOrder, hasText: boolean): string {
  if (order !== 'server') {
    return copy.documents.sorts[order];
  }
  return hasText ? copy.documents.bestMatch : copy.documents.viewOrder;
}

function withLabel(filter: DocumentFilter, match: LabelMatch): DocumentFilter {
  const id = match.label.id;
  switch (match.kind) {
    case 'tag':
      return { ...filter, text: '', tagIds: filter.tagIds.includes(id) ? filter.tagIds : [...filter.tagIds, id] };
    case 'correspondent':
      return { ...filter, text: '', correspondentId: id };
    case 'documentType':
      return { ...filter, text: '', documentTypeId: id };
    case 'storagePath':
      return { ...filter, text: '', storagePathId: id };
  }
}

export default function DocumentsScreen() {
  const colors = useColors();
  const client = useClient();
  const router = useRouter();
  const online = useOnline();
  const showSnackbar = useShowSnackbar();
  const { account } = useSignedIn();
  const labels = useLabels();
  const [filter, setFilter] = useState<DocumentFilter>(emptyFilter);
  const [order, setOrder] = useState<ListOrder>('newest');
  const [view, setView] = useState<{ id: number; parameters: Record<string, string> } | null>(null);
  const [panel, setPanel] = useState<'none' | 'search' | 'filters' | 'sort'>('none');
  const [viewToSave, setViewToSave] = useState<DocumentFilter | null>(null);
  const can = useCan();

  const savedViews = useQuery({
    queryKey: queryKeys.savedViews(account.id),
    queryFn: () => unwrap(client.listSavedViews()),
    staleTime: 5 * 60_000,
  });

  const query = documentQuery(filter, order, view?.parameters);
  const documents = useInfiniteQuery({
    queryKey: queryKeys.documentList(account.id, query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => unwrap(client.listDocuments({ ...query, page: pageParam, pageSize })),
    getNextPageParam: (lastPage, pages) => (lastPage.hasNextPage ? pages.length + 1 : undefined),
  });

  const closePanel = useCallback(() => setPanel('none'), []);

  function search(text: string) {
    setFilter({ ...filter, text });
    if (view === null) {
      setOrder(text === '' ? 'newest' : 'server');
    }
    setPanel('none');
  }

  function openView(saved: SavedView) {
    const parameters = viewParameters(saved);
    if (!parameters.ok) {
      showSnackbar({ text: copy.documents.viewUnusable(saved.name) });
      return;
    }
    setView({ id: saved.id, parameters: parameters.parameters });
    setOrder('server');
  }

  function toggleView(saved: SavedView) {
    if (view?.id === saved.id) {
      setView(null);
      setOrder('newest');
      return;
    }
    openView(saved);
  }

  if (panel === 'search') {
    return (
      <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.surface }]}>
        <SearchPanel
          initialText={filter.text}
          labels={labels}
          onSearch={search}
          onPickLabel={(match) => {
            setFilter(withLabel(filter, match));
            setPanel('none');
          }}
          onClose={closePanel}
        />
      </SafeAreaView>
    );
  }

  const items = documents.data?.pages.flatMap((page) => page.items) ?? [];
  const rows = listRows(items, labels.tags.data ?? [], readableItems(labels.correspondents));
  const count = documents.data?.pages[0]?.count;
  const filtersSet = activeFilterCount(filter);
  const narrowed = filtersSet > 0 || filter.text !== '' || view !== null;
  const savedCopy = documents.data !== undefined && (!online || documents.isError);
  const refresh = () => {
    savedViews.refetch();
    labels.tags.refetch();
    labels.correspondents.refetch();
    documents.refetch();
  };

  let body: ReactNode;
  if (documents.isError && !documents.data) {
    body = (
      <Message title={copy.documents.errorTitle} lead={errorText(documents.error)}>
        <Button label={copy.documents.tryAgain} onPress={refresh} variant="outline" />
      </Message>
    );
  } else if (documents.fetchStatus === 'paused' && !documents.data) {
    body = <Message title={copy.documents.offlineTitle} lead={copy.documents.offlineLead} />;
  } else if (!documents.data) {
    body = <ActivityIndicator style={styles.loading} color={colors.accent} size="large" />;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <View style={styles.head}>
        <View style={[styles.search, { backgroundColor: colors.surfaceSunken }]}>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={filter.text === '' ? copy.documents.searchPlaceholder : `${copy.documents.searchPlaceholder}, ${filter.text}`}
            onPress={() => setPanel('search')}
            style={styles.searchOpen}
          >
            <Icon name="search" color={colors.inkMuted} />
            <Text numberOfLines={1} style={[styles.searchText, { color: filter.text === '' ? colors.inkMuted : colors.ink }]}>
              {filter.text === '' ? copy.documents.searchPlaceholder : filter.text}
            </Text>
          </Pressable>
          {filter.text !== '' && (
            <Pressable accessibilityRole="button" accessibilityLabel={copy.documents.clearSearch} onPress={() => search('')} style={styles.iconButton}>
              <Icon name="close" color={colors.ink} />
            </Pressable>
          )}
          <AccountButton />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(savedViews.data ?? []).map((saved) => (
            <Chip key={saved.id} label={saved.name} selected={view?.id === saved.id} onPress={() => toggleView(saved)} />
          ))}
          <Chip
            label={filtersSet > 0 ? copy.documents.filtersSet(filtersSet) : copy.documents.filters}
            icon="filters"
            selected={filtersSet > 0}
            onPress={() => setPanel('filters')}
          />
        </ScrollView>
      </View>
      {savedCopy && <SavedCopyLine />}
      {body ?? (
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.document.id)}
          ListHeaderComponent={
            <View style={styles.toolbar}>
              <Text style={[styles.count, { color: colors.inkMuted }]}>{count === undefined ? '' : copy.documents.count(count)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${copy.documents.sortTitle}, ${orderLabel(order, filter.text !== '')}`}
                onPress={() => setPanel('sort')}
                style={styles.sort}
              >
                <Icon name="sort" color={colors.ink} size={18} />
                <Text style={[styles.sortText, { color: colors.ink }]}>{orderLabel(order, filter.text !== '')}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item, index }) => (
            <DocumentRow
              row={item}
              divided={index > 0}
              client={client}
              serverUrl={account.serverUrl}
              onPress={() => router.push(`/document/${item.document.id}`)}
            />
          )}
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
          ListEmptyComponent={
            narrowed ? (
              <Message title={copy.documents.emptyTitle} lead={copy.documents.emptyLead} />
            ) : (
              <Message title={copy.documents.noDocumentsTitle} lead={copy.documents.noDocumentsLead} />
            )
          }
          ListFooterComponent={documents.isFetchingNextPage ? <ActivityIndicator color={colors.accent} /> : undefined}
          contentContainerStyle={styles.listEnd}
        />
      )}
      <FilterSheet
        visible={panel === 'filters'}
        filter={filter}
        order={order}
        savedViewDefaults={view?.parameters}
        labels={labels}
        onApply={(next) => {
          setFilter(next);
          setPanel('none');
        }}
        onSaveAsView={
          can('add', 'savedViews')
            ? (next) => {
                setPanel('none');
                setViewToSave(next);
              }
            : undefined
        }
        onClose={closePanel}
      />
      {viewToSave !== null && (
        <SaveViewSheet
          query={documentQuery(viewToSave, order, view?.parameters)}
          onSaved={(saved) => {
            setViewToSave(null);
            setFilter(emptyFilter);
            openView(saved);
            showSnackbar({ text: copy.saveView.saved(saved.name) });
          }}
          onClose={() => setViewToSave(null)}
        />
      )}
      <Sheet visible={panel === 'sort'} title={copy.documents.sortTitle} onClose={closePanel}>
        <View accessibilityRole="radiogroup">
          {sortChoices.map((choice) => {
            const on = order === choice;
            return (
              <Pressable
                key={choice}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  setOrder(choice);
                  setPanel('none');
                }}
                style={styles.sortRow}
              >
                <View style={styles.check}>{on && <Icon name="check" color={colors.accent} />}</View>
                <Text style={[styles.sortRowText, { color: colors.ink }]}>{copy.documents.sorts[choice]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { marginBlockStart: 48 },
  head: { gap: 12, paddingBlockStart: 8, paddingBlockEnd: 12 },
  search: { minHeight: 56, flexDirection: 'row', alignItems: 'center', marginInline: 16, paddingInlineStart: 16, paddingInlineEnd: 6, borderRadius: 28 },
  searchOpen: { flex: 1, minWidth: 0, minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchText: { flex: 1, minWidth: 0, fontSize: 16 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 8, paddingInline: 16 },
  toolbar: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingInlineStart: 20, paddingInlineEnd: 8 },
  count: { fontSize: 13.5, fontWeight: '500' },
  sort: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: 6, paddingInline: 12 },
  sortText: { fontSize: 14, fontWeight: '500' },
  sortRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 24, alignItems: 'center' },
  sortRowText: { fontSize: 16 },
  listEnd: { paddingBlockEnd: 200 },
});
