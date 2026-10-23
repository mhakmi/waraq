import { Pressable, StyleSheet, Text, View } from 'react-native';

import { touchTarget, useColors } from '../theme';
import { Icon, type IconName } from './Icon';

type ChipProps = {
  label: string;
  onPress: () => void;
  selected?: boolean;
  icon?: IconName;
  trailingIcon?: IconName;
  accessibilityLabel?: string;
};

export function Chip({ label, onPress, selected = false, icon, trailingIcon, accessibilityLabel }: ChipProps) {
  const colors = useColors();
  const ink = selected ? colors.onAccentSoft : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.target}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.chip,
            selected
              ? { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }
              : { backgroundColor: colors.surfaceRaised, borderColor: colors.line },
            pressed && { opacity: 0.7 },
          ]}
        >
          {icon && <Icon name={icon} color={ink} size={18} />}
          {label !== '' && <Text style={[styles.label, { color: ink }]}>{label}</Text>}
          {trailingIcon && <Icon name={trailingIcon} color={ink} size={18} />}
        </View>
      )}
    </Pressable>
  );
}

export function TagPill({ name, inbox }: { name: string; inbox: boolean }) {
  const colors = useColors();
  return (
    <Text
      style={[
        styles.tag,
        inbox
          ? { backgroundColor: colors.accentSoft, color: colors.onAccentSoft }
          : { backgroundColor: colors.surfaceSunken, color: colors.ink },
      ]}
    >
      {name}
    </Text>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center' },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingInline: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  label: { fontSize: 14, fontWeight: '500' },
  tag: { paddingBlock: 2, paddingInline: 8, borderRadius: 6, fontSize: 12.5, fontWeight: '500', overflow: 'hidden' },
});
