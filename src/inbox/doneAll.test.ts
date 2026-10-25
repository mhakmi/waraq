import { describe, expect, test } from 'vitest';

import { failure, success } from '../paperless/errors';
import type { DocumentId } from '../paperless/schemas';
import { type ChangeTags, documentsIn, loadDocumentsByInboxTag, onlyFinished, removeInboxTags, restoreInboxTags } from './doneAll';

const id = (value: number) => value as DocumentId;

function fakeServer(tagsById: Record<number, number[]>, failOnCall: number | null = null) {
  const calls: DocumentId[][] = [];
  const changeTags: ChangeTags = async (ids, changes) => {
    calls.push(ids);
    if (calls.length === failOnCall) {
      return failure({ kind: 'timeout' });
    }
    for (const documentId of ids) {
      const kept = tagsById[documentId].filter((tag) => !changes.remove.includes(tag));
      tagsById[documentId] = [...kept, ...changes.add.filter((tag) => !kept.includes(tag))];
    }
    return success({ result: 'OK' });
  };
  return { tagsById, calls, changeTags };
}

function idsWithTag(tagsById: Record<number, number[]>, tag: number): DocumentId[] {
  return Object.keys(tagsById)
    .map(Number)
    .filter((documentId) => tagsById[documentId].includes(tag))
    .map(id);
}

describe('marking the whole inbox done', () => {
  test('removes every inbox tag, keeps other tags, and undo gives back only the inbox tags each document had', async () => {
    const server = fakeServer({ 1: [10, 99], 2: [10, 11], 3: [11] });
    const loaded = await loadDocumentsByInboxTag(async (tag) => success(idsWithTag(server.tagsById, tag)), [10, 11]);
    if (!loaded.ok) {
      throw new Error('load failed');
    }
    expect(documentsIn(loaded.value)).toEqual([1, 2, 3]);

    const outcome = await removeInboxTags(server.changeTags, loaded.value, () => {});
    expect(outcome).toEqual({ finished: [1, 2, 3], error: null });
    expect(server.tagsById).toEqual({ 1: [99], 2: [], 3: [] });

    await restoreInboxTags(server.changeTags, loaded.value);
    expect(server.tagsById).toEqual({ 1: [99, 10], 2: [10, 11], 3: [11] });
  });

  test('sends at most 100 documents a request and reports progress after each', async () => {
    const tagsById: Record<number, number[]> = {};
    for (let documentId = 1; documentId <= 250; documentId += 1) {
      tagsById[documentId] = [10];
    }
    const server = fakeServer(tagsById);
    const progress: string[] = [];
    await removeInboxTags(server.changeTags, [{ tagId: 10, documentIds: idsWithTag(tagsById, 10) }], (finished, total) =>
      progress.push(`${finished}/${total}`),
    );
    expect(server.calls.map((call) => call.length)).toEqual([100, 100, 50]);
    expect(progress).toEqual(['100/250', '200/250', '250/250']);
  });

  test('a failed request stops the run, and undo covers only the documents already changed', async () => {
    const tagsById: Record<number, number[]> = {};
    for (let documentId = 1; documentId <= 150; documentId += 1) {
      tagsById[documentId] = [10];
    }
    const server = fakeServer(tagsById, 2);
    const members = [{ tagId: 10, documentIds: idsWithTag(tagsById, 10) }];
    const outcome = await removeInboxTags(server.changeTags, members, () => {});
    expect(outcome.error).toEqual({ kind: 'timeout' });
    expect(outcome.finished).toHaveLength(100);
    expect(idsWithTag(server.tagsById, 10)).toHaveLength(50);

    const undo = onlyFinished(members, outcome.finished);
    expect(documentsIn(undo)).toHaveLength(100);
    expect(onlyFinished(members, [])).toEqual([]);
  });

  test('a failed id listing is returned as is', async () => {
    const result = await loadDocumentsByInboxTag(async () => failure({ kind: 'forbidden' }), [10]);
    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });
});
