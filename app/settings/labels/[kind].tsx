import { useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../../src/copy';
import { useEditLabels, useLabels } from '../../../src/labels';
import type { LabelKind } from '../../../src/paperless/client';
import { customFieldDataTypes } from '../../../src/paperless/schemas';
import { errorText, isForbidden, RequestFailed } from '../../../src/query';
import {
  changesFor,
  draftFor,
  draftProblem,
  hasChanges,
  isLabelKind,
  type LabelDraft,
  labelEditors,
  type LabelItem,
  tagColors,
} from '../../../src/settings/labelKinds';
import { TitleBar } from '../../../src/settings/parts';
import type { PermissionAction } from '../../../src/settings/permissions';
import { useCan } from '../../../src/settings/usePermissions';
import { touchTarget, useColors } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { Chip } from '../../../src/ui/Chip';
import { Field } from '../../../src/ui/Field';
import { Icon } from '../../../src/ui/Icon';
import { IconButton } from '../../../src/ui/IconButton';
import { Message } from '../../../src/ui/Message';
import { Sheet } from '../../../src/ui/Sheet';

export default function LabelsScreen() {
  const colors = useColors();
  const kind = useLocalSearchParams<{ kind: string }>().kind;
  if (!isLabelKind(kind)) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
        <TitleBar title={copy.settings.labels} />
        <Message title={copy.labels.unknownKind} lead="" />
      </SafeAreaView>
    );
  }
  return <LabelList kind={kind} />;
}

type Editing = { item: LabelItem | null } | null;

function LabelList({ kind }: { kind: LabelKind }) {
  const colors = useColors();
  const can = useCan();
  const query = useLabels()[kind];
  const words = copy.labels.kinds[kind];
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing>(null);

  const items: LabelItem[] = query.data ?? [];
  const typed = search.trim().toLowerCase();
  const shown = items.filter((item) => item.name.toLowerCase().includes(typed));
  const editable = can('change', kind) || can('delete', kind);

  let body: ReactNode;
  if (query.data === undefined && isForbidden(query.error)) {
    body = <Message title={copy.labels.errorTitle(words.plural)} lead={copy.labels.notAllowedToSee(words.plural)} />;
  } else if (query.data === undefined && query.isError) {
    body = (
      <Message title={copy.labels.errorTitle(words.plural)} lead={errorText(query.error)}>
        <Button label={copy.labels.tryAgain} onPress={() => query.refetch()} variant="outline" />
      </Message>
    );
  } else if (query.data === undefined && query.fetchStatus === 'paused') {
    body = <Message title={copy.labels.offlineTitle} lead={copy.labels.offlineLead} />;
  } else if (query.data === undefined) {
    body = <ActivityIndicator style={styles.loading} color={colors.accent} size="large" />;
  } else {
    body = (
      <FlatList
        data={shown}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <LabelRow kind={kind} item={item} divided={index > 0} onPress={editable ? () => setEditing({ item }) : undefined} />
        )}
        ListEmptyComponent={
          items.length === 0 ? (
            <Message title={copy.labels.nothingYet(words.plural)} lead={can('add', kind) ? copy.labels.nothingYetLead : ''} />
          ) : (
            <Text style={[styles.nothing, { color: colors.inkMuted }]}>{copy.labels.nothingMatches}</Text>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              query.refetch();
            }}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surfaceRaised}
          />
        }
        contentContainerStyle={styles.listEnd}
      />
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <TitleBar title={words.title}>
        {can('add', kind) && query.data !== undefined && (
          <IconButton icon="plus" label={words.create} onPress={() => setEditing({ item: null })} />
        )}
      </TitleBar>
      {query.data !== undefined && items.length > 0 && (
        <View style={[styles.search, { backgroundColor: colors.surfaceSunken }]}>
          <Icon name="search" color={colors.inkMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={copy.labels.search}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={copy.labels.search}
            style={[styles.searchInput, { color: colors.ink }]}
          />
          {search !== '' && <IconButton icon="close" label={copy.labels.clearSearch} onPress={() => setSearch('')} />}
        </View>
      )}
      {body}
      {editing !== null && <LabelSheet kind={kind} item={editing.item} onClose={() => setEditing(null)} />}
    </SafeAreaView>
  );
}

function rowDetail(kind: LabelKind, item: LabelItem): string {
  const parts = [copy.labels.documentCount(item.documentCount)];
  if (kind === 'tags' && item.isInboxTag) {
    parts.push(copy.labels.inboxTag);
  }
  if (kind === 'storagePaths' && item.path !== undefined) {
    parts.push(item.path);
  }
  if (kind === 'customFields' && item.dataType !== undefined) {
    parts.push(copy.labels.fieldTypes[item.dataType]);
  }
  return parts.join(' · ');
}

