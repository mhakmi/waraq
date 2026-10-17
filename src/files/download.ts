import { fetch } from 'expo/fetch';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { describeError, errorForStatus, failure, type PaperlessError, type Result, success } from '../paperless/errors';
import type { FileRequest } from '../paperless/client';
import { foldersToEvict, mimeTypeOf, openedFileName, openedFilesLimitBytes, openedFolderName } from './opened';

const downloadTimeoutMs = 10 * 60_000;
const copyChunkBytes = 1024 * 1024;

export type DocumentToOpen = {
  accountId: string;
  id: number;
  modified: string;
  title: string;
  originalFileName: string | null;
  request: FileRequest;
};

function openedRoot(): Directory {
  const root = new Directory(Paths.cache, 'opened');
  if (!root.exists) {
    root.create({ intermediates: true });
  }
  return root;
}

function savedFile(folder: Directory): File | null {
  if (!folder.exists) {
    return null;
  }
  const file = folder.list().find((entry): entry is File => entry instanceof File && entry.name !== 'download.part');
  return file ?? null;
}

function evictOldFolders(root: Directory, keep: string): void {
  const folders = root.list().flatMap((entry) => {
    if (!(entry instanceof Directory)) {
      return [];
    }
    const file = savedFile(entry);
    return [{ name: entry.name, size: entry.size ?? 0, savedAt: file?.modificationTime ?? 0, folder: entry }];
  });
  const evict = new Set(foldersToEvict(folders, openedFilesLimitBytes, keep));
  for (const entry of folders) {
    if (evict.has(entry.name)) {
      entry.folder.delete();
    }
  }
}

async function streamBodyToFile(body: ReadableStream<Uint8Array>, target: File): Promise<void> {
  target.create({ overwrite: true });
  const handle = target.open(FileMode.WriteOnly);
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      await handle.writeBytes(value);
    }
  } finally {
    handle.close();
  }
}

export async function localCopy(document: DocumentToOpen): Promise<Result<File>> {
  const root = openedRoot();
  const folderName = openedFolderName(document.accountId, document.id, document.modified);
  const folder = new Directory(root, folderName);
  const saved = savedFile(folder);
  if (saved !== null) {
    return success(saved);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), downloadTimeoutMs);
  try {
    const response = await fetch(document.request.url, { headers: document.request.headers, signal: controller.signal });
    if (!response.ok || response.body === null) {
      return failure(errorForStatus(response.status, await response.text()));
    }
    if (!folder.exists) {
      folder.create();
    }
    const part = new File(folder, 'download.part');
    await streamBodyToFile(response.body, part);
    const name = openedFileName(document.title, response.headers.get('content-type'), document.originalFileName);
    part.rename(name);
    evictOldFolders(root, folderName);
    return success(new File(folder, name));
  } catch (error) {
    if (folder.exists) {
      folder.delete();
    }
    if (controller.signal.aborted) {
      return failure<PaperlessError>({ kind: 'timeout' });
    }
    return failure<PaperlessError>({ kind: 'network', message: describeError(error) });
  } finally {
    clearTimeout(timer);
  }
}

export async function copyToFolder(source: File, folder: Directory): Promise<void> {
  const target = folder.createFile(source.name, mimeTypeOf(source.name));
  const input = source.open(FileMode.ReadOnly);
  const output = target.open(FileMode.WriteOnly);
  try {
    for (;;) {
      const chunk = await input.readBytes(copyChunkBytes);
      if (chunk.length === 0) {
        return;
      }
      await output.writeBytes(chunk);
    }
  } finally {
    input.close();
    output.close();
  }
}
