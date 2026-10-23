import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Directory, type File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryKeys, thumbnailCacheKey } from '../../../src/cache/keys';
import { copy } from '../../../src/copy';
import { customFieldRows } from '../../../src/documents/customFields';
import { permissionRows } from '../../../src/documents/permissions';
import { copyToFolder, localCopy } from '../../../src/files/download';
import { mimeTypeOf } from '../../../src/files/opened';
import { formatCalendarDate, formatInstantDate } from '../../../src/format';
import { nameOf, useLabels } from '../../../src/labels';
import type { DocumentDetail, DocumentId, Note } from '../../../src/paperless/schemas';
import { errorText, isForbidden, unwrap, useOnline } from '../../../src/query';
import { useClient, useSignedIn } from '../../../src/session';
import { radius, touchTarget, useColors } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { TagPill } from '../../../src/ui/Chip';
import { Icon, type IconName } from '../../../src/ui/Icon';
import { Menu } from '../../../src/ui/Menu';
import { Message, SavedCopyLine } from '../../../src/ui/Message';
import { useCan } from '../../../src/settings/usePermissions';
import { Snackbar, useSnackbarState } from '../../../src/ui/Snackbar';
import { BackBar } from '../../../src/ui/TopBar';

export default function DocumentScreen() {
  const colors = useColors();
  const client = useClient();
  const router = useRouter();
  const online = useOnline();
  const queryClient = useQueryClient();
  const { account } = useSignedIn();
  const id = Number(useLocalSearchParams<{ id: string }>().id) as DocumentId;
  const snackbar = useSnackbarState();
  const can = useCan();
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchingFile, setFetchingFile] = useState(false);

  const detail = useQuery({
    queryKey: queryKeys.document(account.id, id),
    queryFn: () => unwrap(client.getDocument(id)),
  });
  const document = detail.data;

  async function withFile(use: (file: File) => Promise<void>) {
    if (document === undefined || fetchingFile) {
      return;
    }
    setFetchingFile(true);
    const file = await localCopy({
      accountId: account.id,
      id: document.id,
      modified: document.modified,
      title: document.title,
      originalFileName: document.originalFileName,
      request: client.documentFile(document.id, 'download'),
    });
    setFetchingFile(false);
    if (!file.ok) {
      snackbar.show({ text: copy.detail.fileFailed });
      return;
    }
    await use(file.value);
  }

  const open = () =>
    withFile(async (file) => {
      const mimeType = mimeTypeOf(file.name);
      if (!(await file.canPreview({ mimeType }))) {
        snackbar.show({ text: copy.detail.noApp });
        return;
      }
      await file.preview({ title: document?.title, mimeType }).catch(() => snackbar.show({ text: copy.detail.noApp }));
    });

  const share = () =>
    withFile((file) => Sharing.shareAsync(file.uri, { mimeType: mimeTypeOf(file.name), dialogTitle: document?.title }));

  const download = () =>
    withFile(async (file) => {
      let folder: Directory;
      try {
        folder = await Directory.pickDirectoryAsync();
      } catch {
        return;
      }
      try {
        await copyToFolder(file, folder);
        snackbar.show({ text: copy.detail.saved });
      } catch {
        snackbar.show({ text: copy.detail.saveFailed });
      }
    });

  const remove = useMutation({
    mutationFn: () => unwrap(client.deleteDocument(id)),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.document(account.id, id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allDocumentLists(account.id) });
      router.back();
    },
    onError: () => snackbar.show({ text: copy.detail.deleteFailed }),
  });

  function askToDelete() {
    if (document === undefined) {
      return;
    }
    Alert.alert(copy.detail.deleteTitle, copy.detail.deleteMessage(document.title), [
      { text: copy.detail.cancel, style: 'cancel' },
      { text: copy.detail.delete, style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  let body: ReactNode;
  if (document !== undefined) {
    body = <DocumentBody document={document} onOpen={open} fetchingFile={fetchingFile} />;
  } else if (detail.isError) {
    body = (
      <Message title={copy.detail.errorTitle} lead={errorText(detail.error)}>
        <Button label={copy.detail.tryAgain} onPress={() => detail.refetch()} variant="outline" />
      </Message>
    );
  } else if (detail.fetchStatus === 'paused') {
    body = <Message title={copy.detail.offlineTitle} lead={copy.detail.offlineLead} />;
  } else {
    body = <ActivityIndicator style={styles.loading} color={colors.accent} size="large" />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <BackBar>
        <View style={styles.spacer} />
        {document !== undefined && (
          <>
            <IconButton icon="share" label={copy.detail.share} onPress={share} />
            <IconButton icon="openWith" label={copy.detail.openWith} onPress={open} />
            <IconButton icon="more" label={copy.detail.more} onPress={() => setMenuOpen(true)} />
          </>
        )}
      </BackBar>
      {document !== undefined && (!online || detail.isError) && <SavedCopyLine />}
      {body}
      <Menu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          { label: copy.detail.download, icon: 'download', onPress: download },
          ...(document?.userCanChange && can('delete', 'documents') ? [{ label: copy.detail.delete, icon: 'trash' as const, danger: true, onPress: askToDelete }] : []),
        ]}
      />
      <Snackbar message={snackbar.message} bottom={16} onHide={snackbar.hide} />
    </SafeAreaView>
  );
}

function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <Icon name={icon} color={colors.ink} />
    </Pressable>
  );
}

