import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '../theme';
import { Icon, type IconName } from './Icon';

export const tabBarHeight = 80;

const tabIcons: Record<string, IconName> = {
  index: 'documents',
  inbox: 'inbox',
  uploads: 'upload',
};

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: colors.surfaceRaised, borderTopColor: colors.line, paddingBottom: 14 + insets.bottom },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const options = descriptors[route.key].options;
        const label = options.title ?? route.name;
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigateToTab(route.key);
          }
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.item}
          >
            {/* Without a background the pill has no Android view of its own. The view made for it again on the next visit showed square corners. */}
            <View collapsable={false} style={[styles.pill, focused && { backgroundColor: colors.accentSoft }]}>
              <Icon name={tabIcons[route.name]} color={focused ? colors.onAccentSoft : colors.inkMuted} />
              {options.tabBarBadge !== undefined && (
                <View style={[styles.count, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.countText, { color: colors.onAccent }]}>{options.tabBarBadge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color: focused ? colors.ink : colors.inkMuted }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', minHeight: tabBarHeight, paddingTop: 10, borderTopWidth: 1 },
  item: { flex: 1, minHeight: 56, alignItems: 'center', gap: 4 },
  pill: { width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12.5, fontWeight: '500' },
  count: {
    position: 'absolute',
    top: -4,
    end: 6,
    minWidth: 20,
    height: 20,
    paddingInline: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 12, fontWeight: '600' },
});
