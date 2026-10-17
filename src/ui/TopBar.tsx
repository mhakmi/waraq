import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';

import { copy } from '../copy';
import { touchTarget, useColors } from '../theme';
import { Icon } from './Icon';

export function BackBar({ children }: { children?: ReactNode }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.shell.back}
        onPress={() => router.back()}
        style={styles.iconButton}
      >
        <View style={I18nManager.isRTL && styles.flipped}>
          <Icon name="back" color={colors.ink} />
        </View>
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingInlineStart: 4, paddingInlineEnd: 8 },
  iconButton: { width: touchTarget, height: touchTarget, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  flipped: { transform: [{ scaleX: -1 }] },
});
