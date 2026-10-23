import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, type TextInputProps, View } from 'react-native';

import { queryKeys } from '../cache/keys';
import { copy } from '../copy';
import { type Draft, type Problem, type TextInput, type WireValue, writeDraft } from '../documents/customFields';
import type { CustomField } from '../paperless/schemas';
import { unwrap } from '../query';
import { useClient, useSignedIn } from '../session';
import { touchTarget, useColors } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
import { Field } from './Field';
import { DateField, FieldBox, FieldLabel } from './FieldBox';
import { IconButton } from './IconButton';
import { Picker } from './Picker';
import { Sheet } from './Sheet';

type EditorProps<Shape extends Draft> = {
  field: CustomField;
  draft: Shape;
  onChange: (draft: Draft) => void;
  changed: boolean;
  problem: Problem | null;
  removeButton: ReactNode;
};

type CustomFieldEditorProps = {
  field: CustomField;
  draft: Draft;
  onChange: (draft: Draft) => void;
  changed?: boolean;
  problem?: Problem | null;
  onRemove?: () => void;
};

export function CustomFieldEditor({ field, draft, onChange, changed = false, problem = null, onRemove }: CustomFieldEditorProps) {
  const colors = useColors();
  const removeButton =
    onRemove === undefined ? undefined : (
      <IconButton icon="close" label={copy.customFields.remove(field.name)} onPress={onRemove} color={colors.inkMuted} />
    );
  const common = { field, onChange, changed, problem, removeButton };
  switch (draft.type) {
    case 'text':
      return <TextEditor {...common} draft={draft} />;
    case 'toggle':
      return <ToggleEditor {...common} draft={draft} />;
    case 'date':
      return <DateEditor {...common} draft={draft} />;
    case 'choice':
      return <ChoiceEditor {...common} draft={draft} />;
    case 'money':
      return <MoneyEditor {...common} draft={draft} />;
    case 'documents':
      return <DocumentsEditor {...common} draft={draft} />;
  }
}

const keyboards: Record<TextInput, TextInputProps['keyboardType']> = {
  line: 'default',
  lines: 'default',
  url: 'url',
  number: 'numeric',
};

function TextEditor({ field, draft, onChange, changed, problem, removeButton }: EditorProps<Extract<Draft, { type: 'text' }>>) {
  return (
    <Field
      label={field.name}
      value={draft.text}
      onChangeText={(text) => onChange({ ...draft, text })}
      keyboardType={keyboards[draft.input]}
      multiline={draft.input === 'lines'}
      plainText={draft.input === 'url' || draft.input === 'number'}
      changed={changed}
      error={problem === null ? null : copy.customFields.problems[problem]}
      trailing={removeButton}
    />
  );
}

function ToggleEditor({ field, draft, onChange, changed, removeButton }: EditorProps<Extract<Draft, { type: 'toggle' }>>) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <FieldLabel label={field.name} changed={changed} />
      <View style={[styles.box, { backgroundColor: colors.surfaceRaised, borderColor: changed ? colors.accent : colors.outline }]}>
        <Text style={[styles.toggleText, { color: colors.ink }]}>{draft.on ? copy.detail.fieldWords.yes : copy.detail.fieldWords.no}</Text>
        <Switch
          accessibilityLabel={field.name}
          value={draft.on}
          onValueChange={(on) => onChange({ ...draft, on })}
          style={styles.switch}
          trackColor={{ true: colors.accent, false: colors.line }}
          thumbColor={draft.on ? colors.onAccent : colors.inkMuted}
        />
        {removeButton}
      </View>
    </View>
  );
}

function DateEditor({ field, draft, onChange, changed, removeButton }: EditorProps<Extract<Draft, { type: 'date' }>>) {
  return (
    <DateField
      label={field.name}
      value={draft.date}
      placeholder={copy.detail.notSet}
      changed={changed}
      onChange={(date) => onChange({ ...draft, date })}
      trailing={removeButton}
    />
  );
}

