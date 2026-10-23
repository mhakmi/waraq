import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../copy';
import { useColors } from '../theme';
import { Button } from '../ui/Button';
import { recordCrash } from './record';

export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const colors = useColors();
  useEffect(() => recordCrash('screen', error), [error]);
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
        {copy.crash.heading}
      </Text>
      <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.crash.lead}</Text>
      <Button label={copy.crash.tryAgain} onPress={retry} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center', paddingInline: 20, gap: 16 },
  heading: { fontSize: 28, fontWeight: '500' },
  lead: { fontSize: 16 },
});
