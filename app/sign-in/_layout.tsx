import { Stack } from 'expo-router/stack';

import { useColors } from '../../src/theme';

export default function SignInLayout() {
  const colors = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}
