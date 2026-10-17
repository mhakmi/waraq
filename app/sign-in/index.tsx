import { fetch } from 'expo/fetch';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { connect } from '../../src/signin/connect';
import { useSignInDraft } from '../../src/signin/draft';
import { type HeaderProblem, type HeaderRow, parseHeaderRows } from '../../src/signin/headers';
import { radius, touchTarget, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Icon } from '../../src/ui/Icon';

function headerProblemText(problem: HeaderProblem): string {
  return copy.signIn.headerProblems[problem.kind](problem.name);
}

export default function AddressScreen() {
  const colors = useColors();
  const router = useRouter();
  const draft = useSignInDraft();
  const [busy, setBusy] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [headersError, setHeadersError] = useState<string | null>(null);

  async function onContinue() {
    const headers = parseHeaderRows(draft.headerRows);
    if (!headers.ok) {
      setHeadersError(headerProblemText(headers.error));
      draft.update({ optionsOpen: true });
      return;
    }
    setHeadersError(null);
    setBusy(true);
    const result = await connect(draft.address, headers.value, fetch);
    setBusy(false);
    if (result.kind === 'invalid_address') {
      setAddressError(copy.signIn.addressInvalid);
      return;
    }
    setAddressError(null);
    if (result.kind === 'failed') {
      draft.update({
        attempt: {
          address: draft.address.trim(),
          host: result.host,
          isHttp: result.isHttp,
          headerNames: Object.keys(headers.value),
          method: null,
          failure: result.failure,
        },
      });
      router.push('/sign-in/failed');
      return;
    }
    draft.update({ server: result.server });
    router.push('/sign-in/credentials');
  }

  return (
    <SafeAreaView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.wordmark}>
          <Icon name="mark" color={colors.accent} size={30} />
          <Text style={[styles.wordmarkText, { color: colors.accent }]}>{copy.appName}</Text>
        </View>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.ink }]}>
          {copy.signIn.heading}
        </Text>
        <Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.signIn.lead}</Text>

        <View style={styles.stack}>
          <Field
            label={copy.signIn.addressLabel}
            value={draft.address}
            onChangeText={(address) => draft.update({ address })}
            placeholder={copy.signIn.addressPlaceholder}
            help={copy.signIn.addressHelp}
            error={addressError}
            keyboardType="url"
            autoComplete="url"
            plainText
            onSubmitEditing={onContinue}
          />
          <Button label={copy.signIn.continue} onPress={onContinue} large busy={busy} disabled={draft.address.trim() === ''} />
        </View>

        <ConnectionOptions error={headersError} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ConnectionOptions({ error }: { error: string | null }) {
  const colors = useColors();
  const draft = useSignInDraft();
  const rows = draft.headerRows;

  function changeRow(key: number, change: Partial<HeaderRow>) {
    draft.update({ headerRows: rows.map((row) => (row.key === key ? { ...row, ...change } : row)) });
  }

  function addRow() {
    const key = rows.reduce((largest, row) => Math.max(largest, row.key), 0) + 1;
    draft.update({ headerRows: [...rows, { key, name: '', value: '' }] });
  }

  function removeRow(key: number) {
    draft.update({ headerRows: rows.filter((row) => row.key !== key) });
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: draft.optionsOpen }}
        onPress={() => draft.update({ optionsOpen: !draft.optionsOpen })}
        style={styles.optionsRow}
      >
        <View style={styles.grow}>
          <Text style={[styles.optionsTitle, { color: colors.ink }]}>{copy.signIn.optionsTitle}</Text>
          <Text style={[styles.small, { color: colors.inkMuted }]}>{copy.signIn.optionsSummary}</Text>
        </View>
        <View style={[styles.iconButton, draft.optionsOpen && styles.turned]}>
          <Icon name="chevronDown" color={colors.ink} />
        </View>
      </Pressable>

      {draft.optionsOpen && (
        <View style={[styles.optionsBody, { borderTopColor: colors.line }]}>
          <Text accessibilityRole="header" style={[styles.subheading, { color: colors.ink }]}>
            {copy.signIn.headersTitle}
          </Text>
          <Text style={[styles.small, { color: colors.inkMuted }]}>{copy.signIn.headersHelp}</Text>
          {rows.map((row) => (
            <View key={row.key} style={styles.headerPair}>
              <View style={styles.grow}>
                <Field
                  label={copy.signIn.headerName}
                  value={row.name}
                  onChangeText={(name) => changeRow(row.key, { name })}
                  plainText
                />
              </View>
              <View style={styles.grow}>
                <Field
                  label={copy.signIn.headerValue}
                  value={row.value}
                  onChangeText={(value) => changeRow(row.key, { value })}
                  secureTextEntry
                  plainText
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.signIn.removeHeader(row.name.trim())}
                onPress={() => removeRow(row.key)}
                style={[styles.iconButton, styles.removeButton]}
              >
                <Icon name="close" color={colors.inkMuted} />
              </Pressable>
            </View>
          ))}
          {error && (
            <Text accessibilityLiveRegion="polite" style={[styles.small, { color: colors.danger }]}>
              {error}
            </Text>
          )}
          <View style={styles.start}>
            <Button label={copy.signIn.addHeader} onPress={addRow} variant="outline" icon="plus" />
          </View>

          <View style={styles.certificateTitle}>
            <Text accessibilityRole="header" style={[styles.subheading, { color: colors.ink }]}>
              {copy.signIn.certificateTitle}
            </Text>
            <Text style={[styles.soon, { backgroundColor: colors.surfaceSunken, color: colors.ink }]}>
              {copy.signIn.comingLater}
            </Text>
          </View>
          <Text style={[styles.small, { color: colors.inkMuted }]}>{copy.signIn.certificateHelp}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  start: { alignItems: 'flex-start' },
  content: { paddingInline: 20, paddingBlockEnd: 32 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBlockStart: 28, paddingBlockEnd: 32 },
  wordmarkText: { fontSize: 22, fontWeight: '700' },
  heading: { fontSize: 28, fontWeight: '500', lineHeight: 35 },
  lead: { fontSize: 16, marginBlockStart: 8, marginBlockEnd: 28 },
  stack: { gap: 16 },
  card: { marginBlockStart: 24, borderWidth: 1, borderRadius: radius },
  optionsRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingBlock: 10, paddingInlineStart: 16, paddingInlineEnd: 8 },
  optionsTitle: { fontSize: 15, fontWeight: '500' },
  small: { fontSize: 13.5 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  turned: { transform: [{ rotate: '180deg' }] },
  optionsBody: { borderTopWidth: 1, paddingBlockStart: 4, paddingBlockEnd: 16, paddingInline: 16, gap: 12 },
  subheading: { fontSize: 15, fontWeight: '600', marginBlockStart: 12 },
  headerPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  removeButton: { marginBlockEnd: 4 },
  certificateTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  soon: { marginBlockStart: 12, paddingBlock: 2, paddingInline: 8, borderRadius: 6, fontSize: 12.5, fontWeight: '500', overflow: 'hidden' },
});
