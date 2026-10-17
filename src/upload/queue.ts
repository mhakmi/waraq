import NetInfo from '@react-native-community/netinfo';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { PdfError, writePdf } from '../../modules/scanner';
import { loadAccount } from '../account/store';
import type { StoredAccount } from '../account/types';
import { createPaperlessClient } from '../paperless/client';
import { describeError, failure, type Result, success } from '../paperless/errors';
import type { Batch } from '../scan/batch';
import { createUploadQueue, type Progress, type QueueSnapshot } from './drain';
import { expoDatabase } from './expoDatabase';
import type { AccountId, JobId, UploadJob } from './machine';
import type { JobStore, PdfBuildFailure } from './runner';
import { openJobStore } from './store';
import { xhrFetch } from './xhrFetch';

export type UploadFile = { uri: string };

const retryAfterErrorMs = 60_000;
const longestWaitMs = 30 * 60_000;

let storeOpening: Promise<JobStore> | null = null;

function openStore(): Promise<JobStore> {
  if (storeOpening === null) {
    const opening = expoDatabase('uploads.db').then(openJobStore);
    storeOpening = opening;
    opening.catch(() => {
      if (storeOpening === opening) {
        storeOpening = null;
      }
    });
  }
  return storeOpening;
}

const store: JobStore = {
  loadAll: async () => (await openStore()).loadAll(),
  insert: async (job) => (await openStore()).insert(job),
  saveIfUnchanged: async (job, loadedUpdatedAt) => (await openStore()).saveIfUnchanged(job, loadedUpdatedAt),
  deleteIfUnchanged: async (id, loadedUpdatedAt) => (await openStore()).deleteIfUnchanged(id, loadedUpdatedAt),
};

let accountLoading: Promise<StoredAccount | null> | null = null;

function storedAccount(): Promise<StoredAccount | null> {
  if (accountLoading === null) {
    const loading = loadAccount();
    accountLoading = loading;
    loading.catch(() => {
      if (accountLoading === loading) {
        accountLoading = null;
      }
    });
  }
  return accountLoading;
}

export function accountChanged(): void {
  accountLoading = null;
}

async function clientFor(accountId: AccountId, onProgress: (progress: Progress) => void) {
  const stored = await storedAccount();
  if (stored === null || stored.account.id !== accountId) {
    return null;
  }
  // Nothing leaves the phone while it is offline, so a job waits rather than failing a send
  // and then looking for an upload that never happened.
  if ((await NetInfo.fetch()).isConnected === false) {
    return null;
  }
  return createPaperlessClient<UploadFile>({
    baseUrl: stored.account.serverUrl,
    auth: { kind: 'token', token: stored.secrets.token },
    extraHeaders: stored.secrets.headerValues,
    fetch: xhrFetch(onProgress),
    appendFile: (form, field, file, filename) => {
      // React Native's FormData streams a { uri, name, type } part from disk; the DOM type knows only Blob and string.
      form.append(field, { uri: file.uri, name: filename, type: 'application/pdf' } as unknown as Blob);
    },
  });
}

// File throws on a URI that is not a file path. Such a page or PDF counts as missing.
function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

async function buildPdf(job: UploadJob): Promise<Result<string, PdfBuildFailure>> {
  if (job.input.kind === 'pdf') {
    return success(job.input.uri);
  }
  const pages = job.input.pages;
  if (!pages.every((page) => fileExists(page.uri))) {
    return failure({ kind: 'file_missing' });
  }
  const folder = new Directory(Paths.document, 'uploads');
  if (!folder.exists) {
    folder.create({ intermediates: true });
  }
  const output = new File(folder, `${job.id}.pdf`);
  try {
    await writePdf(pages, output.uri);
  } catch (error) {
    if (error instanceof PdfError && error.kind === 'page_missing') {
      return failure({ kind: 'file_missing' });
    }
    return failure({ kind: 'pdf_failed', message: describeError(error) });
  }
  return success(output.uri);
}

async function readFile(path: string): Promise<UploadFile | null> {
  return fileExists(path) ? { uri: path } : null;
}

async function removeFile(uri: string): Promise<void> {
  if (fileExists(uri)) {
    new File(uri).delete();
  }
}

let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function wake(at: number | null): void {
  if (wakeTimer !== null) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  if (at === null) {
    return;
  }
  const delay = Math.min(Math.max(at - Date.now(), 0), longestWaitMs);
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    runUploads();
  }, delay);
}

export function reportUploadError(error: unknown): void {
  console.warn('Uploads stopped on an error', error);
  wake(Date.now() + retryAfterErrorMs);
}

export const uploadQueue = createUploadQueue<UploadFile>({
  store,
  now: () => Date.now(),
  clientFor,
  readFile,
  buildPdf,
  removeFile,
  wake,
  onError: reportUploadError,
});

export function runUploads(): Promise<void> {
  return uploadQueue.run();
}

export function enqueueBatch(batch: Batch): Promise<void> {
  return uploadQueue.enqueue(batch);
}

export async function queuedJobIds(): Promise<ReadonlySet<JobId> | null> {
  try {
    return new Set((await store.loadAll()).map((job) => job.id));
  } catch (error) {
    reportUploadError(error);
    return null;
  }
}

export function connectUploadsToDevice(): () => void {
  const appState = AppState.addEventListener('change', (status) => {
    if (status === 'active') {
      runUploads();
    }
  });
  const removeNetInfoListener = NetInfo.addEventListener((state) => {
    if (state.isConnected === true) {
      runUploads();
    }
  });
  return () => {
    appState.remove();
    removeNetInfoListener();
  };
}

export function useUploadQueue(): QueueSnapshot {
  return useSyncExternalStore(uploadQueue.subscribe, uploadQueue.snapshot);
}
