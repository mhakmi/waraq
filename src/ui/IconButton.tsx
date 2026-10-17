import { Pressable, StyleSheet } from 'react-native';

import { touchTarget, useColors } from '../theme';
import { Icon, type IconName } from './Icon';

type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  raised?: boolean;
  selected?: boolean;
};

export function IconButton({ icon, label, onPress, color, raised = false, selected = false }: IconButtonProps) {
  const colors = useColors();
  const background = selected ? colors.accent : raised ? colors.surfaceRaised : 'transparent';
  const tint = selected ? colors.onAccent : (color ?? colors.ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        raised && styles.raised,
        { backgroundColor: background, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} color={tint} size={raised ? 20 : 22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: touchTarget, height: touchTarget, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  raised: { borderRadius: 12, elevation: 2 },
});
