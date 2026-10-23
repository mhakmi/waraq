import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { addDocument, addPages, type DraftDocument, pageCount, removeDocument } from '../../src/scan/batch';
import { pickFiles, scanPages } from '../../src/scan/scanning';
import { discardBatch, loadBatch, newJobId, updateBatch, useBatch } from '../../src/scan/store';
import { useSignedIn } from '../../src/session';
import { radius, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { IconButton } from '../../src/ui/IconButton';
import { PageThumb } from '../../src/ui/PageThumb';
import type { JobId } from '../../src/upload/machine';

export default function BatchScreen() {
  const colors = useColors();
  const router = useRouter();
  const accountId = useSignedIn().account.id;
  const { start } = useLocalSearchParams<{ start?: string }>();
  const { loaded, batch } = useBatch();
  const [problem, setProblem] = useState<string | null>(null);
  const startedScan = useRef(false);
  const documents = batch?.documents ?? [];

  async function scanInto(target: JobId | 'new') {
    setProblem(null);
    const outcome = await scanPages();
    if (outcome.kind === 'problem') {
      setProblem(outcome.message);
    }
    if (outcome.kind !== 'scanned') {
      return;
    }
    updateBatch(accountId, (current) =>
      target === 'new'
        ? addDocument(current, { kind: 'pages', id: newJobId(), pages: outcome.pages, metadata: {} })
        : addPages(current, target, outcome.pages),
    );
  }

  async function pick() {
    setProblem(null);
    setProblem(await pickFiles(accountId));
  }

  useEffect(() => {
    loadBatch(accountId);
  }, [accountId]);

  useEffect(() => {
    if (loaded && start === 'scan' && !startedScan.current) {
      startedScan.current = true;
      scanInto('new');
    }
  }, [loaded, start]);

  function confirmDiscardBatch() {
    Alert.alert(copy.scan.discardBatchTitle, copy.scan.discardBatchMessage(documents.length), [
      { text: copy.scan.cancel, style: 'cancel' },
      {
        text: copy.scan.discard,
        style: 'destructive',
        onPress: () => {
          discardBatch();
          router.back();
        },
      },
    ]);
  }

  function confirmDiscardDocument(document: DraftDocument, number: number) {
    Alert.alert(copy.scan.discardDocumentTitle(number), copy.scan.discardDocumentMessage, [
      { text: copy.scan.cancel, style: 'cancel' },
      {
        text: copy.scan.discard,
        style: 'destructive',
        onPress: () => updateBatch(accountId, (current) => removeDocument(current, document.id)),
      },
    ]);
  }

  const last = documents.at(-1);
  const several = documents.length > 1;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <View style={styles.bar}>
        <IconButton icon="close" label={copy.scan.close} onPress={() => router.back()} />
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
          {copy.scan.batchTitle}
        </Text>
        {documents.length > 0 && <IconButton icon="trash" label={copy.scan.discardBatch} onPress={confirmDiscardBatch} />}
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {loaded && documents.length === 0 && (
          <View style={styles.empty}>
            <Text accessibilityRole="header" style={[styles.emptyTitle, { color: colors.ink }]}>
              {copy.scan.emptyTitle}
            </Text>
            <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.scan.emptyLead}</Text>
          </View>
        )}
        {documents.map((document, index) => (
          <DocumentCard
            key={document.id}
            document={document}
            number={index + 1}
            small={several}
            onEdit={() => router.push({ pathname: '/scan/pages/[id]', params: { id: document.id } })}
            onDiscard={() => confirmDiscardDocument(document, index + 1)}
          />
        ))}
        {problem !== null && (
          <Text accessibilityLiveRegion="polite" style={[styles.problem, { color: colors.danger }]}>
            {problem}
          </Text>
        )}
        {loaded && (
          <View style={styles.actions}>
            {documents.length === 0 ? (
              <Button label={copy.scan.scan} icon="scan" large onPress={() => scanInto('new')} />
            ) : (
              <>
                {last?.kind === 'pages' && (
                  <Button
                    label={several ? copy.scan.addPagesTo(documents.length) : copy.scan.addPages}
                    icon="plus"
                    variant="outline"
                    large={!several}
                    onPress={() => scanInto(last.id)}
                  />
                )}
                <Button label={copy.scan.scanNext} icon="scan" variant="outline" large={!several} onPress={() => scanInto('new')} />
              </>
            )}
            <Button label={copy.scan.pickFiles} icon="files" variant="outline" large={!several} onPress={pick} />
          </View>
        )}
        {documents.length === 1 && <Text style={[styles.hint, { color: colors.inkMuted }]}>{copy.scan.batchHint}</Text>}
      </ScrollView>
      {documents.length > 0 && (
        <View style={[styles.bottom, { borderTopColor: colors.line, backgroundColor: colors.surface }]}>
          <Button
            label={several ? copy.scan.reviewCount(documents.length) : copy.scan.review}
            large
            onPress={() => router.push('/scan/details')}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

type DocumentCardProps = {
  document: DraftDocument;
  number: number;
  small: boolean;
  onEdit: () => void;
  onDiscard: () => void;
};

function DocumentCard({ document, number, small, onEdit, onDiscard }: DocumentCardProps) {
  const colors = useColors();
  const thumbHeight = small ? 56 : 88;
  const count = copy.scan.pages(pageCount(document));
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
      <View style={styles.cardHead}>
        <View style={styles.names}>
          <Text style={[styles.documentName, { color: colors.ink }]}>{copy.scan.documentName(number)}</Text>
          <Text style={[styles.meta, { color: colors.inkMuted }]}>
            {document.kind === 'pdf' ? `${copy.scan.pdf} · ${count}` : count}
          </Text>
        </View>
        <View style={styles.cardActions}>
          {document.kind === 'pages' && (
            <Button
              label={copy.scan.editPages}
              accessibilityLabel={copy.scan.editPagesOf(number)}
              variant="text"
              compact
              onPress={onEdit}
            />
          )}
          <IconButton icon="trash" label={copy.scan.discardDocument(number)} onPress={onDiscard} color={colors.inkMuted} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {document.kind === 'pages' ? (
          document.pages.map((page) => (
            <PageThumb
              key={page.id}
              uri={page.uri}
              width={page.width}
              height={page.height}
              rotation={page.rotation}
              maxHeight={thumbHeight}
            />
          ))
        ) : (
          <PageThumb uri={document.pdf.thumbnailUri} width={210} height={297} rotation={0} maxHeight={thumbHeight} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingInlineStart: 4, paddingInlineEnd: 8 },
  title: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: '500' },
  body: { paddingBlockStart: 8, paddingBlockEnd: 24, paddingInline: 16, gap: 14 },
  empty: { gap: 8, paddingBlock: 16, paddingInline: 4 },
  emptyTitle: { fontSize: 20, fontWeight: '500' },
  lead: { fontSize: 16 },
  card: { paddingBlockStart: 6, paddingBlockEnd: 16, paddingInline: 16, borderRadius: radius, borderWidth: 1, gap: 8 },
  cardHead: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  cardActions: { flexDirection: 'row', alignItems: 'center', columnGap: 8, marginInlineStart: 'auto' },
  documentName: { fontSize: 16, fontWeight: '600' },
  names: { flexGrow: 1, flexBasis: 160, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  meta: { fontSize: 13.5 },
  strip: { gap: 10 },
  problem: { fontSize: 14.5 },
  actions: { gap: 10 },
  hint: { fontSize: 14, paddingInline: 4 },
  bottom: { paddingBlock: 12, paddingInline: 16, borderTopWidth: 1 },
});
