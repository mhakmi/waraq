import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { useColors } from '../../src/theme';
import { Icon } from '../../src/ui/Icon';
import { Snackbar, SnackbarProvider, useSnackbarState } from '../../src/ui/Snackbar';
import { TabBar, tabBarHeight } from '../../src/ui/TabBar';

const snackbarSpace = 76;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbarState();
  const aboveTabs = tabBarHeight + insets.bottom;
  return (
    <SnackbarProvider value={snackbar.show}>
      <View style={styles.fill}>
        <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="index" options={{ title: copy.shell.inbox }} />
          <Tabs.Screen name="documents" options={{ title: copy.shell.documents }} />
          <Tabs.Screen name="uploads" options={{ title: copy.shell.uploads }} />
        </Tabs>
        <ScanButton bottom={aboveTabs + 20 + (snackbar.message === null ? 0 : snackbarSpace)} />
        <Snackbar message={snackbar.message} bottom={aboveTabs + 12} onHide={snackbar.hide} />
      </View>
    </SnackbarProvider>
  );
}

function ScanButton({ bottom }: { bottom: number }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.shell.scan}
      onPress={() => router.push('/scan')}
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
