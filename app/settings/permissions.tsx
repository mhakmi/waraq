import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { errorText, isForbidden } from '../../src/query';
import { useSignedIn } from '../../src/session';
import { Card, SectionTitle, TitleBar } from '../../src/settings/parts';
import { accountAccess } from '../../src/settings/permissions';
import { useUiSettings } from '../../src/settings/usePermissions';
import { useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Message } from '../../src/ui/Message';

export default function PermissionsScreen() {
  const colors = useColors();
  const { account } = useSignedIn();
  const settings = useUiSettings();

  let body: ReactNode;
  if (settings.data !== undefined) {
    const access = accountAccess(new Set(settings.data.permissions));
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.permissions.lead(account.username)}</Text>
        <Card>
          {access.areas.map((entry, index) => (
            <AccessRow
              key={entry.area}
              label={copy.permissions.areas[entry.area]}
              value={copy.permissions.allowed(entry.allowed.map((action) => copy.permissions.verbs[action]))}
              allowed={entry.allowed.length > 0}
              divided={index > 0}
            />
          ))}
        </Card>
        <SectionTitle title={copy.permissions.other} />
        <Card>
          {access.special.map((entry, index) => (
            <AccessRow
              key={entry.permission}
              label={copy.permissions.special[entry.permission]}
              value={entry.allowed ? copy.permissions.yes : copy.permissions.no}
              allowed={entry.allowed}
              divided={index > 0}
            />
          ))}
        </Card>
      </ScrollView>
    );
  } else if (settings.isError) {
    const lead = isForbidden(settings.error) ? copy.permissions.forbidden : errorText(settings.error);
    body = (
      <Message title={copy.permissions.errorTitle} lead={lead}>
        <Button label={copy.permissions.tryAgain} onPress={() => settings.refetch()} variant="outline" />
      </Message>
    );
  } else if (settings.fetchStatus === 'paused') {
    body = <Message title={copy.permissions.offlineTitle} lead={copy.permissions.offlineLead} />;
  } else {
    body = <ActivityIndicator style={styles.loading} color={colors.accent} size="large" />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <TitleBar title={copy.permissions.title} />
      {body}
    </SafeAreaView>
  );
}

function AccessRow({ label, value, allowed, divided }: { label: string; value: string; allowed: boolean; divided: boolean }) {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel={copy.permissions.rowLabel(label, value)}
      style={[styles.row, divided && { borderTopWidth: 1, borderTopColor: colors.line }]}
    >
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <Text style={[styles.value, { color: allowed ? colors.ink : colors.inkMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { marginBlockStart: 48 },
  content: { paddingBlockEnd: 32 },
  lead: { paddingInline: 20, paddingBlockEnd: 12, fontSize: 14.5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignContent: 'center', columnGap: 12, rowGap: 2, minHeight: 56, paddingBlock: 10, paddingInline: 16 },
  label: { flexGrow: 1, flexBasis: 140, fontSize: 15 },
  value: { flexShrink: 1, fontSize: 14 },
});