function ChoiceEditor({ field, draft, onChange, changed, removeButton }: EditorProps<Extract<Draft, { type: 'choice' }>>) {
  const [open, setOpen] = useState(false);
  const options = field.selectOptions.map((option, index) => ({ id: index, name: option.label }));
  const chosen = field.selectOptions.findIndex((option) => option.id === draft.optionId);
  return (
    <>
      <FieldBox
        label={field.name}
        value={chosen === -1 ? draft.optionId : field.selectOptions[chosen].label}
        placeholder={copy.detail.notSet}
        changed={changed}
        onPress={() => setOpen(true)}
        trailing={removeButton}
      />
      {open && (
        <Picker
          visible
          title={field.name}
          items={options}
          selected={chosen === -1 ? [] : [chosen]}
          emptyChoice={copy.picker.none}
          onClose={() => setOpen(false)}
          onDone={(indexes) => {
            const index = indexes[0];
            onChange({ ...draft, optionId: index === undefined ? null : field.selectOptions[index].id });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function MoneyEditor({ field, draft, onChange, changed, problem, removeButton }: EditorProps<Extract<Draft, { type: 'money' }>>) {
  const error = problem === null ? null : copy.customFields.problems[problem];
  return (
    <View style={styles.field}>
      <FieldLabel label={field.name} changed={changed} />
      <View style={styles.money}>
        <View style={styles.currency}>
          <Field
            label={copy.customFields.currency}
            value={draft.currency}
            onChangeText={(currency) => onChange({ ...draft, currency })}
            plainText
            error={problem === 'notCurrency' ? error : null}
          />
        </View>
        <View style={styles.amount}>
          <Field
            label={copy.customFields.amount}
            value={draft.amount}
            onChangeText={(amount) => onChange({ ...draft, amount })}
            keyboardType="numeric"
            plainText
            error={problem === 'notCurrency' ? null : error}
            trailing={removeButton}
          />
        </View>
      </View>
    </View>
  );
}

function DocumentsEditor({ field, draft, onChange, changed, removeButton }: EditorProps<Extract<Draft, { type: 'documents' }>>) {
  const client = useClient();
  const { account } = useSignedIn();
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed), searchPauseMs);
    return () => clearTimeout(timer);
  }, [typed]);

  const linkedQuery = { ids: draft.ids, pageSize: draft.ids.length };
  const linked = useQuery({
    queryKey: queryKeys.documentList(account.id, linkedQuery),
    queryFn: () => unwrap(client.listDocuments(linkedQuery)),
    enabled: draft.ids.length > 0,
  });
  const searchQuery = { query: search.trim() === '' ? undefined : search.trim(), pageSize: 25 };
  const found = useQuery({
    queryKey: queryKeys.documentList(account.id, searchQuery),
    queryFn: () => unwrap(client.listDocuments(searchQuery)),
    enabled: picking,
    placeholderData: keepPreviousData,
  });

  function titleOf(id: number): string {
    return linked.data?.items.find((document) => document.id === id)?.title ?? copy.customFields.linkedDocument(id);
  }

  return (
    <View style={styles.field}>
      <FieldLabel label={field.name} changed={changed} />
      <View style={styles.chips}>
        {draft.ids.map((id) => (
          <Chip
            key={id}
            label={titleOf(id)}
            trailingIcon="close"
            accessibilityLabel={copy.customFields.removeLink(titleOf(id))}
            onPress={() => onChange({ ...draft, ids: draft.ids.filter((other) => other !== id) })}
          />
        ))}
        <Chip label="" icon="plus" accessibilityLabel={copy.customFields.addLink(field.name)} onPress={() => setPicking(true)} />
        {removeButton}
      </View>
      {picking && (
        <Picker
          visible
          title={copy.customFields.linkTitle}
          items={(found.data?.items ?? []).map((document) => ({ id: document.id, name: document.title }))}
          selected={draft.ids}
          multiple
          onSearch={setTyped}
          onClose={() => setPicking(false)}
          onDone={(ids) => {
            onChange({ ...draft, ids });
            setPicking(false);
          }}
        />
      )}
    </View>
  );
}

// Searching waits for a pause in typing, so the server gets one request per word, not one per letter.
const searchPauseMs = 300;

const styles = StyleSheet.create({
  switch: { minWidth: touchTarget, minHeight: touchTarget },
  field: { gap: 6 },
  box: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingInlineStart: 16, paddingInlineEnd: 4, borderRadius: 12, borderWidth: 1 },
  toggleText: { flex: 1, fontSize: 16 },
  money: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  currency: { flexBasis: 110, flexGrow: 0 },
  amount: { flexBasis: 160, flexGrow: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  sheetFoot: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
});

type CustomFieldSheetProps = {
  field: CustomField;
  start: Draft;
  clearLabel: string;
  onSet: (value: WireValue) => void;
  onClear: () => void;
  onClose: () => void;
};

export function CustomFieldSheet({ field, start, clearLabel, onSet, onClear, onClose }: CustomFieldSheetProps) {
  const [draft, setDraft] = useState(start);
  const written = writeDraft(field, draft);
  return (
    <Sheet
      visible
      title={field.name}
      onClose={onClose}
      footer={
        <View style={styles.sheetFoot}>
          <Button label={clearLabel} variant="outline" onPress={onClear} />
          <Button label={copy.customFields.save} disabled={!written.ok} onPress={() => written.ok && onSet(written.value)} />
        </View>
      }
    >
      <CustomFieldEditor field={field} draft={draft} onChange={setDraft} problem={written.ok ? null : written.problem} />
    </Sheet>
  );
}
