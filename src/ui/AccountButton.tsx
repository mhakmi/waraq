import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { useSignedIn } from '../session';
import { touchTarget, useColors } from '../theme';

export function AccountButton() {
  const colors = useColors();
  const router = useRouter();
  const { account } = useSignedIn();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={copy.shell.account} onPress={() => router.push('/settings')} style={styles.button}>
      <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
        <Text style={[styles.initial, { color: colors.onAccent }]}>{account.username.slice(0, 1).toUpperCase()}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 15, fontWeight: '600' },
});
