import type { Query } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';

import { shouldPersist } from '../src/cache/keys';
import { queryPersister } from '../src/cache/persister';
import { installCrashHandlers, rememberSecrets } from '../src/crash/record';
import { ScreenError } from '../src/crash/ScreenError';
import { connectQueriesToDevice, queryClient, savedForMs } from '../src/query';
import { SessionProvider, useSession } from '../src/session';
import { useColors, useIsDark } from '../src/theme';
import { registerUploadTask } from '../src/upload/background';
import { connectUploadsToDevice, runUploads } from '../src/upload/queue';

installCrashHandlers();

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
  const signedIn = state.kind === 'signedIn';
  // Set while rendering, so a screen that throws in its first render already has the secrets taken out.
  if (state.kind === 'signedIn') {
    const { account, secrets } = state.stored;
    rememberSecrets({ values: [secrets.token, ...Object.values(secrets.headerValues)], headerNames: account.extraHeaders });
  }
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    registerUploadTask().catch((error) => console.warn('The background upload task could not be registered', error));
    runUploads();
    return connectUploadsToDevice();
  }, [signedIn]);
  if (state.kind === 'loading') {
    return <View style={[styles.fill, { backgroundColor: colors.surface }]} />;
  }
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}
      unstable_screenErrorBoundary={ScreenError}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan/index" />
        <Stack.Screen name="scan/pages/[id]" />
        <Stack.Screen name="scan/details" />
        <Stack.Screen name="document/[id]/index" />
        <Stack.Screen name="document/[id]/edit" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export { ScreenError as ErrorBoundary };

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
