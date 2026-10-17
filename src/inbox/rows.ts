import type { Correspondent, DocumentSummary, Tag } from '../paperless/schemas';

export type InboxGroup = 'today' | 'week' | 'earlier';

export type InboxRow = {
  document: DocumentSummary;
  correspondent: string | null;
  tags: { id: number; name: string; isInboxTag: boolean }[];
};

export type InboxSection = { group: InboxGroup; data: InboxRow[] };

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

export function inboxSections(
  documents: DocumentSummary[],
  tags: Tag[],
  correspondents: Correspondent[],
  now: Date,
): InboxSection[] {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const namesById = new Map(correspondents.map((correspondent) => [correspondent.id, correspondent.name]));
  const sections = groups.map((group): InboxSection => ({ group, data: [] }));
  for (const document of documents) {
    const row: InboxRow = {
      document,
      correspondent: document.correspondentId === null ? null : namesById.get(document.correspondentId) ?? null,
      tags: document.tagIds.flatMap((id) => {
        const tag = tagsById.get(id);
        return tag ? [{ id, name: tag.name, isInboxTag: tag.isInboxTag }] : [];
      }),
    };
    const group = groupFor(new Date(document.added), now);
    sections[groups.indexOf(group)].data.push(row);
  }
  return sections.filter((section) => section.data.length > 0);
}
