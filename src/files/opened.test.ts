import { describe, expect, test } from 'vitest';

import { foldersToEvict, mimeTypeOf, openedFileName, openedFolderName } from './opened';

describe('openedFolderName', () => {
  test('is safe for a file system and changes with the modified time', () => {
    const first = openedFolderName('account-1', 2, '2026-10-16T08:00:00.123456-04:00');
    const second = openedFolderName('account-1', 2, '2026-10-17T08:00:00.123456-04:00');
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first).not.toBe(second);
    expect(openedFolderName('account-2', 2, '2026-10-16T08:00:00.123456-04:00')).not.toBe(first);
  });
});

describe('openedFileName', () => {
  test.each([
    ['Electricity bill, September', 'application/pdf', 'scan.pdf', 'Electricity bill, September.pdf'],
    ['Receipt', 'image/jpeg; charset=binary', null, 'Receipt.jpg'],
    ['Odd/name: "a"?', 'application/pdf', null, 'Odd name a.pdf'],
    ['   ', null, 'letter.TIFF', 'document.tiff'],
    ['Notes', 'application/octet-stream', null, 'Notes.pdf'],
  ])('%j as %j is %j', (title, contentType, original, expected) => {
    expect(openedFileName(title, contentType, original)).toBe(expected);
  });

  test('a long title fits in 255 bytes and is never cut inside a character', () => {
    const name = openedFileName('文書'.repeat(100) + '😀', 'application/pdf', null);
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
    expect(name.endsWith('.pdf')).toBe(true);
    expect(name).not.toContain('�');
    expect([...name.slice(0, -4)].every((character) => character === '文' || character === '書')).toBe(true);
  });
});

describe('foldersToEvict', () => {
  const folders = [
    { name: 'b', size: 50, savedAt: 2 },
    { name: 'a', size: 60, savedAt: 1 },
    { name: 'c', size: 40, savedAt: 3 },
  ];

  test('drops the oldest folders until the rest fit', () => {
    expect(foldersToEvict(folders, 100, 'c')).toEqual(['a']);
    expect(foldersToEvict(folders, 40, 'c')).toEqual(['a', 'b']);
  });

  test('never drops the folder just opened, even when it alone is over the limit', () => {
    expect(foldersToEvict(folders, 10, 'a')).toEqual(['b', 'c']);
  });

  test('drops nothing under the limit', () => {
    expect(foldersToEvict(folders, 150, 'c')).toEqual([]);
  });
});

test('mimeTypeOf reads the type back from the name openedFileName gave', () => {
  expect(mimeTypeOf(openedFileName('Bill', 'application/pdf', null))).toBe('application/pdf');
  expect(mimeTypeOf(openedFileName('Receipt', 'image/jpeg', null))).toBe('image/jpeg');
  expect(mimeTypeOf('notes.unknown')).toBe('application/octet-stream');
});
