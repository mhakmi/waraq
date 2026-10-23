import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { queryKeys } from '../cache/keys';
import { copy } from '../copy';
import { documentQuery, type DocumentFilter, emptyFilter, type ListOrder, type TagMode } from '../documents/filter';
import { type Labels, type Named, nameOf } from '../labels';
import { unwrap } from '../query';
import { useClient, useSignedIn } from '../session';
import { touchTarget, useColors } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
import { DateField, FieldBox, FieldLabel } from './FieldBox';
import { Icon } from './Icon';
import { Picker } from './Picker';
import { Sheet } from './Sheet';

type FilterSheetProps = {
  visible: boolean;
  filter: DocumentFilter;
  order: ListOrder;
  savedViewDefaults?: Record<string, string>;
  labels: Labels;
  onApply: (filter: DocumentFilter) => void;
  onSaveAsView?: (filter: DocumentFilter) => void;
  onClose: () => void;
};

type PickerOpen = null | 'tags' | 'correspondent' | 'documentType' | 'storagePath';

export function FilterSheet(props: FilterSheetProps) {
  return props.visible ? <OpenFilterSheet {...props} /> : null;
}

function OpenFilterSheet({ filter, order, savedViewDefaults, labels, onApply, onSaveAsView, onClose }: FilterSheetProps) {
  const colors = useColors();
  const client = useClient();
  const { account } = useSignedIn();
  const [draft, setDraft] = useState(filter);
  const [picker, setPicker] = useState<PickerOpen>(null);

  const query = { ...documentQuery(draft, order, savedViewDefaults), pageSize: 1 };
  const count = useQuery({
    queryKey: queryKeys.documentCount(account.id, query),
    queryFn: async () => (await unwrap(client.listDocuments(query))).count,
    placeholderData: keepPreviousData,
  });

  const tags = labels.tags.data ?? [];
  const pickerSetup: Record<Exclude<PickerOpen, null>, { title: string; items: Named[]; selected: number[] }> = {
    tags: { title: copy.filters.tags, items: tags, selected: draft.tagIds },
    correspondent: {
      title: copy.filters.correspondent,
      items: labels.correspondents.data ?? [],
      selected: draft.correspondentId === null ? [] : [draft.correspondentId],
    },
    documentType: {
      title: copy.filters.documentType,
      items: labels.documentTypes.data ?? [],
      selected: draft.documentTypeId === null ? [] : [draft.documentTypeId],
    },
    storagePath: {
      title: copy.filters.storagePath,
      items: labels.storagePaths.data ?? [],
      selected: draft.storagePathId === null ? [] : [draft.storagePathId],
    },
  };

  function picked(ids: number[]) {
    const one = ids[0] ?? null;
    if (picker === 'tags') {
      setDraft({ ...draft, tagIds: ids });
    } else if (picker === 'correspondent') {
      setDraft({ ...draft, correspondentId: one });
    } else if (picker === 'documentType') {
      setDraft({ ...draft, documentTypeId: one });
    } else if (picker === 'storagePath') {
      setDraft({ ...draft, storagePathId: one });
    }
    setPicker(null);
  }

  const clearButton = (label: string, clear: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={copy.filters.clearDate(label)} onPress={clear} style={styles.icon}>
      <Icon name="close" color={colors.ink} size={18} />
    </Pressable>
  );

  return (
    <Sheet
      visible
      title={copy.filters.title}
      onClose={onClose}
      headerAction={<Button label={copy.filters.clearAll} variant="text" onPress={() => setDraft({ ...emptyFilter, text: draft.text })} />}
      footer={
        <View style={styles.footer}>
          {onSaveAsView !== undefined && <Button label={copy.saveView.button} variant="outline" onPress={() => onSaveAsView(draft)} />}
          <Button
            label={copy.filters.show(count.data)}
            busy={count.isFetching && count.data === undefined}
            onPress={() => onApply(draft)}
          />
        </View>
      }
    >
      <View style={styles.field}>
        <FieldLabel label={copy.filters.tags} />
        <Segmented value={draft.tagMode} onChange={(tagMode) => setDraft({ ...draft, tagMode })} />
        <View style={styles.chips}>
          {draft.tagIds.map((id) => {
            const name = nameOf(tags, id) ?? String(id);
            return (
              <Chip
                key={id}
                label={name}
                selected
                trailingIcon="close"
                accessibilityLabel={copy.filters.removeTag(name)}
                onPress={() => setDraft({ ...draft, tagIds: draft.tagIds.filter((other) => other !== id) })}
              />
            );
          })}
          <Chip label={copy.filters.addTag} icon="plus" onPress={() => setPicker('tags')} />
        </View>
      </View>
      <FieldBox
        label={copy.filters.correspondent}
        value={nameOf(labels.correspondents.data, draft.correspondentId)}
        placeholder={copy.filters.any}
        onPress={() => setPicker('correspondent')}
      />
      <FieldBox
        label={copy.filters.documentType}
        value={nameOf(labels.documentTypes.data, draft.documentTypeId)}
        placeholder={copy.filters.any}
        onPress={() => setPicker('documentType')}
      />
      <View style={styles.field}>
        <FieldLabel label={copy.filters.created} />
        <View style={styles.two}>
          <DateField
            label={copy.filters.from}
            value={draft.createdFrom}
            placeholder={copy.filters.any}
            small
            onChange={(createdFrom) => setDraft({ ...draft, createdFrom })}
            trailing={draft.createdFrom !== null ? clearButton(copy.filters.from, () => setDraft({ ...draft, createdFrom: null })) : undefined}
          />
          <DateField
            label={copy.filters.to}
            value={draft.createdTo}
            placeholder={copy.filters.any}
            small
            onChange={(createdTo) => setDraft({ ...draft, createdTo })}
            trailing={draft.createdTo !== null ? clearButton(copy.filters.to, () => setDraft({ ...draft, createdTo: null })) : undefined}
          />
        </View>
      </View>
      <FieldBox
        label={copy.filters.storagePath}
        value={nameOf(labels.storagePaths.data, draft.storagePathId)}
        placeholder={copy.filters.any}
        onPress={() => setPicker('storagePath')}
      />
      {picker !== null && (
        <Picker
          visible
          {...pickerSetup[picker]}
          multiple={picker === 'tags'}
          emptyChoice={picker === 'tags' ? undefined : copy.filters.any}
          onClose={() => setPicker(null)}
          onDone={picked}
        />
      )}
    </Sheet>
  );
}

function Segmented({ value, onChange }: { value: TagMode; onChange: (mode: TagMode) => void }) {
  const colors = useColors();
  const options: [TagMode, string][] = [
    ['all', copy.filters.hasAll],
    ['any', copy.filters.hasAny],
  ];
  return (
    <View accessibilityRole="radiogroup" style={[styles.segmented, { borderColor: colors.line, backgroundColor: colors.surfaceRaised }]}>
      {options.map(([mode, label], index) => {
        const on = value === mode;
        return (
          <Pressable
            key={mode}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(mode)}
            style={[
              styles.segment,
              index > 0 && { borderStartWidth: 1, borderStartColor: colors.line },
              on && { backgroundColor: colors.accentSoft },
            ]}
          >
            <Text style={[styles.segmentText, { color: on ? colors.onAccentSoft : colors.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBlockStart: 6 },
  two: { flexDirection: 'row', gap: 10 },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  footer: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingInline: 8 },
  segmentText: { fontSize: 14.5, fontWeight: '500', textAlign: 'center' },
});
