import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy } from '../copy';
import { useColors } from '../theme';

type SheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  headerAction?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function Sheet({ visible, title, onClose, headerAction, footer, children }: SheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.picker.close}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
        />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceRaised, paddingBottom: insets.bottom, marginTop: insets.top + 24 }]}>
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: colors.line }]} />
          </View>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
              {title}
            </Text>
            {headerAction}
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={[styles.foot, { borderTopColor: colors.line }]}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopStartRadius: 24, borderTopEndRadius: 24, overflow: 'hidden' },
  handle: { height: 20, alignItems: 'center', justifyContent: 'center' },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  head: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingInlineStart: 20, paddingInlineEnd: 8 },
  title: { fontSize: 20, fontWeight: '500', flexShrink: 1 },
  body: { paddingInline: 20, paddingBlockStart: 4, paddingBlockEnd: 16, gap: 18 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBlock: 12, paddingInline: 16, borderTopWidth: 1 },
});
