import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { useOnline } from '../../src/query';
import { useSignedIn } from '../../src/session';
import { type Colors, useColors } from '../../src/theme';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Message } from '../../src/ui/Message';
import type { Progress } from '../../src/upload/drain';
import { AccountId, type UploadJob } from '../../src/upload/machine';
import { reportUploadError, uploadQueue, useUploadQueue } from '../../src/upload/queue';
import { type RowLook, type UploadRow, uploadSections } from '../../src/upload/rows';

const minute = 60_000;

type StateLine = { text: string; icon: IconName; tone: 'muted' | 'accent' | 'success' | 'danger' };

function stateLine(look: RowLook, now: number): StateLine {
  const states = copy.uploads.states;
  switch (look.kind) {
    case 'preparing':
      return { text: states.preparing, icon: 'mark', tone: 'muted' };
    case 'waitingOffline':
      return { text: states.waitingOffline, icon: 'offline', tone: 'muted' };
    case 'waitingToSend':
      return { text: states.waitingToSend, icon: 'history', tone: 'muted' };
    case 'waitingRetry':
      return { text: copy.uploads.retryIn(look.retryAt - now, look.attempt), icon: 'history', tone: 'muted' };
    case 'waitingLookup':
      return { text: states.waitingLookup, icon: 'search', tone: 'muted' };
    case 'sending':
      return { text: states.sending, icon: 'upload', tone: 'accent' };
    case 'processing':
      return { text: states.processing, icon: 'history', tone: 'muted' };
    case 'done':
      return { text: states.done, icon: 'passed', tone: 'success' };
    case 'signInRequired':
      return { text: states.signInRequired, icon: 'key', tone: 'danger' };
    case 'notPermitted':
      return { text: states.notPermitted, icon: 'alert', tone: 'danger' };
    case 'tooLarge':
    case 'rejected':
      return { text: states.rejected, icon: 'alert', tone: 'danger' };
    case 'consumptionFailed':
      return { text: states.consumptionFailed, icon: 'alert', tone: 'danger' };
    case 'fileMissing':
      return { text: states.fileMissing, icon: 'alert', tone: 'danger' };
    case 'pdfFailed':
      return { text: states.pdfFailed, icon: 'alert', tone: 'danger' };
    case 'unreadable':
      return { text: states.unreadable, icon: 'alert', tone: 'danger' };
  }
}

function reasonText(look: RowLook): string | null {
  switch (look.kind) {
    case 'tooLarge':
      return copy.uploads.tooLarge(look.bytes);
    case 'rejected':
    case 'consumptionFailed':
    case 'pdfFailed':
      return look.message;
    default:
      return null;
  }
}

function toneColor(tone: StateLine['tone'], colors: Colors): string {
  switch (tone) {
    case 'muted':
      return colors.inkMuted;
    case 'accent':
      return colors.accent;
    case 'success':
      return colors.success;
    case 'danger':
      return colors.danger;
  }
}

function fileBytes(path: string): number | null {
  const file = new File(path);
  return file.exists ? file.size : null;
}

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), minute);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function confirmDelete(job: UploadJob) {
  Alert.alert(copy.uploads.deleteTitle, copy.uploads.deleteMessage(job.fields.title), [
    { text: copy.uploads.cancel, style: 'cancel' },
    {
      text: copy.uploads.delete,
      style: 'destructive',
      onPress: () => {
        uploadQueue.remove(job.id).catch(reportUploadError);
      },
    },
  ]);
}

