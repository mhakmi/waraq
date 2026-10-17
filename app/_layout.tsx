import type { Query } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shouldPersist } from '../src/cache/keys';
import { queryPersister } from '../src/cache/persister';
import { copy } from '../src/copy';
import { connectQueriesToDevice, queryClient, savedForMs } from '../src/query';
import { SessionProvider, useSession } from '../src/session';
import { useColors, useIsDark } from '../src/theme';
import { Button } from '../src/ui/Button';

const persistOptions = {
  persister: queryPersister,
  maxAge: savedForMs,
  buster: Constants.expoConfig?.version ?? '',
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === 'success' && shouldPersist(query.queryKey),
  },
};

export default function RootLayout() {
  useEffect(connectQueriesToDevice, []);
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <SessionProvider>
        <SystemBars />
        <Screens />
      </SessionProvider>
    </PersistQueryClientProvider>
  );
}

function SystemBars() {
  const isDark = useIsDark();
  return <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />;
}

function Screens() {
  const { state } = useSession();
  const colors = useColors();
  if (state.kind === 'loading') {
    return <View style={[styles.fill, { backgroundColor: colors.surface }]} />;
  }
  const signedIn = state.kind === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" />
        <Stack.Screen name="document/[id]/index" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const colors = useColors();
  return (
    <SafeAreaView style={[styles.fill, styles.crash, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
        {copy.crash.heading}
      </Text>
      <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.crash.lead}</Text>
      <Button label={copy.crash.tryAgain} onPress={retry} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  crash: { justifyContent: 'center', paddingInline: 20, gap: 16 },
  heading: { fontSize: 28, fontWeight: '500' },
  lead: { fontSize: 16 },
});
