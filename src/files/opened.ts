export const openedFilesLimitBytes = 200 * 1024 * 1024;
const longestFileNameBytes = 255;

const extensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
  'text/plain': 'txt',
};

export function mimeTypeOf(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const found = Object.entries(extensions).find(([, known]) => known === extension);
  return found?.[0] ?? 'application/octet-stream';
}

export function openedFolderName(accountId: string, id: number, modified: string): string {
  return `${accountId}-${id}-${modified}`.replace(/[^A-Za-z0-9-]/g, '_');
}

function utf8Length(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint < 0x80) {
    return 1;
  }
  if (codePoint < 0x800) {
    return 2;
  }
  return codePoint < 0x10000 ? 3 : 4;
}

function cutToBytes(text: string, limit: number): string {
  let result = '';
  let bytes = 0;
  for (const character of text) {
    bytes += utf8Length(character);
    if (bytes > limit) {
      break;
    }
    result += character;
  }
  return result;
}

export function openedFileName(title: string, contentType: string | null, originalFileName: string | null): string {
  const mimeType = contentType?.split(';')[0].trim().toLowerCase() ?? '';
  const fromOriginal = originalFileName?.match(/\.([A-Za-z0-9]{1,5})$/)?.[1].toLowerCase();
  const extension = extensions[mimeType] ?? fromOriginal ?? 'pdf';
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = cutToBytes(cleaned, longestFileNameBytes - extension.length - 1).trim() || 'document';
  return `${base}.${extension}`;
}

export type OpenedFolder = { name: string; size: number; savedAt: number };

export function foldersToEvict(folders: OpenedFolder[], limitBytes: number, keep: string): string[] {
  let total = folders.reduce((sum, folder) => sum + folder.size, 0);
  const evict: string[] = [];
  const oldestFirst = [...folders].sort((first, second) => first.savedAt - second.savedAt);
  for (const folder of oldestFirst) {
    if (total <= limitBytes) {
      break;
    }
    if (folder.name === keep) {
      continue;
    }
    evict.push(folder.name);
    total -= folder.size;
  }
  return evict;
}