export default function UploadsScreen() {
  const colors = useColors();
  const router = useRouter();
  const online = useOnline();
  const now = useMinuteClock();
  const { account } = useSignedIn();
  const snapshot = useUploadQueue();
  const sections = uploadSections(snapshot.jobs, AccountId.parse(account.id), {
    now,
    online,
    progress: snapshot.progress,
    fileBytes,
  }).map((section) => ({ ...section, data: section.rows }));

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <View style={styles.topBar}>
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
          {copy.uploads.title}
        </Text>
        <AccountButton />
      </View>
      {!online && (
        <View accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: colors.warningSoft }]}>
          <Icon name="offline" color={colors.warning} size={20} />
          <Text style={[styles.bannerText, { color: colors.ink }]}>{copy.uploads.offline}</Text>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.job.id}
        renderItem={({ item, index }) => (
          <UploadRowView
            row={item}
            divided={index > 0}
            now={now}
            onOpen={(documentId) => router.push(`/document/${documentId}`)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={[styles.groupHead, { color: colors.inkMuted }]}>
            {copy.uploads.sectionHeading(copy.uploads.batchHeading(section.createdAt, now), section.rows.length)}
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<Message title={copy.uploads.emptyTitle} lead={copy.uploads.emptyLead} />}
        ListFooterComponent={
          <Text style={[styles.footer, { color: colors.inkMuted }]}>{copy.uploads.closedApp}</Text>
        }
        contentContainerStyle={styles.listEnd}
      />
    </SafeAreaView>
  );
}

type UploadRowViewProps = {
  row: UploadRow;
  divided: boolean;
  now: number;
  onOpen: (documentId: number) => void;
};

function UploadRowView({ row, divided, now, onOpen }: UploadRowViewProps) {
  const colors = useColors();
  const { job, look } = row;
  const line = stateLine(look, now);
  const reason = reasonText(look);
  const title = job.fields.title;
  return (
    <View style={[styles.row, divided && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <View style={[styles.thumb, { backgroundColor: colors.paper, borderColor: colors.line }]} />
      <View style={styles.main}>
        <Text style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text>
        <View style={styles.state}>
          <Icon name={line.icon} color={toneColor(line.tone, colors)} size={18} />
          <Text style={[styles.stateText, { color: toneColor(line.tone, colors) }]}>{line.text}</Text>
        </View>
        {look.kind === 'sending' && <ProgressLine progress={look.progress} />}
        {reason !== null && <Text style={[styles.reason, { color: colors.ink }]}>{reason}</Text>}
        {(look.kind === 'done' || row.canRetry || row.canDelete) && (
          <View style={styles.actions}>
            {look.kind === 'done' && (
              <Button
                label={copy.uploads.open}
                accessibilityLabel={copy.uploads.openLabel(title)}
                variant="outline"
                compact
                onPress={() => onOpen(look.documentId)}
              />
            )}
            {row.canRetry && (
              <Button
                label={copy.uploads.retry}
                accessibilityLabel={copy.uploads.retryLabel(title)}
                variant="tonal"
                compact
                onPress={() => {
                  uploadQueue.retry(job.id).catch(reportUploadError);
                }}
              />
            )}
            {row.canDelete && (
              <Button
                label={copy.uploads.delete}
                accessibilityLabel={copy.uploads.deleteLabel(title)}
                icon="trash"
                variant="outline"
                compact
                onPress={() => confirmDelete(job)}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function ProgressLine({ progress }: { progress: Progress | null }) {
  const colors = useColors();
  const share = progress === null || progress.total === 0 ? 0 : progress.sent / progress.total;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      style={styles.progressLine}
    >
      <View style={[styles.progress, { backgroundColor: colors.surfaceSunken }]}>
        <View style={[styles.progressDone, { width: `${share * 100}%`, backgroundColor: colors.accent }]} />
      </View>
      {progress !== null && progress.total > 0 && (
        <Text style={[styles.percent, { color: colors.inkMuted }]}>
          {copy.uploads.percent(progress.sent, progress.total)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingInlineStart: 20, paddingInlineEnd: 8 },
  title: { flex: 1, fontSize: 22, fontWeight: '500' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBlock: 12, paddingInline: 20 },
  bannerText: { flex: 1, fontSize: 14 },
  groupHead: { paddingBlockStart: 16, paddingBlockEnd: 6, paddingInline: 20, fontSize: 13.5, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingBlock: 12, paddingInlineStart: 20, paddingInlineEnd: 12 },
  thumb: { width: 40, height: 53, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontSize: 15.5, fontWeight: '500' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateText: { flexShrink: 1, fontSize: 13.5, fontWeight: '500' },
  reason: { fontSize: 13.5 },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBlockStart: 2 },
  progress: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressDone: { height: '100%' },
  percent: { fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBlockStart: 6 },
  footer: { paddingInline: 20, paddingBlockStart: 20, fontSize: 13.5 },
  listEnd: { paddingBlockEnd: 200 },
});
