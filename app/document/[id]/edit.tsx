import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryKeys } from '../../../src/cache/keys';
import { copy } from '../../../src/copy';
import { documentChanges, editableFields, type EditableFields, parseArchiveNumber } from '../../../src/documents/edit';
import { nameOf, useCreateLabel, useLabels } from '../../../src/labels';
import type { DocumentDetail, DocumentId } from '../../../src/paperless/schemas';
import { RequestFailed, unwrap } from '../../../src/query';
import { useClient, useSignedIn } from '../../../src/session';
import { touchTarget, useColors } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { Chip } from '../../../src/ui/Chip';
import { Field } from '../../../src/ui/Field';
import { DateField, FieldBox, FieldLabel } from '../../../src/ui/FieldBox';
import { Icon } from '../../../src/ui/Icon';
import { Picker } from '../../../src/ui/Picker';

type PickerOpen = null | 'correspondent' | 'documentType' | 'storagePath' | 'tags';

function failureText(error: Error | null): string {
  if (error instanceof RequestFailed && error.failure.kind === 'rejected') {
    try {
      const messages = Object.values(JSON.parse(error.failure.body) as Record<string, unknown>).flat();
      return copy.edit.rejected(messages.join(' '));
    } catch {
      return copy.edit.rejected(error.failure.body.slice(0, 200));
    }
  }
  return copy.edit.saveFailed;
}

export default function EditScreen() {
  const colors = useColors();
  const client = useClient();
  const { account } = useSignedIn();
  const id = Number(useLocalSearchParams<{ id: string }>().id) as DocumentId;
  const detail = useQuery({
    queryKey: queryKeys.document(account.id, id),
    queryFn: () => unwrap(client.getDocument(id)),
  });
  if (detail.data === undefined) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.surface }]}>
        <ActivityIndicator style={styles.loading} color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }
  return <EditForm document={detail.data} />;
}

