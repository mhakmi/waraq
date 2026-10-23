import type { ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, useColors } from '../theme';
import { Icon, type IconName } from '../ui/Icon';
import { BackBar } from '../ui/TopBar';

export function TitleBar({ title, children }: { title: string; children?: ReactNode }) {
  const colors = useColors();
  return (
    <BackBar>
      <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
        {title}
      </Text>
      {children}
    </BackBar>
  );
}

export function SectionTitle({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.inkMuted }]}>
      {title}
    </Text>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>{children}</View>;
}

type RowProps = {
  label: string;
  icon?: IconName;
  end?: string;
  divided: boolean;
  onPress: () => void;
};

export function Row({ label, icon, end, divided, onPress }: RowProps) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={end === undefined ? label : `${label}, ${end}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divided && { borderTopWidth: 1, borderTopColor: colors.line },
        pressed && { backgroundColor: colors.surfaceSunken },
      ]}
    >
      {icon && <Icon name={icon} color={colors.ink} />}
      <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
      {end !== undefined && <Text style={[styles.rowEnd, { color: colors.inkMuted }]}>{end}</Text>}
      <View style={I18nManager.isRTL && styles.flipped}>
        <Icon name="chevronEnd" color={colors.inkMuted} size={18} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: '500' },
  sectionTitle: { paddingBlockStart: 20, paddingBlockEnd: 8, paddingInline: 20, fontSize: 14, fontWeight: '600' },
  card: { marginInline: 16, borderWidth: 1, borderRadius: radius, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingBlock: 8, paddingInlineStart: 16, paddingInlineEnd: 12 },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 15 },
  rowEnd: { fontSize: 14 },
  flipped: { transform: [{ scaleX: -1 }] },
});
