import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../copy';
import type { Named } from '../labels';
import { touchTarget, useColors } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';

type PickerProps = {
  visible: boolean;
  title: string;
  items: Named[];
  selected: number[];
  multiple?: boolean;
  emptyChoice?: string;
  createLabel?: (name: string) => string;
  onCreate?: (name: string) => Promise<Named | null>;
  onClose: () => void;
  onDone: (ids: number[]) => void;
};

type Row = { kind: 'empty'; label: string } | { kind: 'item'; item: Named } | { kind: 'create'; name: string };

export function Picker(props: PickerProps) {
  return props.visible ? <OpenPicker {...props} /> : null;
}

function OpenPicker({ title, items, selected, multiple = false, emptyChoice, createLabel, onCreate, onClose, onDone }: PickerProps) {
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState(selected);
  const [creating, setCreating] = useState(false);

  const typed = search.trim();
  const matches = items.filter((item) => item.name.toLowerCase().includes(typed.toLowerCase()));
  const exact = items.some((item) => item.name.toLowerCase() === typed.toLowerCase());
  const rows: Row[] = [
    ...(emptyChoice !== undefined && typed === '' ? [{ kind: 'empty' as const, label: emptyChoice }] : []),
    ...matches.map((item) => ({ kind: 'item' as const, item })),
    ...(onCreate !== undefined && typed !== '' && !exact ? [{ kind: 'create' as const, name: typed }] : []),
  ];

  function choose(id: number) {
    if (!multiple) {
      onDone([id]);
      return;
    }
    setChosen(chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id]);
  }

  async function create(name: string) {
    if (onCreate === undefined) {
      return;
    }
    setCreating(true);
    const made = await onCreate(name);
    setCreating(false);
    if (made !== null) {
      setSearch('');
      choose(made.id);
    }
  }

  function renderRow({ item: row }: { item: Row }) {
    if (row.kind === 'create') {
      return (
        <Pressable
          accessibilityRole="button"
          disabled={creating}
          onPress={() => create(row.name)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSunken }]}
        >
          <Icon name="plus" color={colors.accent} />
          <Text style={[styles.rowText, { color: colors.accent }]}>{createLabel?.(row.name) ?? row.name}</Text>
        </Pressable>
      );
    }
    const isEmpty = row.kind === 'empty';
    const on = isEmpty ? !multiple && selected.length === 0 : chosen.includes(row.item.id);
    return (
      <Pressable
        accessibilityRole={multiple ? 'checkbox' : 'radio'}
        accessibilityState={{ checked: on }}
        onPress={() => (isEmpty ? onDone([]) : choose(row.item.id))}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSunken }]}
      >
        <View style={styles.check}>{on && <Icon name="check" color={colors.accent} />}</View>
        <Text style={[styles.rowText, { color: isEmpty ? colors.inkMuted : colors.ink }]}>
          {isEmpty ? row.label : row.item.name}
        </Text>
      </Pressable>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.surface }]}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.picker.close} onPress={onClose} style={styles.iconButton}>
            <Icon name="close" color={colors.ink} />
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
            {title}
          </Text>
          {multiple && <Button label={copy.picker.done} compact onPress={() => onDone(chosen)} />}
        </View>
        <View style={[styles.search, { backgroundColor: colors.surfaceSunken }]}>
          <Icon name="search" color={colors.inkMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={copy.picker.search}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={copy.picker.search}
            style={[styles.searchInput, { color: colors.ink }]}
          />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(row) => (row.kind === 'item' ? String(row.item.id) : row.kind)}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={[styles.nothing, { color: colors.inkMuted }]}>{copy.picker.nothingMatches}</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingInlineStart: 4, paddingInlineEnd: 12 },
  iconButton: { width: touchTarget, height: touchTarget, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: '500' },
  search: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, marginInline: 16, marginBlockEnd: 8, paddingInlineStart: 16, borderRadius: 28 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingInline: 16 },
  check: { width: 24, alignItems: 'center' },
  rowText: { flex: 1, minWidth: 0, fontSize: 16 },
  nothing: { paddingInline: 20, paddingBlock: 16, fontSize: 15 },
});
