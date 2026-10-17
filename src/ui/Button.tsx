import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { type Colors, touchTarget, useColors } from '../theme';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'outline' | 'tonal' | 'text';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  large?: boolean;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
};

function variantColors(variant: Variant, colors: Colors) {
  switch (variant) {
    case 'primary':
      return { background: colors.accent, text: colors.onAccent, border: colors.accent };
    case 'outline':
      return { background: colors.surfaceRaised, text: colors.ink, border: colors.line };
    case 'tonal':
      return { background: colors.accentSoft, text: colors.onAccentSoft, border: colors.accentSoft };
    case 'text':
      return { background: 'transparent', text: colors.accent, border: 'transparent' };
  }
}

export function Button({ label, onPress, variant = 'primary', large = false, icon, busy = false, disabled = false }: ButtonProps) {
  const colors = useColors();
  const look = variantColors(variant, colors);
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && styles.large,
        { backgroundColor: look.background, borderColor: look.border, opacity: pressed || disabled ? 0.7 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={look.text} /> : icon && <Icon name={icon} color={look.text} size={18} />}
      <Text style={[styles.label, large && styles.largeLabel, { color: look.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingInline: 20,
    borderRadius: 999,
    borderWidth: 1,
  },
  large: { minHeight: 56 },
  label: { fontSize: 15, fontWeight: '500', textAlign: 'center', flexShrink: 1 },
  largeLabel: { fontSize: 16 },
});
