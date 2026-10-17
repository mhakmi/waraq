import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import type { ImportedFile, ScannedImage } from '../../modules/scanner';
import type { AccountId } from '../account/id';
import { BatchId, JobId } from '../upload/machine';
import { queuedJobIds } from '../upload/queue';
import { uuidV7 } from '../upload/uuid';
import {
  addDocument,
  type Batch,
  batchFiles,
  type DraftDocument,
  filesLeftBehind,
  newBatch,
  PageId,
  type ScannedPage,
  withoutQueuedDocuments,
} from './batch';
import { parseStoredBatch } from './stored';

const storageKey = 'scan-batch';
const unreadableKey = 'scan-batch-unreadable';

type Snapshot = { loaded: boolean; batch: Batch | null };

let snapshot: Snapshot = { loaded: false, batch: null };
const listeners = new Set<() => void>();
const queuedListeners = new Set<(documentCount: number) => void>();
let writes: Promise<void> = Promise.resolve();
let loadedFor: AccountId | null = null;
let loading: { accountId: AccountId; promise: Promise<Batch | null> } | null = null;

function newUuid(): string {
  const random = Uint8Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
  return uuidV7(Date.now(), random);
}

export function newJobId(): JobId {
  return JobId.parse(newUuid());
}

export function batchFolderUri(): string {
  const folder = new Directory(Paths.document, 'batch');
  if (!folder.exists) {
    folder.create({ intermediates: true });
  }
  return folder.uri;
}

export function pagesFromScan(images: ScannedImage[]): ScannedPage[] {
  return images.map((image) => ({
    id: PageId.parse(newUuid()),
    uri: image.uri,
    width: image.width,
    height: image.height,
    rotation: 0,
  }));
}

export function documentsFromFiles(files: ImportedFile[]): DraftDocument[] {
  const pdfs = files.flatMap((file): DraftDocument[] => {
    if (file.kind !== 'pdf') {
      return [];
    }
    const pdf = { uri: file.uri, name: file.name, pageCount: file.pageCount, thumbnailUri: file.thumbnailUri };
    return [{ kind: 'pdf', id: newJobId(), pdf, metadata: { title: file.name.replace(/\.pdf$/i, '') } }];
  });
  const images = files.flatMap((file) => (file.kind === 'image' ? [file] : []));
  if (images.length === 0) {
    return pdfs;
  }
  return [...pdfs, { kind: 'pages', id: newJobId(), pages: pagesFromScan(images), metadata: {} }];
}

export function addImportedFiles(accountId: AccountId, files: ImportedFile[]): number {
  const documents = documentsFromFiles(files);
  if (documents.length > 0) {
    updateBatch(accountId, (batch) => documents.reduce(addDocument, batch));
  }
  return documents.length;
}

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBatch(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

async function writeStored(batch: Batch | null): Promise<void> {
  if (batch === null) {
    await Storage.removeItem(storageKey);
  } else {
    await Storage.setItem(storageKey, JSON.stringify(batch));
  }
}

async function readStoredBatch(accountId: AccountId): Promise<Batch | null> {
  const text = await Storage.getItem(storageKey);
  const stored = parseStoredBatch(text);
  if (text !== null && stored === null) {
    await Storage.setItem(unreadableKey, text);
    await Storage.removeItem(storageKey);
    return null;
  }
  const queued = stored === null ? null : await queuedJobIds();
  const batch = stored === null || queued === null ? stored : withoutQueuedDocuments(stored, queued);
  if (batch !== stored) {
    await writeStored(batch);
  }
  if (batch !== null && batch.accountId !== accountId) {
    await Storage.removeItem(storageKey);
    if (queued !== null) {
      deleteFiles(batchFiles(batch));
    }
    return null;
  }
  return batch;
}

// After an upload that failed partway, the documents that did get jobs leave the batch,
// so a later discard or edit cannot delete files those jobs need.
export async function dropQueuedDocuments(): Promise<void> {
  const before = snapshot.batch;
  const queued = before === null ? null : await queuedJobIds();
  if (before === null || queued === null) {
    return;
  }
  const after = withoutQueuedDocuments(before, queued);
  if (after !== before) {
    publish({ loaded: true, batch: after });
    save(after, []);
  }
}

export function loadBatch(accountId: AccountId): Promise<Batch | null> {
  if (loadedFor === accountId) {
    return Promise.resolve(snapshot.batch);
  }
  if (loading?.accountId !== accountId) {
    const promise = readStoredBatch(accountId).then((batch) => {
      loadedFor = accountId;
      loading = null;
      publish({ loaded: true, batch });
      return batch;
    });
    loading = { accountId, promise };
  }
  return loading.promise;
}

export async function forgetBatch(): Promise<void> {
  await writes;
  const stored = parseStoredBatch(await Storage.getItem(storageKey));
  const queued = stored === null ? null : await queuedJobIds();
  await Storage.removeItem(storageKey);
  // Unknown jobs delete nothing: queuing a document twice is harmless, deleting a job's page files is not.
  if (stored !== null && queued !== null) {
    deleteFiles(batchFiles(withoutQueuedDocuments(stored, queued)));
  }
  loadedFor = null;
  loading = null;
  publish({ loaded: false, batch: null });
}

function deleteFiles(uris: string[]) {
  for (const uri of uris) {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  }
}

function save(batch: Batch | null, filesToDelete: string[]) {
  writes = writes
    .then(async () => {
      await writeStored(batch);
      deleteFiles(filesToDelete);
    })
    .catch(() => {});
}

export function updateBatch(accountId: AccountId, change: (batch: Batch) => Batch): void {
  const before = snapshot.batch;
  const changed = change(before ?? newBatch(BatchId.parse(newUuid()), accountId, Date.now()));
  const after = changed.documents.length === 0 ? null : changed;
  publish({ loaded: true, batch: after });
  save(after, filesLeftBehind(before, after));
}

export function discardBatch(): void {
  const before = snapshot.batch;
  publish({ loaded: true, batch: null });
  save(null, filesLeftBehind(before, null));
}

export function batchQueued(): void {
  const count = snapshot.batch?.documents.length ?? 0;
  publish({ loaded: true, batch: null });
  save(null, []);
  for (const listener of queuedListeners) {
    listener(count);
  }
}

export function onBatchQueued(listener: (documentCount: number) => void): () => void {
  queuedListeners.add(listener);
  return () => queuedListeners.delete(listener);
}
