import { type PaperlessError, type Result, success } from '../paperless/errors';
import type { DocumentId } from '../paperless/schemas';

export type DocumentsByInboxTag = { tagId: number; documentIds: DocumentId[] }[];

export type ListIds = (tagId: number) => Promise<Result<DocumentId[]>>;
export type ChangeTags = (ids: DocumentId[], changes: { add: number[]; remove: number[] }) => Promise<Result<unknown>>;

export type DoneOutcome = { finished: DocumentId[]; error: PaperlessError | null };

const batchSize = 100;

export async function loadDocumentsByInboxTag(listIds: ListIds, tagIds: number[]): Promise<Result<DocumentsByInboxTag>> {
  const members: DocumentsByInboxTag = [];
  for (const tagId of tagIds) {
    const result = await listIds(tagId);
    if (!result.ok) {
      return result;
    }
    members.push({ tagId, documentIds: result.value });
  }
  return success(members);
}

export function documentsIn(members: DocumentsByInboxTag): DocumentId[] {
  return [...new Set(members.flatMap((member) => member.documentIds))];
}

export function onlyFinished(members: DocumentsByInboxTag, finished: DocumentId[]): DocumentsByInboxTag {
  const done = new Set(finished);
  return members
    .map((member) => ({ tagId: member.tagId, documentIds: member.documentIds.filter((id) => done.has(id)) }))
    .filter((member) => member.documentIds.length > 0);
}

function batches(ids: DocumentId[]): DocumentId[][] {
  const result: DocumentId[][] = [];
  for (let start = 0; start < ids.length; start += batchSize) {
    result.push(ids.slice(start, start + batchSize));
  }
  return result;
}

export async function removeInboxTags(
  changeTags: ChangeTags,
  members: DocumentsByInboxTag,
  onProgress: (finished: number, total: number) => void,
): Promise<DoneOutcome> {
  const ids = documentsIn(members);
  const inboxTagIds = members.map((member) => member.tagId);
  const finished: DocumentId[] = [];
  for (const batch of batches(ids)) {
    const result = await changeTags(batch, { add: [], remove: inboxTagIds });
    if (!result.ok) {
      return { finished, error: result.error };
    }
    finished.push(...batch);
    onProgress(finished.length, ids.length);
  }
  return { finished, error: null };
}

export async function restoreInboxTags(changeTags: ChangeTags, members: DocumentsByInboxTag): Promise<Result<null>> {
  for (const member of members) {
    for (const batch of batches(member.documentIds)) {
      const result = await changeTags(batch, { add: [member.tagId], remove: [] });
      if (!result.ok) {
        return result;
      }
    }
  }
  return success(null);
}