function LabelRow({ kind, item, divided, onPress }: { kind: LabelKind; item: LabelItem; divided: boolean; onPress?: () => void }) {
  const colors = useColors();
  const detail = rowDetail(kind, item);
  const label = `${item.name}, ${detail}`;
  const divider = divided && { borderTopWidth: 1, borderTopColor: colors.line };
  const content = (
    <>
      {item.color !== undefined && <View style={[styles.dot, { backgroundColor: item.color, borderColor: colors.line }]} />}
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: colors.ink }]}>{item.name}</Text>
        <Text style={[styles.rowDetail, { color: colors.inkMuted }]}>{detail}</Text>
      </View>
    </>
  );
  if (onPress === undefined) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.row, divider]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider, pressed && { backgroundColor: colors.surfaceSunken }]}
    >
      {content}
    </Pressable>
  );
}

function messagesIn(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(messagesIn);
  }
  return [];
}

function rejectionReason(body: string): string {
  try {
    return messagesIn(JSON.parse(body)).join(' ');
  } catch {
    return body.slice(0, 200);
  }
}

function failureText(kind: LabelKind, action: PermissionAction, error: Error): string {
  if (error instanceof RequestFailed && error.failure.kind === 'forbidden' && action !== 'view') {
    return copy.labels.forbidden[action](copy.labels.kinds[kind].plural);
  }
  if (error instanceof RequestFailed && error.failure.kind === 'rejected') {
    return copy.labels.rejected(rejectionReason(error.failure.body));
  }
  return errorText(error);
}

function LabelSheet({ kind, item, onClose }: { kind: LabelKind; item: LabelItem | null; onClose: () => void }) {
  const colors = useColors();
  const can = useCan();
  const { save, remove } = useEditLabels(kind);
  const [draft, setDraft] = useState<LabelDraft>(() => draftFor(item));
  const [triedToSave, setTriedToSave] = useState(false);
  const words = copy.labels.kinds[kind];
  const editors = labelEditors[kind];
  const creating = item === null;
  const changes = changesFor(kind, item, draft);
  const problem = draftProblem(kind, draft, creating);
  const mayChange = creating ? can('add', kind) : can('change', kind);

  function submit() {
    setTriedToSave(true);
    if (problem !== null) {
      return;
    }
    remove.reset();
    save.mutate({ id: item?.id ?? null, changes }, { onSuccess: onClose });
  }

  function askToDelete() {
    if (item === null || remove.isPending) {
      return;
    }
    Alert.alert(copy.labels.deleteTitle(words.one, item.name), copy.labels.deleteMessage(item.documentCount), [
      { text: copy.labels.cancel, style: 'cancel' },
      {
        text: copy.labels.delete,
        style: 'destructive',
        onPress: () => {
          save.reset();
          remove.mutate(item.id, { onSuccess: onClose });
        },
      },
    ]);
  }

  let failure: string | null = null;
  if (save.error !== null) {
    failure = failureText(kind, creating ? 'add' : 'change', save.error);
  } else if (remove.error !== null) {
    failure = failureText(kind, 'delete', remove.error);
  }

  return (
    <Sheet
      visible
      title={creating ? words.create : copy.labels.edit(item.name)}
      onClose={onClose}
      headerAction={
        !creating && can('delete', kind) ? (
          <IconButton icon="trash" label={copy.labels.delete} color={colors.danger} onPress={askToDelete} />
        ) : undefined
      }
      footer={
        <>
          <Button label={copy.labels.cancel} variant="outline" onPress={onClose} />
          {mayChange && (
            <Button
              label={creating ? copy.labels.create : copy.labels.save}
              onPress={submit}
              busy={save.isPending || remove.isPending}
              disabled={!creating && !hasChanges(changes)}
            />
          )}
        </>
      }
    >
      <Field
        label={copy.labels.name}
        value={draft.name}
        onChangeText={(name) => setDraft({ ...draft, name })}
        autoFocus={creating}
        error={triedToSave && problem === 'nameMissing' ? copy.labels.problems.nameMissing : null}
      />
      {editors.includes('color') && <ColorPicker color={draft.color} onPick={(color) => setDraft({ ...draft, color })} />}
      {editors.includes('inboxTag') && (
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.switchLabel, { color: colors.ink }]}>{copy.labels.inboxSwitch}</Text>
            <Text style={[styles.help, { color: colors.inkMuted }]}>{copy.labels.inboxHelp}</Text>
          </View>
          <Switch
            accessibilityLabel={copy.labels.inboxSwitch}
            value={draft.isInboxTag}
            onValueChange={(isInboxTag) => setDraft({ ...draft, isInboxTag })}
            trackColor={{ true: colors.accent, false: colors.surfaceSunken }}
            thumbColor={draft.isInboxTag ? colors.onAccent : colors.inkMuted}
          />
        </View>
      )}
      {editors.includes('pathTemplate') && (
        <Field
          label={copy.labels.path}
          value={draft.path}
          onChangeText={(path) => setDraft({ ...draft, path })}
          plainText
          help={copy.labels.pathHelp}
          error={triedToSave && problem === 'pathMissing' ? copy.labels.problems.pathMissing : null}
        />
      )}
      {editors.includes('fieldType') &&
        (creating ? (
          <FieldTypeEditor
            draft={draft}
            onChange={setDraft}
            optionsMissing={triedToSave && problem === 'optionsMissing'}
          />
        ) : (
          <FixedFieldType item={item} />
        ))}
      {failure !== null && (
        <Text accessibilityLiveRegion="polite" style={[styles.help, { color: colors.danger }]}>
          {failure}
        </Text>
      )}
    </Sheet>
  );
}

