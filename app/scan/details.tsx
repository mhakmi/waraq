import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { type Draft, readValue, showValue, type WireValue } from '../../src/documents/customFields';
import { type Named, nameOf, useCreateLabel, useLabels } from '../../src/labels';
import type { CustomField } from '../../src/paperless/schemas';
import {
  type Batch,
  type DocumentMetadata,
  type DraftDocument,
  pageCount,
  resolveCustomFields,
  setOwn,
  setShared,
  withCustomField,
  withoutCustomField,
} from '../../src/scan/batch';
import { batchQueued, dropQueuedDocuments, updateBatch, useBatch } from '../../src/scan/store';
import { useSignedIn } from '../../src/session';
import { useCan } from '../../src/settings/usePermissions';
import { radius, touchTarget, useColors } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { CustomFieldSheet } from '../../src/ui/CustomFieldEditor';
import { TagPill } from '../../src/ui/Chip';
import { Field } from '../../src/ui/Field';
import { Icon } from '../../src/ui/Icon';
import { IconButton } from '../../src/ui/IconButton';
import { PageThumb } from '../../src/ui/PageThumb';
import { Picker } from '../../src/ui/Picker';
import type { JobId } from '../../src/upload/machine';
import { enqueueBatch } from '../../src/upload/queue';

type OneOf = 'correspondentId' | 'documentTypeId' | 'storagePathId';
type FieldName = OneOf | 'tagIds';
type Scope = { kind: 'shared' } | { kind: 'own'; documentId: JobId };
type OpenPicker = { scope: Scope; field: FieldName } | null;
type OpenCustomField = { scope: Scope; field: CustomField; start: Draft } | null;

const oneOfFields: OneOf[] = ['correspondentId', 'documentTypeId', 'storagePathId'];

const fieldLabels: Record<FieldName, string> = {
  tagIds: copy.scan.tags,
  correspondentId: copy.scan.correspondent,
  documentTypeId: copy.scan.documentType,
  storagePathId: copy.scan.storagePath,
};

