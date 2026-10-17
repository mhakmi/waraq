import { Stack } from 'expo-router/stack';

import { SignInDraftProvider } from '../../src/signin/draft';
import { useColors } from '../../src/theme';

export default function SignInLayout() {
  const colors = useColors();
  return (
    <SignInDraftProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
    </SignInDraftProvider>
  );
}
