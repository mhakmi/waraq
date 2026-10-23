import type { ReadableList } from '../labels';
import type { Correspondent, DocumentSummary, Tag } from '../paperless/schemas';

export type InboxGroup = 'today' | 'week' | 'earlier';

export type RowCorrespondent = { kind: 'named'; name: string } | { kind: 'none' } | { kind: 'unknown' };

export type ListRow = {
  document: DocumentSummary;
  correspondent: RowCorrespondent;
  tags: { id: number; name: string; isInboxTag: boolean }[];
};

export type InboxSection = { group: InboxGroup; data: ListRow[] };

const groups: InboxGroup[] = ['today', 'week', 'earlier'];
const dayMs = 24 * 60 * 60 * 1000;

function localDayStart(time: Date): number {
  return new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
}

export function groupFor(added: Date, now: Date): InboxGroup {
  const days = Math.round((localDayStart(now) - localDayStart(added)) / dayMs);
  if (days < 1) {
    return 'today';
  }
  if (days < 7) {
    return 'week';
  }
  return 'earlier';
}

export function inboxTagIds(tags: Tag[]): number[] {
  return tags.filter((tag) => tag.isInboxTag).map((tag) => tag.id);
}

function rowCorrespondent(id: number | null, namesById: Map<number, string> | null): RowCorrespondent {
  if (namesById === null) {
    return { kind: 'unknown' };
  }
  if (id === null) {
    return { kind: 'none' };
  }
  const name = namesById.get(id);
  return name === undefined ? { kind: 'unknown' } : { kind: 'named', name };
}

export function listRows(documents: DocumentSummary[], tags: Tag[], correspondents: ReadableList<Correspondent>): ListRow[] {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const namesById = correspondents.readable
    ? new Map(correspondents.items.map((correspondent) => [correspondent.id, correspondent.name]))
    : null;
  return documents.map((document) => ({
    document,
    correspondent: rowCorrespondent(document.correspondentId, namesById),
    tags: document.tagIds.flatMap((id) => {
      const tag = tagsById.get(id);
      return tag ? [{ id, name: tag.name, isInboxTag: tag.isInboxTag }] : [];
    }),
  }));
}

export function inboxSections(
  documents: DocumentSummary[],
  tags: Tag[],
  correspondents: ReadableList<Correspondent>,
  now: Date,
): InboxSection[] {
  const sections = groups.map((group): InboxSection => ({ group, data: [] }));
  for (const row of listRows(documents, tags, correspondents)) {
    const group = groupFor(new Date(row.document.added), now);
    sections[groups.indexOf(group)].data.push(row);
  }
  return sections.filter((section) => section.data.length > 0);
}