function DocumentBody({ document, onOpen, fetchingFile }: { document: DocumentDetail; onOpen: () => void; fetchingFile: boolean }) {
  const colors = useColors();
  const client = useClient();
  const router = useRouter();
  const { account } = useSignedIn();
  const labels = useLabels();
  const [textShown, setTextShown] = useState(false);
  const thumbnail = client.documentFile(document.id, 'thumb');

  const rows: { label: string; value: ReactNode; hidden?: boolean }[] = [
    {
      label: copy.detail.correspondent,
      value: nameOf(labels.correspondents.data, document.correspondentId),
      hidden: isForbidden(labels.correspondents.error),
    },
    {
      label: copy.detail.documentType,
      value: nameOf(labels.documentTypes.data, document.documentTypeId),
      hidden: isForbidden(labels.documentTypes.error),
    },
    { label: copy.detail.created, value: formatCalendarDate(document.created, copy.locale) },
    {
      label: copy.detail.tags,
      value:
        document.tagIds.length === 0 ? null : (
          <View style={styles.tags}>
            {document.tagIds.map((tagId) => {
              const tag = labels.tags.data?.find((item) => item.id === tagId);
              return tag ? <TagPill key={tagId} name={tag.name} inbox={tag.isInboxTag} /> : null;
            })}
          </View>
        ),
      hidden: isForbidden(labels.tags.error),
    },
    {
      label: copy.detail.storagePath,
      value: nameOf(labels.storagePaths.data, document.storagePathId),
      hidden: isForbidden(labels.storagePaths.error),
    },
    {
      label: copy.detail.archiveNumber,
      value: document.archiveSerialNumber === null ? null : String(document.archiveSerialNumber),
    },
    ...customFieldRows(document.customFields, labels.customFields.data ?? [], copy.locale, copy.detail.fieldWords).map((row) => ({
      label: row.name,
      value: row.value,
    })),
  ];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.detail.openDocument(document.title)}
        onPress={onOpen}
        style={[styles.preview, { backgroundColor: colors.paper, borderColor: colors.line }]}
      >
        <Image
          source={{
            uri: thumbnail.url,
            headers: thumbnail.headers,
            cacheKey: thumbnailCacheKey(account.serverUrl, document.id, document.modified),
          }}
          contentFit="cover"
          contentPosition="top"
          accessible={false}
          style={styles.previewImage}
        />
        <View style={[styles.openHint, { backgroundColor: colors.snackbar }]}>
          {fetchingFile ? (
            <ActivityIndicator size="small" color={colors.onSnackbar} />
          ) : (
            <Icon name="openWith" color={colors.onSnackbar} size={18} />
          )}
          <Text style={[styles.openHintText, { color: colors.onSnackbar }]}>
            {fetchingFile ? copy.detail.opening : copy.detail.previewHint}
          </Text>
        </View>
      </Pressable>

      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {document.title}
        </Text>
        {document.userCanChange && (
          <Button label={copy.detail.edit} icon="pencil" variant="tonal" compact onPress={() => router.push(`/document/${document.id}/edit`)} />
        )}
      </View>

      <SectionTitle title={copy.detail.details} />
      {rows
        .filter((row) => !row.hidden)
        .map((row) => (
          <View key={row.label} style={[styles.detailRow, { borderTopColor: colors.line }]}>
            <Text style={[styles.detailLabel, { color: colors.inkMuted }]}>{row.label}</Text>
            <View style={styles.detailValue}>
              {typeof row.value === 'string' || row.value === null ? (
                <Text style={[styles.detailText, { color: row.value === null ? colors.inkMuted : colors.ink }]}>
                  {row.value ?? copy.detail.notSet}
                </Text>
              ) : (
                row.value
              )}
            </View>
          </View>
        ))}

      <Permissions document={document} />

      <Notes document={document} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: textShown }}
        onPress={() => setTextShown(!textShown)}
        style={[styles.card, styles.collapsed, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}
      >
        <Text style={[styles.collapsedTitle, { color: colors.ink }]}>{copy.detail.textFound}</Text>
        <View style={textShown && styles.flippedVertically}>
          <Icon name="chevronDown" color={colors.ink} />
        </View>
      </Pressable>
      {textShown && (
        <Text selectable style={[styles.content, styles.documentText, { color: document.content === '' ? colors.inkMuted : colors.ink }]}>
          {document.content === '' ? copy.detail.noText : document.content}
        </Text>
      )}
    </ScrollView>
  );
}