export default function BatchDetailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const accountId = useSignedIn().account.id;
  const { batch } = useBatch();
  const labels = useLabels();
  const createLabel = useCreateLabel();
  const can = useCan();
  const [picker, setPicker] = useState<OpenPicker>(null);
  const [addingTo, setAddingTo] = useState<Scope | null>(null);
  const [customField, setCustomField] = useState<OpenCustomField>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const uploadStarted = useRef(false);

  useEffect(() => {
    if (batch === null && !uploading) {
      router.back();
    }
  }, [batch, uploading, router]);

  if (batch === null) {
    return null;
  }

  const items: Record<FieldName, Named[]> = {
    tagIds: labels.tags.data ?? [],
    correspondentId: labels.correspondents.data ?? [],
    documentTypeId: labels.documentTypes.data ?? [],
    storagePathId: labels.storagePaths.data ?? [],
  };

  function change(edit: (current: Batch) => Batch) {
    updateBatch(accountId, edit);
  }

  function metadataOf(scope: Scope): DocumentMetadata {
    if (scope.kind === 'shared' || batch === null) {
      return batch?.shared ?? {};
    }
    return batch.documents.find((document) => document.id === scope.documentId)?.metadata ?? {};
  }

  function apply(scope: Scope, metadata: DocumentMetadata) {
    change((current) => (scope.kind === 'shared' ? setShared(current, metadata) : setOwn(current, scope.documentId, metadata)));
  }

  function picked(ids: number[]) {
    if (picker === null) {
      return;
    }
    const { scope, field } = picker;
    if (field === 'tagIds') {
      apply(scope, { tagIds: ids });
    } else {
      const none = scope.kind === 'shared' ? undefined : null;
      apply(scope, { [field]: ids[0] ?? none });
    }
    setPicker(null);
  }

  async function upload() {
    if (batch === null || uploadStarted.current) {
      return;
    }
    uploadStarted.current = true;
    setUploading(true);
    setUploadFailed(false);
    try {
      await enqueueBatch(batch);
      batchQueued();
      router.dismissAll();
    } catch {
      await dropQueuedDocuments();
      uploadStarted.current = false;
      setUploadFailed(true);
      setUploading(false);
    }
  }

  const customFields = labels.customFields.data ?? [];

  function customFieldsOf(scope: Scope) {
    return metadataOf(scope).customFields ?? [];
  }

  function setCustomFieldValue(scope: Scope, fieldId: number, value: WireValue) {
    apply(scope, { customFields: withCustomField(customFieldsOf(scope), fieldId, value) });
  }

  function removeCustomField(scope: Scope, fieldId: number) {
    apply(scope, { customFields: withoutCustomField(customFieldsOf(scope), fieldId) });
  }

  function customText(fieldId: number, value: WireValue): string {
    const field = customFields.find((candidate) => candidate.id === fieldId);
    return (field === undefined ? null : showValue(field, value, copy.locale, copy.detail.fieldWords)) ?? copy.scan.none;
  }

  function fieldsToAdd(scope: Scope): CustomField[] {
    const present = new Set(
      scope.kind === 'shared'
        ? customFieldsOf(scope).map((entry) => entry.fieldId)
        : resolveCustomFields(batch?.shared.customFields, customFieldsOf(scope)).map((entry) => entry.fieldId),
    );
    return customFields.filter((field) => !present.has(field.id) && readValue(field, null) !== null);
  }

  function openCustomField(scope: Scope, fieldId: number) {
    const field = customFields.find((candidate) => candidate.id === fieldId);
    const own = scope.kind === 'shared' ? [] : customFieldsOf(scope);
    const value = resolveCustomFields(batch?.shared.customFields, own).find((entry) => entry.fieldId === fieldId)?.value ?? null;
    const start = field === undefined ? null : (readValue(field, value) ?? readValue(field, null));
    if (field !== undefined && start !== null) {
      setCustomField({ scope, field, start });
    }
  }

  function nameFor(field: OneOf, id: number | null): string {
    return id === null ? copy.scan.none : (nameOf(items[field], id) ?? String(id));
  }

  function tagNames(ids: number[] | undefined): string {
    return (ids ?? []).map((id) => nameOf(items.tagIds, id) ?? String(id)).join(', ');
  }

  const shared = batch.shared;
  const sharedTags = shared.tagIds ?? [];
  const open = picker === null ? null : { ...picker, metadata: metadataOf(picker.scope) };
  const selected =
    open === null
      ? []
      : open.field === 'tagIds'
        ? (open.metadata.tagIds ?? [])
        : [open.metadata[open.field]].flatMap((id) => (typeof id === 'number' ? [id] : []));

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <View style={styles.bar}>
        <IconButton icon="back" label={copy.shell.back} onPress={() => router.back()} />
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.ink }]}>
            {copy.scan.detailsTitle}
          </Text>
          <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{copy.scan.documentCount(batch.documents.length)}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {createLabel.failed && (
          <Text accessibilityLiveRegion="polite" style={[styles.problem, { color: colors.danger }]}>
            {copy.picker.createFailed}
          </Text>
        )}
        <Text accessibilityRole="header" style={[styles.section, { color: colors.inkMuted }]}>
          {copy.scan.forEvery}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
          <Row
            label={copy.scan.tags}
            first
            onPress={() => setPicker({ scope: { kind: 'shared' }, field: 'tagIds' })}
            accessibilityValue={sharedTags.length === 0 ? copy.scan.serverChooses : tagNames(sharedTags)}
          >
            {sharedTags.length === 0 ? (
              <Text style={[styles.value, { color: colors.inkMuted }]}>{copy.scan.serverChooses}</Text>
            ) : (
              <View style={styles.pills}>
                {sharedTags.map((id) => {
                  const tag = labels.tags.data?.find((candidate) => candidate.id === id);
                  return <TagPill key={id} name={tag?.name ?? String(id)} inbox={tag?.isInboxTag ?? false} />;
                })}
              </View>
            )}
          </Row>
          {oneOfFields.map((field) => {
            const value = shared[field];
            const text = value === undefined || value === null ? copy.scan.serverChooses : nameFor(field, value);
            return (
              <Row
                key={field}
                label={fieldLabels[field]}
                onPress={() => setPicker({ scope: { kind: 'shared' }, field })}
                accessibilityValue={text}
              >
                <Text style={[styles.value, { color: value == null ? colors.inkMuted : colors.ink }]}>{text}</Text>
              </Row>
            );
          })}
          {(shared.customFields ?? []).map((entry) => {
            const text = customText(entry.fieldId, entry.value);
            return (
              <Row
                key={`custom-${entry.fieldId}`}
                label={customFields.find((field) => field.id === entry.fieldId)?.name ?? String(entry.fieldId)}
                onPress={() => openCustomField({ kind: 'shared' }, entry.fieldId)}
                accessibilityValue={text}
              >
                <Text style={[styles.value, { color: colors.ink }]}>{text}</Text>
              </Row>
            );
          })}
          {fieldsToAdd({ kind: 'shared' }).length > 0 && (
            <AddFieldRow onPress={() => setAddingTo({ kind: 'shared' })} />
          )}
        </View>
        <Text style={[styles.help, { color: colors.inkMuted }]}>{copy.scan.letServer}</Text>
        {batch.documents.map((document, index) => (
          <DocumentDetails
            key={document.id}
            document={document}
            number={index + 1}
            shared={shared}
            nameFor={nameFor}
            tagNames={tagNames}
            onTitle={(title) => apply({ kind: 'own', documentId: document.id }, { title })}
            onPick={(field) => setPicker({ scope: { kind: 'own', documentId: document.id }, field })}
            onReset={(field) => apply({ kind: 'own', documentId: document.id }, { [field]: undefined })}
            customFields={customFields}
            customText={customText}
            canAddField={fieldsToAdd({ kind: 'own', documentId: document.id }).length > 0}
            onAddField={() => setAddingTo({ kind: 'own', documentId: document.id })}
            onOpenField={(fieldId) => openCustomField({ kind: 'own', documentId: document.id }, fieldId)}
            onResetField={(fieldId) => removeCustomField({ kind: 'own', documentId: document.id }, fieldId)}
          />
        ))}
        {uploadFailed && (
          <Text accessibilityLiveRegion="polite" style={[styles.problem, { color: colors.danger }]}>
            {copy.scan.uploadFailed}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.bottom, { borderTopColor: colors.line }]}>
        <Button label={copy.scan.upload(batch.documents.length)} large busy={uploading} onPress={upload} />
      </View>
      {addingTo !== null && (
        <Picker
          visible
          title={copy.customFields.add}
          items={fieldsToAdd(addingTo)}
          selected={[]}
          onClose={() => setAddingTo(null)}
          onDone={(ids) => {
            const scope = addingTo;
            setAddingTo(null);
            if (ids[0] !== undefined) {
              openCustomField(scope, ids[0]);
            }
          }}
        />
      )}
      {customField !== null && (
        <CustomFieldSheet
          field={customField.field}
          start={customField.start}
          clearLabel={customField.scope.kind === 'shared' ? copy.customFields.removeFromBatch : copy.customFields.none}
          onSet={(value) => {
            setCustomFieldValue(customField.scope, customField.field.id, value);
            setCustomField(null);
          }}
          onClear={() => {
            if (customField.scope.kind === 'shared') {
              removeCustomField(customField.scope, customField.field.id);
            } else {
              setCustomFieldValue(customField.scope, customField.field.id, null);
            }
            setCustomField(null);
          }}
          onClose={() => setCustomField(null)}
        />
      )}
      {open !== null && (
        <Picker
          visible
          title={fieldLabels[open.field]}
          items={items[open.field]}
          selected={selected}
          multiple={open.field === 'tagIds'}
          emptyChoice={open.field === 'tagIds' ? undefined : open.scope.kind === 'shared' ? copy.scan.serverChooses : copy.scan.none}
          createLabel={
            open.field === 'tagIds' ? copy.picker.createTag : open.field === 'correspondentId' ? copy.picker.createCorrespondent : undefined
          }
          onCreate={
            open.field === 'tagIds' && can('add', 'tags')
              ? (name) => createLabel.create('tags', name)
              : open.field === 'correspondentId' && can('add', 'correspondents')
                ? (name) => createLabel.create('correspondents', name)
                : undefined
          }
          onClose={() => setPicker(null)}
          onDone={picked}
        />
      )}
    </SafeAreaView>
  );
}

