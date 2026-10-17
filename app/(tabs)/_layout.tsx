import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as Scanner from '../../modules/scanner';
import { copy } from '../../src/copy';
import { takeSharedFiles } from '../../src/scan/scanning';
import { discardBatch, loadBatch, onBatchQueued } from '../../src/scan/store';
import { useSignedIn } from '../../src/session';
import { useColors } from '../../src/theme';
import { Icon } from '../../src/ui/Icon';
import { Snackbar, SnackbarProvider, useSnackbarState } from '../../src/ui/Snackbar';
import { TabBar, tabBarHeight } from '../../src/ui/TabBar';
import { AccountId } from '../../src/upload/machine';

const snackbarSpace = 76;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbarState();
  const router = useRouter();
  const accountId = AccountId.parse(useSignedIn().account.id);
  const aboveTabs = tabBarHeight + insets.bottom;
  const showSnackbar = snackbar.show;

  useEffect(() => {
    Scanner.prepare().catch(() => {});
  }, []);

  useEffect(
    () =>
      onBatchQueued((count) =>
        showSnackbar({ text: copy.scan.added(count), action: { label: copy.scan.view, onPress: () => router.navigate('/uploads') } }),
      ),
    [showSnackbar, router],
  );

  useEffect(() => {
    async function receive() {
      const { added, problem } = await takeSharedFiles(accountId);
      if (problem !== null) {
        Alert.alert(problem);
      }
      if (added > 0) {
        router.navigate('/scan');
      }
    }
    receive();
    const subscription = Scanner.addShareListener(receive);
    return () => subscription.remove();
  }, [accountId, router]);

  async function startScan() {
    const batch = await loadBatch(accountId);
    const scanNew = () => router.push({ pathname: '/scan', params: { start: 'scan' } });
    if (batch === null) {
      scanNew();
      return;
    }
    Alert.alert(copy.scan.continueTitle, copy.scan.continueMessage(batch.documents.length), [
      { text: copy.scan.cancel, style: 'cancel' },
      {
        text: copy.scan.startOver,
        style: 'destructive',
        onPress: () => {
          discardBatch();
          scanNew();
        },
      },
      { text: copy.scan.continueBatch, onPress: () => router.push('/scan') },
    ]);
  }
  return (
    <SnackbarProvider value={snackbar.show}>
      <View style={styles.fill}>
        <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="index" options={{ title: copy.shell.inbox }} />
          <Tabs.Screen name="documents" options={{ title: copy.shell.documents }} />
          <Tabs.Screen name="uploads" options={{ title: copy.shell.uploads }} />
        </Tabs>
        <ScanButton bottom={aboveTabs + 20 + (snackbar.message === null ? 0 : snackbarSpace)} onPress={startScan} />
        <Snackbar message={snackbar.message} bottom={aboveTabs + 12} onHide={snackbar.hide} />
      </View>
    </SnackbarProvider>
  );
}

function ScanButton({ bottom, onPress }: { bottom: number; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.shell.scan}
      onPress={onPress}
      style={[styles.scan, { backgroundColor: colors.accent, bottom }]}
    >
      <Icon name="scan" color={colors.onAccent} size={26} />
      <Text style={[styles.scanLabel, { color: colors.onAccent }]}>{copy.shell.scan}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scan: {
    position: 'absolute',
    end: 16,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingInlineStart: 22,
    paddingInlineEnd: 26,
    borderRadius: 20,
    elevation: 6,
  },
  scanLabel: { fontSize: 17, fontWeight: '600' },
});