function Notes({ document }: { document: DocumentDetail }) {
  const colors = useColors();
  const client = useClient();
  const queryClient = useQueryClient();
  const { account } = useSignedIn();
  const [text, setText] = useState('');
  const can = useCan();
  const notesKey = queryKeys.notes(account.id, document.id);
  const notes = useQuery({ queryKey: notesKey, queryFn: () => unwrap(client.listNotes(document.id)) });
  const add = useMutation({
    mutationFn: (note: string) => unwrap(client.addNote(document.id, note)),
    onSuccess: (list) => {
      queryClient.setQueryData(notesKey, list);
      setText('');
    },
  });
  const remove = useMutation({
    mutationFn: (noteId: number) => unwrap(client.deleteNote(document.id, noteId)),
    onSuccess: (list) => queryClient.setQueryData(notesKey, list),
  });

  function askToDelete(note: Note) {
    Alert.alert(copy.notes.deleteTitle, copy.notes.deleteMessage, [
      { text: copy.notes.cancel, style: 'cancel' },
      { text: copy.notes.delete, style: 'destructive', onPress: () => remove.mutate(note.id) },
    ]);
  }

  if (isForbidden(notes.error)) {
    return null;
  }
  return (
    <View>
      <SectionTitle title={copy.detail.notes} />
      {(notes.data ?? []).map((note) => (
        <View key={note.id} style={[styles.card, styles.note, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
          <View style={styles.noteHead}>
            <Text style={[styles.noteBy, { color: colors.inkMuted }]}>
              {copy.detail.noteBy(note.user.fullName === '' ? note.user.username : note.user.fullName, formatInstantDate(note.created, copy.locale))}
            </Text>
            {document.userCanChange && can('delete', 'notes') && (
              <IconButton icon="trash" label={copy.notes.delete} onPress={() => askToDelete(note)} />
            )}
          </View>
          <Text style={[styles.noteText, { color: colors.ink }]}>{note.text}</Text>
        </View>
      ))}
      {document.userCanChange && can('add', 'notes') && (
        <View style={[styles.noteAdd, { backgroundColor: colors.surfaceRaised, borderColor: colors.outline }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={copy.detail.addNote}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={copy.detail.addNote}
            multiline
            style={[styles.noteInput, { color: colors.ink }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.detail.addNote}
            accessibilityState={{ disabled: text.trim() === '' || add.isPending }}
            disabled={text.trim() === '' || add.isPending}
            onPress={() => add.mutate(text.trim())}
            style={styles.iconButton}
          >
            {add.isPending ? <ActivityIndicator color={colors.accent} /> : <Icon name="plus" color={colors.ink} />}
          </Pressable>
        </View>
      )}
      {add.isError && <Text style={[styles.noteError, { color: colors.danger }]}>{copy.detail.noteFailed}</Text>}
      {remove.isError && (
        <Text accessibilityLiveRegion="polite" style={[styles.noteError, { color: colors.danger }]}>
          {isForbidden(remove.error) ? copy.notes.deleteForbidden : copy.notes.deleteFailed}
        </Text>
      )}
    </View>
  );
}

function Permissions({ document }: { document: DocumentDetail }) {
  const colors = useColors();
  const client = useClient();
  const { account } = useSignedIn();
  const common = { staleTime: 5 * 60_000 };
  const permissions = useQuery({
    queryKey: queryKeys.documentPermissions(account.id, document.id),
    queryFn: () => unwrap(client.getDocumentPermissions(document.id)),
  });
  const users = useQuery({ ...common, queryKey: queryKeys.people(account.id, 'users'), queryFn: () => unwrap(client.listUsers()) });
  const groups = useQuery({ ...common, queryKey: queryKeys.people(account.id, 'groups'), queryFn: () => unwrap(client.listGroups()) });

  if (permissions.data === undefined || users.data === undefined || isForbidden(groups.error)) {
    return null;
  }
  const rows = permissionRows(permissions.data, users.data, groups.data ?? [], copy.documentPermissions);
  return (
    <View>
      <SectionTitle title={copy.documentPermissions.title} />
      {[
        [copy.documentPermissions.owner, rows.owner],
        [copy.documentPermissions.canView, rows.canView],
        [copy.documentPermissions.canChange, rows.canChange],
      ].map(([label, value]) => (
        <View key={label} style={[styles.detailRow, { borderTopColor: colors.line }]}>
          <Text style={[styles.detailLabel, { color: colors.inkMuted }]}>{label}</Text>
          <View style={styles.detailValue}>
            <Text style={[styles.detailText, { color: colors.ink }]}>{value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.inkMuted }]}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spacer: { flex: 1 },
  loading: { marginBlockStart: 48 },
  iconButton: { width: touchTarget, height: touchTarget, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBlockEnd: 32 },
  preview: { marginInline: 20, marginBlockStart: 4, height: 360, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  previewImage: { flex: 1 },
  openHint: {
    position: 'absolute',
    bottom: 12,
    end: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
  },
  openHintText: { fontSize: 13, fontWeight: '500' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBlockStart: 20, paddingBlockEnd: 4, paddingInlineStart: 20, paddingInlineEnd: 12 },
  title: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: '500' },
  sectionTitle: { paddingBlockStart: 20, paddingBlockEnd: 8, paddingInline: 20, fontSize: 14, fontWeight: '600' },
  detailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBlock: 12, paddingInline: 20, borderTopWidth: 1 },
  detailLabel: { minWidth: 130, fontSize: 14 },
  detailValue: { flexBasis: 160, flexGrow: 1, minWidth: 0 },
  detailText: { fontSize: 15 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  card: { borderWidth: 1, borderRadius: radius },
  note: { marginInline: 20, marginBlockEnd: 12, paddingBlock: 14, paddingInline: 16 },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBlockStart: -8, marginInlineEnd: -10 },
  noteBy: { flex: 1, fontSize: 13 },
  noteText: { fontSize: 15 },
  noteAdd: { marginInline: 20, minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingInlineStart: 16, paddingInlineEnd: 4, borderRadius: 12, borderWidth: 1 },
  noteInput: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontSize: 16, paddingBlock: 8 },
  noteError: { marginInline: 20, marginBlockStart: 6, fontSize: 13.5 },
  collapsed: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, marginBlockStart: 20, marginBlockEnd: 12, marginInline: 20, paddingBlock: 8, paddingInlineStart: 16, paddingInlineEnd: 10 },
  collapsedTitle: { flex: 1, fontSize: 15, fontWeight: '500' },
  flippedVertically: { transform: [{ scaleY: -1 }] },
  documentText: { paddingInline: 20, fontSize: 14.5 },
});
