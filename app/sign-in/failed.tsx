import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { type Attempt, checklistRows, connectionReport } from '../../src/signin/checklist';
import { useSignInDraft } from '../../src/signin/draft';
import { type Colors, radius, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { BackBar } from '../../src/ui/TopBar';

export default function FailedScreen() {
  const draft = useSignInDraft();
  if (draft.attempt === null) {
    return <Redirect href="/sign-in" />;
  }
  return <Checklist attempt={draft.attempt} />;
}

function stateColors(state: 'passed' | 'failed' | 'skipped', colors: Colors) {
  switch (state) {
    case 'passed':
      return { icon: colors.success, name: colors.ink, detail: colors.inkMuted, background: 'transparent' };
    case 'failed':
      return { icon: colors.danger, name: colors.danger, detail: colors.ink, background: colors.dangerSoft };
    case 'skipped':
      return { icon: colors.inkMuted, name: colors.inkMuted, detail: colors.inkMuted, background: 'transparent' };
  }
}

function Checklist({ attempt }: { attempt: Attempt }) {
  const colors = useColors();
  const router = useRouter();
  const draft = useSignInDraft();
  const [copied, setCopied] = useState(false);
  const rows = checklistRows(attempt);

  async function copyReport() {
    const report = connectionReport(attempt, {
      appVersion: Constants.expoConfig?.version ?? '',
      android: String(Platform.Version),
      now: new Date(),
    });
    await Clipboard.setStringAsync(report);
    setCopied(true);
  }

  function openOptions() {
    draft.update({ optionsOpen: true });
    router.dismissTo('/sign-in');
  }

  return (
    <SafeAreaView style={styles.fill}>
      <BackBar />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
          {copy.signIn.failedHeading}
        </Text>
        <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.signIn.failedLead}</Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
          {rows.map((row, index) => {
            const look = stateColors(row.state, colors);
            return (
              <View
                key={row.step}
                style={[
                  styles.row,
                  { backgroundColor: look.background, borderTopColor: colors.line },
                  index > 0 && styles.divided,
                ]}
              >
                <Icon name={row.state} color={look.icon} />
                <View style={styles.rowMain}>
                  <Text style={[styles.name, { color: look.name }]}>{row.name}</Text>
                  <Text style={[styles.detail, { color: look.detail }]}>{row.detail}</Text>
                  {row.fix !== null && <Text style={[styles.fix, { color: colors.ink }]}>{row.fix}</Text>}
                  {attempt.failure.problem.kind === 'login_page' && row.state === 'failed' && (
                    <View style={styles.start}>
                      <Button label={copy.signIn.openOptions} onPress={openOptions} variant="tonal" />
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={[styles.actions, { backgroundColor: colors.surface }]}>
        <Button label={copy.signIn.tryAgain} onPress={() => router.back()} large />
        <Button
          label={copied ? copy.signIn.reportCopied : copy.signIn.copyReport}
          onPress={copyReport}
          variant="outline"
          icon="copy"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignItems: 'flex-start', marginBlockStart: 8 },
  content: { paddingInline: 20, paddingBlockEnd: 24 },
  heading: { fontSize: 28, fontWeight: '500', lineHeight: 35 },
  lead: { fontSize: 16, marginBlockStart: 8, marginBlockEnd: 28 },
  card: { borderWidth: 1, borderRadius: radius, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 14, paddingBlock: 14, paddingInline: 16 },
  divided: { borderTopWidth: 1 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '500' },
  detail: { fontSize: 14 },
  fix: { fontSize: 14, fontWeight: '500', marginBlockStart: 6 },
  actions: { paddingBlock: 12, paddingInline: 16, gap: 8 },
});
