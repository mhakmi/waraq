import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../copy';
import { useColors } from '../theme';

export function Placeholder({ title, top }: { title: string; top?: ReactNode }) {
  const colors = useColors();
  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      {top}
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {title}
        </Text>
        <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.placeholder.comingSoon}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingInline: 20, paddingBlockStart: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '500' },
  lead: { fontSize: 16 },
});
