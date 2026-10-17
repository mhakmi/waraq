import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy } from '../copy';
import { useColors } from '../theme';
import { Icon, type IconName } from './Icon';

export type MenuItem = { label: string; icon: IconName; danger?: boolean; onPress: () => void };

export function Menu({ visible, items, onClose }: { visible: boolean; items: MenuItem[]; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.picker.close} onPress={onClose} style={styles.fill} />
      <View
        accessibilityRole="menu"
        style={[styles.menu, { top: insets.top + 56, backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}
      >
        {items.map((item) => {
          const color = item.danger ? colors.danger : colors.ink;
          return (
            <Pressable
              key={item.label}
              accessibilityRole="menuitem"
              accessibilityLabel={item.label}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surfaceSunken }]}
            >
              <Icon name={item.icon} color={color} />
              <Text style={[styles.label, { color }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  menu: { position: 'absolute', end: 8, minWidth: 220, paddingBlock: 8, borderRadius: 12, borderWidth: 1, elevation: 8 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingInlineStart: 16, paddingInlineEnd: 20 },
  label: { fontSize: 15 },
});
