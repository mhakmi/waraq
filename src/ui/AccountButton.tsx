import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { useSession, useSignedIn } from '../session';
import { hostOf } from '../signin/connect';
import { touchTarget, useColors } from '../theme';

export function AccountButton() {
  const colors = useColors();
  const { account } = useSignedIn();
  const session = useSession();

  function askToSignOut() {
    Alert.alert(copy.account.signOutTitle, copy.account.signOutMessage(account.username, hostOf(account.serverUrl)), [
      { text: copy.account.cancel, style: 'cancel' },
      { text: copy.account.signOut, style: 'destructive', onPress: () => session.signOut() },
    ]);
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={copy.shell.account} onPress={askToSignOut} style={styles.button}>
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