function EditForm({ document }: { document: DocumentDetail }) {
  const colors = useColors();
  const client = useClient();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { account } = useSignedIn();
  const labels = useLabels();
  const [original] = useState(() => editableFields(document));
  const [draft, setDraft] = useState<EditableFields>(original);
  const [archiveText, setArchiveText] = useState(original.archiveSerialNumber === null ? '' : String(original.archiveSerialNumber));
  const [picker, setPicker] = useState<PickerOpen>(null);
  const createLabel = useCreateLabel();

  const archive = parseArchiveNumber(archiveText);
  const fields = archive.ok ? { ...draft, archiveSerialNumber: archive.value } : draft;
  const changes = documentChanges(original, fields);
  const changeCount = Object.keys(changes).length;
  const titleEmpty = draft.title.trim() === '';

  const save = useMutation({
    mutationFn: () => unwrap(client.updateDocument(document.id, changes)),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.document(account.id, document.id), saved);
      queryClient.invalidateQueries({ queryKey: queryKeys.allDocumentLists(account.id) });
    },
  });

  usePreventRemove(changeCount > 0 && !save.isSuccess, ({ data }) => {
    Alert.alert(copy.edit.discardTitle, copy.edit.discardMessage, [
      { text: copy.edit.keepEditing, style: 'cancel' },
      { text: copy.edit.discard, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (save.isSuccess) {
      router.back();
    }
  }, [save.isSuccess, router]);

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

  const tags = labels.tags.data ?? [];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.edit.cancel} onPress={() => router.back()} style={styles.iconButton}>
          <Icon name="close" color={colors.ink} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
          {copy.edit.title}
        </Text>
        <Button
          label={copy.edit.save(changeCount)}
          compact
          busy={save.isPending}
          disabled={changeCount === 0 || titleEmpty || !archive.ok}
          onPress={() => save.mutate()}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
          <Icon name="info" color={colors.onAccentSoft} size={18} />
          <Text style={[styles.noticeText, { color: colors.onAccentSoft }]}>{copy.edit.onlyChanges}</Text>
        </View>
        {save.isError && (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {failureText(save.error)}
          </Text>
        )}
        {createLabel.failed && (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {copy.picker.createFailed}
          </Text>
        )}
        <Field
          label={copy.edit.titleLabel}
          value={draft.title}
          onChangeText={(title) => setDraft({ ...draft, title })}
          changed={'title' in changes}
          error={titleEmpty ? copy.edit.titleEmpty : null}
        />
        <FieldBox
          label={copy.detail.correspondent}
          value={nameOf(labels.correspondents.data, draft.correspondentId)}
          placeholder={copy.detail.notSet}
          changed={'correspondentId' in changes}
          onPress={() => setPicker('correspondent')}
        />
        <FieldBox
          label={copy.detail.documentType}
          value={nameOf(labels.documentTypes.data, draft.documentTypeId)}
          placeholder={copy.detail.notSet}
          changed={'documentTypeId' in changes}
          onPress={() => setPicker('documentType')}
        />
        <DateField
          label={copy.detail.created}
          value={draft.created}
          placeholder={copy.detail.notSet}
          changed={'created' in changes}
          onChange={(created) => setDraft({ ...draft, created })}
        />
        <View style={styles.field}>
          <FieldLabel label={copy.detail.tags} changed={'tagIds' in changes} />
          <View style={styles.chips}>
            {draft.tagIds.map((tagId) => {
              const name = nameOf(tags, tagId) ?? String(tagId);
              return (
                <Chip
                  key={tagId}
                  label={name}
                  trailingIcon="close"
                  accessibilityLabel={copy.edit.removeTag(name)}
                  onPress={() => setDraft({ ...draft, tagIds: draft.tagIds.filter((other) => other !== tagId) })}
                />
              );
            })}
            <Chip label="" icon="plus" accessibilityLabel={copy.edit.addTag} onPress={() => setPicker('tags')} />
          </View>
        </View>
        <FieldBox
          label={copy.detail.storagePath}
          value={nameOf(labels.storagePaths.data, draft.storagePathId)}
          placeholder={copy.detail.notSet}
          changed={'storagePathId' in changes}
          onPress={() => setPicker('storagePath')}
        />
        <Field
          label={copy.detail.archiveNumber}
          value={archiveText}
          onChangeText={setArchiveText}
          keyboardType="number-pad"
          changed={'archiveSerialNumber' in changes}
          error={archive.ok ? null : copy.edit.archiveInvalid}
        />
      </ScrollView>
      {picker === 'tags' && (
        <Picker
          visible
          title={copy.detail.tags}
          items={tags}
          selected={draft.tagIds}
          multiple
          createLabel={copy.picker.createTag}
          onCreate={(name) => createLabel.create('tags', name)}
          onClose={() => setPicker(null)}
          onDone={picked}
        />
      )}
      {picker === 'correspondent' && (
        <Picker
          visible
          title={copy.detail.correspondent}
          items={labels.correspondents.data ?? []}
          selected={draft.correspondentId === null ? [] : [draft.correspondentId]}
          emptyChoice={copy.picker.none}
          createLabel={copy.picker.createCorrespondent}
          onCreate={(name) => createLabel.create('correspondents', name)}
          onClose={() => setPicker(null)}
          onDone={picked}
        />
      )}
      {picker === 'documentType' && (
        <Picker
          visible
          title={copy.detail.documentType}
          items={labels.documentTypes.data ?? []}
          selected={draft.documentTypeId === null ? [] : [draft.documentTypeId]}
          emptyChoice={copy.picker.none}
          onClose={() => setPicker(null)}
          onDone={picked}
        />
      )}
      {picker === 'storagePath' && (
        <Picker
          visible
          title={copy.detail.storagePath}
          items={labels.storagePaths.data ?? []}
          selected={draft.storagePathId === null ? [] : [draft.storagePathId]}
          emptyChoice={copy.picker.none}
          onClose={() => setPicker(null)}
          onDone={picked}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { marginBlockStart: 48 },
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingInlineStart: 4, paddingInlineEnd: 8 },
  iconButton: { width: touchTarget, height: touchTarget, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: '500' },
  body: { paddingBlockStart: 8, paddingBlockEnd: 32, paddingInline: 20, gap: 18 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBlock: 12, paddingInline: 14, borderRadius: 12 },
  noticeText: { flex: 1, fontSize: 14.5 },
  error: { fontSize: 14.5 },
  field: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
