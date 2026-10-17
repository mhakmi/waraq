import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../../src/copy';
import {
  type Batch,
  deletePage,
  movePage,
  movePageToDocument,
  replacePage,
  rotatePage,
  type ScannedPage,
  splitDocument,
} from '../../../src/scan/batch';
import { scanPages } from '../../../src/scan/scanning';
import { newJobId, updateBatch, useBatch } from '../../../src/scan/store';
import { useSignedIn } from '../../../src/session';
import { useColors } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { Icon } from '../../../src/ui/Icon';
import { IconButton } from '../../../src/ui/IconButton';
import { Menu, type MenuItem } from '../../../src/ui/Menu';
import { PageThumb } from '../../../src/ui/PageThumb';
import { Sheet } from '../../../src/ui/Sheet';
import type { JobId } from '../../../src/upload/machine';

const pagePadding = 20;
const seamWidth = 52;

function pairs<Item>(items: Item[]): Item[][] {
  const rows: Item[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }
  return rows;
}

export default function PageEditorScreen() {
  const colors = useColors();
  const router = useRouter();
  const accountId = useSignedIn().account.id;
  const id = useLocalSearchParams<{ id: string }>().id as JobId;
  const { batch } = useBatch();
  const { width: windowWidth } = useWindowDimensions();
  const [menuFor, setMenuFor] = useState<ScannedPage | null>(null);
  const [moving, setMoving] = useState<ScannedPage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const index = batch?.documents.findIndex((document) => document.id === id) ?? -1;
  const found = index === -1 ? undefined : batch?.documents[index];
  const document = found?.kind === 'pages' ? found : undefined;

  useEffect(() => {
    if (document === undefined) {
      router.back();
    }
  }, [document, router]);

  if (document === undefined || batch === null) {
    return null;
  }

  const number = index + 1;
  const pages = document.pages;
  const tileWidth = (windowWidth - 2 * pagePadding - seamWidth) / 2;
  const others = batch.documents.flatMap((other, otherIndex) =>
    other.kind === 'pages' && other.id !== id ? [{ document: other, number: otherIndex + 1 }] : [],
  );

  function change(edit: (current: Batch) => Batch) {
    updateBatch(accountId, edit);
  }

  async function retake(page: ScannedPage) {
    setProblem(null);
    const outcome = await scanPages(1);
    if (outcome.kind === 'problem') {
      setProblem(outcome.message);
    }
    if (outcome.kind === 'scanned' && outcome.pages[0] !== undefined) {
      change((current) => replacePage(current, id, page.id, outcome.pages[0]));
    }
  }

  function confirmDelete(page: ScannedPage, pageNumber: number) {
    Alert.alert(copy.scan.deletePageTitle(pageNumber), copy.scan.deletePageMessage, [
      { text: copy.scan.cancel, style: 'cancel' },
      { text: copy.scan.delete, style: 'destructive', onPress: () => change((current) => deletePage(current, id, page.id)) },
    ]);
  }

  function menuItems(page: ScannedPage): MenuItem[] {
    const position = pages.findIndex((candidate) => candidate.id === page.id);
    const items: MenuItem[] = [
      { label: copy.scan.retake, icon: 'camera', onPress: () => retake(page) },
      { label: copy.scan.rotate, icon: 'rotate', onPress: () => change((current) => rotatePage(current, id, page.id)) },
    ];
    if (position > 0) {
      items.push({
        label: copy.scan.moveEarlier,
        icon: 'chevronStart',
        onPress: () => change((current) => movePage(current, id, page.id, position - 1)),
      });
    }
    if (position < pages.length - 1) {
      items.push({
        label: copy.scan.moveLater,
        icon: 'chevronEnd',
        onPress: () => change((current) => movePage(current, id, page.id, position + 1)),
      });
    }
    if (others.length > 0) {
      items.push({ label: copy.scan.moveTo, icon: 'move', onPress: () => setMoving(page) });
    }
    items.push({ label: copy.scan.delete, icon: 'trash', danger: true, onPress: () => confirmDelete(page, position + 1) });
    return items;
  }

  function split(firstPageOfNew: number) {
    change((current) => splitDocument(current, id, firstPageOfNew, newJobId()));
  }

  function tile(page: ScannedPage, position: number) {
    return (
      <View style={[styles.tile, { width: tileWidth }]}>
        <View>
          <PageThumb
            uri={page.uri}
            width={page.width}
            height={page.height}
            rotation={page.rotation}
            maxWidth={tileWidth}
            maxHeight={(tileWidth * 4) / 3}
          />
          <View style={styles.more}>
            <IconButton
              icon="more"
              label={copy.scan.pageMenu(position + 1)}
              raised
              selected={menuFor?.id === page.id}
              onPress={() => setMenuFor(page)}
            />
          </View>
        </View>
        <Text style={[styles.pageLabel, { color: colors.ink }]}>{copy.scan.page(position + 1)}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <View style={styles.bar}>
        <IconButton icon="back" label={copy.shell.back} onPress={() => router.back()} />
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
            {copy.scan.editorTitle(number)}
          </Text>
          <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{copy.scan.pages(pages.length)}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {problem !== null && (
          <Text accessibilityLiveRegion="polite" style={[styles.problem, { color: colors.danger }]}>
            {problem}
          </Text>
        )}
        {pairs(pages).map((row, rowIndex) => {
          const first = rowIndex * 2;
          return (
            <Fragment key={row[0].id}>
              {rowIndex > 0 && (
                <View style={styles.seamRow}>
                  <View style={[styles.dash, { borderColor: colors.line }]} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.scan.splitAfter(first)}
                    onPress={() => split(first)}
                    style={[styles.splitBar, { backgroundColor: colors.accentSoft }]}
                  >
                    <Icon name="scissors" color={colors.onAccentSoft} size={18} />
                    <Text style={[styles.splitText, { color: colors.onAccentSoft }]}>{copy.scan.split}</Text>
                  </Pressable>
                  <View style={[styles.dash, { borderColor: colors.line }]} />
                </View>
              )}
              <View style={styles.row}>
                {tile(row[0], first)}
                <View style={styles.seam}>
                  {row[1] !== undefined && (
                    <>
                      <View style={[styles.seamLine, { borderColor: colors.line }]} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.scan.splitAfter(first + 1)}
                        onPress={() => split(first + 1)}
                        style={[styles.splitRound, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}
                      >
                        <Icon name="scissors" color={colors.ink} size={18} />
                      </Pressable>
                    </>
                  )}
                </View>
                {row[1] !== undefined && tile(row[1], first + 1)}
              </View>
            </Fragment>
          );
        })}
      </ScrollView>
      <View style={[styles.bottom, { borderTopColor: colors.line }]}>
        <Button label={copy.scan.done} large onPress={() => router.back()} />
      </View>
      <Menu visible={menuFor !== null} items={menuFor === null ? [] : menuItems(menuFor)} onClose={() => setMenuFor(null)} />
      <Sheet
        visible={moving !== null}
        title={copy.scan.moveToTitle(moving === null ? 0 : pages.findIndex((page) => page.id === moving.id) + 1)}
        onClose={() => setMoving(null)}
      >
        {others.map((other) => (
          <Button
            key={other.document.id}
            variant="outline"
            label={`${copy.scan.documentName(other.number)} · ${copy.scan.pages(other.document.pages.length)}`}
            onPress={() => {
              if (moving !== null) {
                change((current) => movePageToDocument(current, id, moving.id, other.document.id));
              }
              setMoving(null);
            }}
          />
        ))}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingInlineStart: 4, paddingInlineEnd: 8 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '500' },
  subtitle: { fontSize: 13.5 },
  body: { paddingBlock: 16, paddingInline: pagePadding },
  problem: { fontSize: 14.5, paddingBlockEnd: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  tile: { alignItems: 'center', gap: 8 },
  more: { position: 'absolute', top: 4, end: 4 },
  pageLabel: { fontSize: 14, fontWeight: '500' },
  seam: { width: seamWidth, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  seamLine: { position: 'absolute', top: 8, bottom: 40, borderStartWidth: 2, borderStyle: 'dashed' },
  splitRound: { width: 44, height: 48, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBlockEnd: 32 },
  seamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBlock: 12 },
  dash: { flex: 1, borderTopWidth: 2, borderStyle: 'dashed' },
  splitBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingInline: 16, borderRadius: 24, flexShrink: 1 },
  splitText: { fontSize: 14.5, fontWeight: '500', flexShrink: 1 },
  bottom: { paddingBlock: 12, paddingInline: 16, borderTopWidth: 1 },
});
