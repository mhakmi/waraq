import { z } from 'zod';

import { CustomFieldValue, IsoDate } from '../paperless/schemas';
import { AccountId, BatchId, JobId } from '../upload/machine';
import { type Batch, PageId } from './batch';

const Metadata = z.object({
  title: z.string().optional(),
  created: IsoDate.optional(),
  correspondentId: z.number().int().nullable().optional(),
  documentTypeId: z.number().int().nullable().optional(),
  storagePathId: z.number().int().nullable().optional(),
  tagIds: z.array(z.number().int()).optional(),
  archiveSerialNumber: z.number().int().nullable().optional(),
  customFields: z.array(CustomFieldValue).optional(),
});

const Page = z.object({
  id: PageId,
  uri: z.string(),
  width: z.number(),
  height: z.number(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});

const Document = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pages'), id: JobId, pages: z.array(Page), metadata: Metadata }),
  z.object({
    kind: z.literal('pdf'),
    id: JobId,
    pdf: z.object({ uri: z.string(), name: z.string(), pageCount: z.number().int(), thumbnailUri: z.string() }),
    metadata: Metadata,
  }),
]);

const StoredBatch = z.object({
  id: BatchId,
  accountId: AccountId,
  createdAt: z.number(),
  shared: Metadata,
  documents: z.array(Document),
});

export function parseStoredBatch(text: string | null): Batch | null {
  if (text === null) {
    return null;
  }
  try {
    const parsed = StoredBatch.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
