import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { useColors } from '../theme';
import { Icon } from './Icon';

export function Message({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.message}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        {title}
      </Text>
      <Text style={[styles.lead, { color: colors.inkMuted }]}>{lead}</Text>
      {children}
    </View>
  );
}

export function SavedCopyLine() {
  const colors = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.line, { backgroundColor: colors.surfaceSunken }]}>
      <Icon name="offline" color={colors.inkMuted} size={18} />
      <Text style={[styles.lineText, { color: colors.inkMuted }]}>{copy.offline.savedCopy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { paddingInline: 20, paddingBlockStart: 32, gap: 8, alignItems: 'flex-start' },
  title: { fontSize: 18, fontWeight: '500' },
  lead: { fontSize: 15 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBlock: 8, paddingInline: 20 },
  lineText: { fontSize: 13.5, flexShrink: 1 },
});
