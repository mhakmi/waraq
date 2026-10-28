import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { useLabels } from '../../src/labels';
import { isForbidden } from '../../src/query';
import { useSession, useSignedIn } from '../../src/session';
import { labelKindOrder } from '../../src/settings/labelKinds';
import { Card, Row, SectionTitle, TitleBar } from '../../src/settings/parts';
import { useCan } from '../../src/settings/usePermissions';
import { themeChoices, useThemeChoice } from '../../src/settings/theme';
import { hostOf } from '../../src/signin/connect';
import { touchTarget, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { useUploadQueue } from '../../src/upload/queue';
import { unfinishedCount } from '../../src/upload/rows';

const privacyUrl = 'https://mhakmi.dev/waraq/privacy';
const sourceUrl = 'https://github.com/mhakmi/waraq';

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const labels = useLabels();
  const can = useCan();
  const readableKinds = labelKindOrder.filter((kind) => can('view', kind) && !isForbidden(labels[kind].error));

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <TitleBar title={copy.settings.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <AccountCard />

        <SectionTitle title={copy.settings.appearance} />
        <Card>
          <ThemePicker />
        </Card>

        {readableKinds.length > 0 && (
          <>
            <SectionTitle title={copy.settings.labels} />
            <Card>
              {readableKinds.map((kind, index) => (
                <Row
                  key={kind}
                  label={copy.labels.kinds[kind].title}
                  end={labels[kind].data === undefined ? undefined : String(labels[kind].data.length)}
                  divided={index > 0}
                  onPress={() => router.push(`/settings/labels/${kind}`)}
                />
              ))}
            </Card>
          </>
        )}

        <SectionTitle title={copy.settings.other} />
        <Card>
          <Row icon="shield" label={copy.settings.permissions} divided={false} onPress={() => router.push('/settings/permissions')} />
          <Row icon="bug" label={copy.settings.crashReport} divided onPress={() => router.push('/settings/crash-log')} />
          <Row icon="files" label={copy.settings.licenses} divided onPress={() => router.push('/settings/licenses')} />
          <Row icon="lock" label={copy.settings.privacy} divided onPress={() => Linking.openURL(privacyUrl)} />
          <Row icon="code" label={copy.settings.sourceCode} divided onPress={() => Linking.openURL(sourceUrl)} />
          <View style={[styles.about, { borderTopColor: colors.line }]}>
            <View style={styles.aboutHead}>
              <Icon name="info" color={colors.ink} />
              <Text accessibilityRole="header" style={[styles.aboutTitle, { color: colors.ink }]}>
                {copy.settings.about}
              </Text>
            </View>
            <Text style={[styles.aboutText, { color: colors.inkMuted }]}>
              {copy.settings.aboutText(Constants.expoConfig?.version ?? '')}
            </Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountCard() {
  const colors = useColors();
  const session = useSession();
  const { account } = useSignedIn();
  const unfinished = unfinishedCount(useUploadQueue().jobs, account.id);

  function askToSignOut() {
    const message = copy.account.signOutMessage(account.username, hostOf(account.serverUrl));
    const uploads = unfinished === 0 ? '' : ` ${copy.account.signOutWithUploads(unfinished)}`;
    Alert.alert(copy.account.signOutTitle, message + uploads, [
      { text: copy.account.cancel, style: 'cancel' },
      { text: copy.account.signOut, style: 'destructive', onPress: () => session.signOut() },
    ]);
  }

  return (
    <View style={[styles.account, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
      <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
        <Text style={[styles.initial, { color: colors.onAccent }]}>{account.username.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.accountText}>
        <Text style={[styles.username, { color: colors.ink }]}>{account.username}</Text>
        <Text style={[styles.sub, { color: colors.inkMuted }]}>{hostOf(account.serverUrl)}</Text>
        <Text style={[styles.sub, { color: colors.inkMuted }]}>{copy.settings.serverVersion(account.serverVersion)}</Text>
      </View>
      <Button label={copy.settings.signOut} icon="signOut" variant="outline" compact onPress={askToSignOut} />
    </View>
  );
}

function ThemePicker() {
  const colors = useColors();
  const [choice, choose] = useThemeChoice();
  return (
    <View style={styles.themePick}>
      <Text style={[styles.fieldLabel, { color: colors.inkMuted }]}>{copy.settings.theme}</Text>
      <View accessibilityRole="radiogroup" style={[styles.segmented, { borderColor: colors.line, backgroundColor: colors.surfaceRaised }]}>
        {themeChoices.map((option, index) => {
          const selected = option === choice;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => choose(option)}
              style={[
                styles.segment,
                index > 0 && { borderStartWidth: 1, borderStartColor: colors.line },
                selected && { backgroundColor: colors.accentSoft },
              ]}
            >
              <Text style={[styles.segmentText, { color: selected ? colors.onAccentSoft : colors.ink }]}>
                {copy.settings.themes[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBlockEnd: 32 },
  account: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    marginInline: 16,
    marginBlockStart: 8,
    padding: 16,
    borderWidth: 1,
    borderRadius: 14,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 22, fontWeight: '600' },
  accountText: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
  username: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 14 },
  themePick: { paddingBlockStart: 12, paddingBlockEnd: 16, paddingInline: 16, gap: 8 },
  fieldLabel: { fontSize: 13.5, fontWeight: '500' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  segment: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', paddingInline: 8 },
  segmentText: { fontSize: 14.5, fontWeight: '500', textAlign: 'center' },
  about: { paddingBlock: 12, paddingInline: 16, gap: 8, borderTopWidth: 1 },
  aboutHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  aboutTitle: { fontSize: 15 },
  aboutText: { fontSize: 14 },
});
