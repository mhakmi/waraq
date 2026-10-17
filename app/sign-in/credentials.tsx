import { fetch } from 'expo/fetch';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { useSession } from '../../src/session';
import { type Credentials, type Server, signIn } from '../../src/signin/connect';
import { useSignInDraft } from '../../src/signin/draft';
import { touchTarget, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Icon } from '../../src/ui/Icon';
import { BackBar } from '../../src/ui/TopBar';

export default function CredentialsScreen() {
  const draft = useSignInDraft();
  if (draft.server === null) {
    return <Redirect href="/sign-in" />;
  }
  return <CredentialsForm server={draft.server} />;
}

function CredentialsForm({ server }: { server: Server }) {
  const colors = useColors();
  const router = useRouter();
  const draft = useSignInDraft();
  const session = useSession();
  const [method, setMethod] = useState<'password' | 'token'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordShown, setPasswordShown] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const ready =
    method === 'token' ? token.trim() !== '' : username.trim() !== '' && password !== '' && code?.trim() !== '';

  async function onSignIn() {
    const credentials: Credentials =
      method === 'token' ? { kind: 'token', token } : { kind: 'password', username, password, code };
    setBusy(true);
    const result = await signIn(server, credentials, fetch, Date.now());
    if (result.kind === 'signed_in') {
      await session.signIn(result.stored);
      return;
    }
    setBusy(false);
    if (result.kind === 'code_required') {
      setCode('');
      return;
    }
    draft.update({
      attempt: {
        address: draft.address.trim(),
        host: server.host,
        isHttp: server.isHttp,
        headerNames: Object.keys(server.headers),
        method,
        failure: result.failure,
      },
    });
    router.push('/sign-in/failed');
  }

  return (
    <SafeAreaView style={styles.fill}>
      <BackBar />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.found, { backgroundColor: colors.successSoft }]}>
          <Icon name="passed" color={colors.success} />
          <Text style={[styles.grow, styles.body, { color: colors.ink }]}>{copy.signIn.found(server.host)}</Text>
          <Button label={copy.signIn.change} onPress={() => router.back()} variant="text" />
        </View>

        {server.isHttp && (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
            <Icon name="alert" color={colors.warning} size={18} />
            <Text style={[styles.grow, styles.noticeText, { color: colors.ink }]}>{copy.signIn.plainHttpWarning}</Text>
          </View>
        )}

        <View style={styles.stack}>
          {method === 'password' ? (
            <>
              <Field
                label={copy.signIn.usernameLabel}
                value={username}
                onChangeText={setUsername}
                autoComplete="username"
                plainText
              />
              <Field
                label={copy.signIn.passwordLabel}
                value={password}
                onChangeText={setPassword}
                autoComplete="current-password"
                secureTextEntry={!passwordShown}
                plainText
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={passwordShown ? copy.signIn.hidePassword : copy.signIn.showPassword}
                    onPress={() => setPasswordShown(!passwordShown)}
                    style={styles.iconButton}
                  >
                    <Icon name="eye" color={colors.inkMuted} />
                  </Pressable>
                }
              />
              {code !== null && (
                <>
                  <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
                    <Icon name="shield" color={colors.onAccentSoft} size={18} />
                    <Text style={[styles.grow, styles.noticeText, { color: colors.onAccentSoft }]}>
                      {copy.signIn.codeAsked}
                    </Text>
                  </View>
                  <Field
                    label={copy.signIn.codeLabel}
                    value={code}
                    onChangeText={setCode}
                    placeholder={copy.signIn.codePlaceholder}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    autoFocus
                    plainText
                  />
                </>
              )}
            </>
          ) : (
            <Field
              label={copy.signIn.tokenLabel}
              value={token}
              onChangeText={setToken}
              help={copy.signIn.tokenHelp}
              secureTextEntry
              plainText
            />
          )}
          <Button label={copy.signIn.signIn} onPress={onSignIn} large busy={busy} disabled={!ready} />
          <View style={styles.center}>
            <Button
              label={method === 'password' ? copy.signIn.useToken : copy.signIn.usePassword}
              onPress={() => setMethod(method === 'password' ? 'token' : 'password')}
              variant="text"
              icon="key"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center' },
  content: { paddingInline: 20, paddingBlockEnd: 32 },
  body: { fontSize: 15 },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBlock: 6,
    paddingInlineStart: 16,
    paddingInlineEnd: 4,
    borderRadius: 12,
    marginBlockEnd: 16,
  },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBlock: 12, paddingInline: 14, borderRadius: 12, marginBlockEnd: 16 },
  noticeText: { fontSize: 14.5 },
  stack: { gap: 16 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
});