function ColorPicker({ color, onPick }: { color: string; onPick: (color: string) => void }) {
  const colors = useColors();
  const known = (tagColors as readonly string[]).includes(color);
  const swatches = known ? [...tagColors] : [color, ...tagColors];
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: colors.inkMuted }]}>{copy.labels.color}</Text>
      <View accessibilityRole="radiogroup" style={styles.swatches}>
        {swatches.map((swatch) => {
          const index = (tagColors as readonly string[]).indexOf(swatch);
          const selected = swatch === color;
          return (
            <Pressable
              key={swatch}
              accessibilityRole="radio"
              accessibilityLabel={index === -1 ? copy.labels.currentColor : copy.labels.colorNames[index]}
              accessibilityState={{ checked: selected }}
              onPress={() => onPick(swatch)}
              style={styles.swatchTarget}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: swatch, borderColor: selected ? colors.accent : colors.line, borderWidth: selected ? 3 : 1 },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FieldTypeEditor({ draft, onChange, optionsMissing }: { draft: LabelDraft; onChange: (draft: LabelDraft) => void; optionsMissing: boolean }) {
  const colors = useColors();
  const setOption = (index: number, label: string) =>
    onChange({ ...draft, selectOptions: draft.selectOptions.map((option, at) => (at === index ? label : option)) });
  return (
    <>
      <View style={styles.group}>
        <Text style={[styles.groupLabel, { color: colors.inkMuted }]}>{copy.labels.fieldType}</Text>
        <View style={styles.chips}>
          {customFieldDataTypes.map((dataType) => (
            <Chip
              key={dataType}
              label={copy.labels.fieldTypes[dataType]}
              selected={draft.dataType === dataType}
              onPress={() => onChange({ ...draft, dataType })}
            />
          ))}
        </View>
      </View>
      {draft.dataType === 'select' && (
        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: colors.inkMuted }]}>{copy.labels.choices}</Text>
          {draft.selectOptions.map((option, index) => (
            <Field
              key={index}
              label={copy.labels.choice(index + 1)}
              value={option}
              onChangeText={(label) => setOption(index, label)}
              trailing={
                <IconButton
                  icon="close"
                  label={copy.labels.removeChoice(index + 1)}
                  onPress={() => onChange({ ...draft, selectOptions: draft.selectOptions.filter((_, at) => at !== index) })}
                />
              }
            />
          ))}
          {optionsMissing && <Text style={[styles.help, { color: colors.danger }]}>{copy.labels.problems.optionsMissing}</Text>}
          <View style={styles.start}>
            <Button
              label={copy.labels.addChoice}
              icon="plus"
              variant="text"
              onPress={() => onChange({ ...draft, selectOptions: [...draft.selectOptions, ''] })}
            />
          </View>
        </View>
      )}
    </>
  );
}

function FixedFieldType({ item }: { item: LabelItem }) {
  const colors = useColors();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: colors.inkMuted }]}>{copy.labels.fieldType}</Text>
      <Text style={[styles.fixedValue, { color: colors.ink }]}>{copy.labels.fieldTypes[item.dataType ?? 'unsupported']}</Text>
      <Text style={[styles.help, { color: colors.inkMuted }]}>{copy.labels.fieldTypeFixed}</Text>
      {item.dataType === 'select' && (
        <>
          <Text style={[styles.groupLabel, { color: colors.inkMuted }]}>{copy.labels.choices}</Text>
          <Text style={[styles.fixedValue, { color: colors.ink }]}>{(item.selectOptions ?? []).map((option) => option.label).join(', ')}</Text>
          <Text style={[styles.help, { color: colors.inkMuted }]}>{copy.labels.choicesFixed}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { marginBlockStart: 48 },
  search: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginInline: 16,
    marginBlockEnd: 8,
    paddingInlineStart: 16,
    paddingInlineEnd: 4,
    borderRadius: 28,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16 },
  listEnd: { paddingBlockEnd: 32 },
  nothing: { paddingInline: 20, paddingBlock: 16, fontSize: 15 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingBlock: 10, paddingInline: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 15.5, fontWeight: '500' },
  rowDetail: { fontSize: 13.5 },
  group: { gap: 8 },
  groupLabel: { fontSize: 13.5, fontWeight: '500' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap' },
  swatchTarget: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touchTarget },
  switchText: { flex: 1, minWidth: 0, gap: 2 },
  switchLabel: { fontSize: 15 },
  help: { fontSize: 13.5 },
  fixedValue: { fontSize: 15 },
  start: { alignItems: 'flex-start' },
});
