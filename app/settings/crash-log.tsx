import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { clearCrashLog, crashLogFile, readCrashLog } from '../../src/crash/record';
import { TitleBar } from '../../src/settings/parts';
import { radius, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';

export default function CrashLogScreen() {
  const colors = useColors();
  const [log, setLog] = useState(readCrashLog);
  const [shareFailed, setShareFailed] = useState(false);

  async function send() {
    setShareFailed(false);
    try {
      await Sharing.shareAsync(crashLogFile().uri, { mimeType: 'text/plain', dialogTitle: copy.crashLog.shareTitle });
    } catch {
      setShareFailed(true);
    }
  }

  function askToDelete() {
    Alert.alert(copy.crashLog.deleteTitle, copy.crashLog.deleteMessage, [
      { text: copy.crashLog.cancel, style: 'cancel' },
      {
        text: copy.crashLog.delete,
        style: 'destructive',
        onPress: () => {
          clearCrashLog();
          setLog('');
        },
      },
    ]);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <TitleBar title={copy.crashLog.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.crashLog.lead}</Text>
        {log === '' ? (
          <Text style={[styles.lead, { color: colors.ink }]}>{copy.crashLog.empty}</Text>
        ) : (
          <View style={[styles.log, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
            <Text selectable style={[styles.logText, { color: colors.ink }]}>
              {log}
            </Text>
          </View>
        )}
        {shareFailed && <Text style={[styles.lead, { color: colors.danger }]}>{copy.crashLog.shareFailed}</Text>}
      </ScrollView>
      {log !== '' && (
        <View style={[styles.actions, { borderTopColor: colors.line }]}>
          <Button label={copy.crashLog.delete} variant="outline" onPress={askToDelete} />
          <Button label={copy.crashLog.send} icon="share" onPress={send} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingInline: 20, paddingBlockEnd: 24, gap: 16 },
  lead: { fontSize: 15 },
  log: { borderWidth: 1, borderRadius: radius, padding: 12 },
  logText: { fontFamily: 'monospace', fontSize: 12.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, paddingBlock: 12, paddingInline: 16, borderTopWidth: 1 },
});