type RowProps = {
  label: string;
  first?: boolean;
  onPress: () => void;
  accessibilityValue: string;
  trailing?: ReactNode;
  children: ReactNode;
};

function Row({ label, first = false, onPress, accessibilityValue, trailing, children }: RowProps) {
  const colors = useColors();
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${accessibilityValue}`}
        onPress={onPress}
        style={({ pressed }) => [styles.rowPress, pressed && { backgroundColor: colors.surfaceSunken }]}
      >
        <Text style={[styles.rowLabel, { color: colors.inkMuted }]}>{label}</Text>
        <View style={styles.rowValue}>{children}</View>
        {trailing === undefined && <Icon name="chevronEnd" color={colors.inkMuted} size={18} />}
      </Pressable>
      {trailing}
    </View>
  );
}

function AddFieldRow({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.rowPress, pressed && { backgroundColor: colors.surfaceSunken }]}
      >
        <Icon name="plus" color={colors.accent} size={18} />
        <Text style={[styles.value, { color: colors.accent }]}>{copy.customFields.add}</Text>
      </Pressable>
    </View>
  );
}

type DocumentDetailsProps = {
  document: DraftDocument;
  number: number;
  shared: DocumentMetadata;
  nameFor: (field: OneOf, id: number | null) => string;
  tagNames: (ids: number[] | undefined) => string;
  onTitle: (title: string) => void;
  onPick: (field: FieldName) => void;
  onReset: (field: FieldName) => void;
  customFields: CustomField[];
  customText: (fieldId: number, value: WireValue) => string;
  canAddField: boolean;
  onAddField: () => void;
  onOpenField: (fieldId: number) => void;
  onResetField: (fieldId: number) => void;
};

function DocumentDetails(props: DocumentDetailsProps) {
  const { document, number, shared, nameFor, tagNames, onTitle, onPick, onReset } = props;
  const colors = useColors();
  const own = document.metadata;
  const firstPage = document.kind === 'pages' ? document.pages[0] : undefined;

  function fromBatch(text: string, set: boolean) {
    return (
      <>
        <Text style={[styles.value, { color: colors.inkMuted }]}>{set ? text : copy.scan.serverChooses}</Text>
        <Text style={[styles.note, { color: colors.inkMuted }]}>{copy.scan.fromBatch}</Text>
      </>
    );
  }

  function onlyThis(text: string) {
    return (
      <>
        <Text style={[styles.value, { color: colors.ink }]}>{text}</Text>
        <Text style={[styles.note, styles.own, { color: colors.accent }]}>{copy.scan.onlyThis}</Text>
      </>
    );
  }

  function reset(field: FieldName) {
    return <IconButton icon="close" label={copy.scan.useBatchValue(fieldLabels[field])} onPress={() => onReset(field)} color={colors.inkMuted} />;
  }

  function oneOfRow(field: OneOf) {
    const mine = own[field];
    const theirs = shared[field];
    const text = mine !== undefined ? nameFor(field, mine) : theirs == null ? copy.scan.serverChooses : nameFor(field, theirs);
    return (
      <Row
        label={fieldLabels[field]}
        onPress={() => onPick(field)}
        accessibilityValue={`${text}, ${mine !== undefined ? copy.scan.onlyThis : copy.scan.fromBatch}`}
        trailing={mine !== undefined ? reset(field) : undefined}
      >
        {mine !== undefined ? onlyThis(text) : fromBatch(text, theirs != null)}
      </Row>
    );
  }

  const ownTags = own.tagIds ?? [];
  const sharedTags = shared.tagIds ?? [];

  return (
    <View style={[styles.card, styles.documentCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
      <View style={styles.documentHead}>
        {firstPage !== undefined ? (
          <PageThumb uri={firstPage.uri} width={firstPage.width} height={firstPage.height} rotation={firstPage.rotation} maxHeight={42} />
        ) : (
          document.kind === 'pdf' && <PageThumb uri={document.pdf.thumbnailUri} width={210} height={297} rotation={0} maxHeight={42} />
        )}
        <Text style={[styles.documentName, { color: colors.ink }]}>{copy.scan.documentName(number)}</Text>
        <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{copy.scan.pages(pageCount(document))}</Text>
      </View>
      <View style={styles.titleField}>
        <Field label={copy.scan.title} value={own.title ?? ''} placeholder={copy.scan.titlePlaceholder} onChangeText={onTitle} />
      </View>
      {oneOfRow('correspondentId')}
      {oneOfRow('documentTypeId')}
      <Row
        label={copy.scan.tags}
        onPress={() => onPick('tagIds')}
        accessibilityValue={[tagNames(sharedTags), tagNames(ownTags)].filter((names) => names !== '').join(', ') || copy.scan.serverChooses}
        trailing={ownTags.length > 0 ? reset('tagIds') : undefined}
      >
        {ownTags.length > 0 && onlyThis(tagNames(ownTags))}
        {(sharedTags.length > 0 || ownTags.length === 0) && fromBatch(tagNames(sharedTags), sharedTags.length > 0)}
      </Row>
      {oneOfRow('storagePathId')}
      {resolveCustomFields(shared.customFields, own.customFields).map((entry) => {
        const text = props.customText(entry.fieldId, entry.value);
        const name = props.customFields.find((field) => field.id === entry.fieldId)?.name ?? String(entry.fieldId);
        return (
          <Row
            key={`custom-${entry.fieldId}`}
            label={name}
            onPress={() => props.onOpenField(entry.fieldId)}
            accessibilityValue={`${text}, ${entry.fromBatch ? copy.scan.fromBatch : copy.scan.onlyThis}`}
            trailing={
              entry.fromBatch ? undefined : (
                <IconButton icon="close" label={copy.scan.useBatchValue(name)} onPress={() => props.onResetField(entry.fieldId)} color={colors.inkMuted} />
              )
            }
          >
            {entry.fromBatch ? fromBatch(text, true) : onlyThis(text)}
          </Row>
        );
      })}
      {props.canAddField && <AddFieldRow onPress={props.onAddField} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingInlineStart: 4, paddingInlineEnd: 8 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '500' },
  subtitle: { fontSize: 13.5 },
  body: { paddingBlockStart: 8, paddingBlockEnd: 24, paddingInline: 16, gap: 8 },
  section: { fontSize: 14.5, fontWeight: '600', paddingInline: 4, paddingBlock: 4 },
  card: { borderRadius: radius, borderWidth: 1, overflow: 'hidden' },
  documentCard: { marginBlockStart: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowPress: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingBlock: 8,
    paddingInlineStart: 16,
    paddingInlineEnd: 12,
  },
  rowLabel: { minWidth: 120, fontSize: 14 },
  rowValue: { flex: 1, minWidth: 140, gap: 2 },
  value: { fontSize: 15.5 },
  note: { fontSize: 12.5 },
  own: { fontWeight: '500' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  help: { fontSize: 14, paddingInline: 4, paddingBlockEnd: 4 },
  documentHead: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingBlockStart: 14, paddingBlockEnd: 10, paddingInline: 16 },
  documentName: { fontSize: 16, fontWeight: '600' },
  titleField: { paddingInline: 16, paddingBlockEnd: 12 },
  problem: { fontSize: 14.5, paddingBlockStart: 8 },
  bottom: { paddingBlock: 12, paddingInline: 16, borderTopWidth: 1 },
});
