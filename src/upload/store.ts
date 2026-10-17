import { z } from 'zod';

import type { UploadFields } from '../paperless/client';
import { CustomFieldValue, DocumentId, IsoDate, TaskId } from '../paperless/schemas';
import type { Database, SqlValue } from './database';
import {
  AccountId,
  BatchId,
  type FailureReason,
  JobId,
  type JobInput,
  type ResumePoint,
  type UploadJob,
  type UploadState,
} from './machine';
import type { JobStore } from './runner';

const resumePointByStep = {
  send: z.object({ step: z.literal('send') }),
  reconcile: z.object({ step: z.literal('reconcile'), unsureSince: z.number() }),
  check: z.object({ step: z.literal('check'), taskId: TaskId, startedAt: z.number() }),
} satisfies Record<ResumePoint['step'], z.ZodType>;

const resumePointSchema: z.ZodType<ResumePoint> = z.union(Object.values(resumePointByStep));

const failureReasonByKind = {
  sign_in_required: z.object({ kind: z.literal('sign_in_required'), resume: resumePointSchema }),
  not_permitted: z.object({ kind: z.literal('not_permitted'), resume: resumePointSchema }),
  rejected: z.object({ kind: z.literal('rejected'), status: z.number().int(), message: z.string() }),
  consumption_failed: z.object({ kind: z.literal('consumption_failed'), message: z.string() }),
  file_missing: z.object({ kind: z.literal('file_missing') }),
  pdf_failed: z.object({ kind: z.literal('pdf_failed'), message: z.string() }),
  unreadable: z.object({ kind: z.literal('unreadable'), message: z.string() }),
} satisfies Record<FailureReason['kind'], z.ZodType>;

const failureReasonSchema: z.ZodType<FailureReason> = z.union(Object.values(failureReasonByKind));

const stateByKind = {
  preparing: z.object({ kind: z.literal('preparing') }),
  waiting: z.union([
    z.object({
      kind: z.literal('waiting'),
      attempt: z.number().int(),
      notBefore: z.number(),
      maybeSent: z.literal(false),
    }),
    z.object({
      kind: z.literal('waiting'),
      attempt: z.number().int(),
      notBefore: z.number(),
      maybeSent: z.literal(true),
      unsureSince: z.number(),
    }),
  ]),
  sending: z.object({ kind: z.literal('sending'), attempt: z.number().int(), startedAt: z.number() }),
  processing: z.object({
    kind: z.literal('processing'),
    taskId: TaskId,
    checks: z.number().int(),
    failedChecks: z.number().int(),
    nextCheckAt: z.number(),
    startedAt: z.number(),
  }),
  done: z.object({ kind: z.literal('done'), documentId: DocumentId }),
  failed: z.object({ kind: z.literal('failed'), reason: failureReasonSchema }),
} satisfies Record<UploadState['kind'], z.ZodType>;

const stateSchema: z.ZodType<UploadState> = z.union(Object.values(stateByKind));

const inputByKind = {
  pages: z.object({
    kind: z.literal('pages'),
    pages: z.array(z.object({ uri: z.string(), rotation: z.literal([0, 90, 180, 270]) })),
  }),
  pdf: z.object({ kind: z.literal('pdf'), uri: z.string(), thumbnailUri: z.string() }),
} satisfies Record<JobInput['kind'], z.ZodType>;

const inputSchema: z.ZodType<JobInput> = z.union(Object.values(inputByKind));

const fieldsSchema: z.ZodType<UploadFields> = z.object({
  title: z.string(),
  created: IsoDate.nullable(),
  correspondentId: z.number().int().nullable(),
  documentTypeId: z.number().int().nullable(),
  storagePathId: z.number().int().nullable(),
  tagIds: z.array(z.number().int()),
  archiveSerialNumber: z.number().int().nullable(),
  customFields: z.array(CustomFieldValue),
});

const jobSchema: z.ZodType<UploadJob> = z.object({
  id: JobId,
  accountId: AccountId,
  batchId: BatchId,
  fields: fieldsSchema,
  input: inputSchema,
  pdfPath: z.string().nullable(),
  pageCount: z.number().int(),
  createdAt: z.number(),
  updatedAt: z.number(),
  state: stateSchema,
});

type StoredRow = {
  id: string;
  account_id: string;
  batch_id: string;
  fields: string;
  input: string;
  pdf_path: string | null;
  page_count: number;
  created_at: number;
  updated_at: number;
  state: string;
};

const createTable = `
  CREATE TABLE IF NOT EXISTS upload_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    fields TEXT NOT NULL,
    input TEXT NOT NULL,
    pdf_path TEXT,
    page_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    state TEXT NOT NULL
  )`;

const noFields: UploadFields = {
  title: '',
  created: null,
  correspondentId: null,
  documentTypeId: null,
  storagePathId: null,
  tagIds: [],
  archiveSerialNumber: null,
  customFields: [],
};

const noInput: JobInput = { kind: 'pages', pages: [] };

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function jobFromRow(row: StoredRow): UploadJob {
  const fields = readJson(row.fields);
  const input = readJson(row.input);
  const parsed = jobSchema.safeParse({
    id: row.id,
    accountId: row.account_id,
    batchId: row.batch_id,
    fields,
    input,
    pdfPath: row.pdf_path,
    pageCount: row.page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: readJson(row.state),
  });
  return parsed.success ? parsed.data : unreadableJob(row, z.prettifyError(parsed.error));
}

function unreadableJob(row: StoredRow, message: string): UploadJob {
  const fields = fieldsSchema.safeParse(readJson(row.fields));
  const input = inputSchema.safeParse(readJson(row.input));
  return {
    id: row.id as JobId,
    accountId: row.account_id as AccountId,
    batchId: row.batch_id as BatchId,
    fields: fields.success ? fields.data : noFields,
    input: input.success ? input.data : noInput,
    pdfPath: row.pdf_path,
    pageCount: row.page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: { kind: 'failed', reason: { kind: 'unreadable', message } },
  };
}

function valuesAfterId(job: UploadJob): SqlValue[] {
  return [
    job.accountId,
    job.batchId,
    JSON.stringify(job.fields),
    JSON.stringify(job.input),
    job.pdfPath,
    job.pageCount,
    job.createdAt,
    job.updatedAt,
    JSON.stringify(job.state),
  ];
}

export async function openJobStore(database: Database): Promise<SqliteJobStore> {
  await database.exec(createTable);
  return new SqliteJobStore(database);
}

export class SqliteJobStore implements JobStore {
  constructor(private readonly database: Database) {}

  async loadAll(): Promise<UploadJob[]> {
    const rows = await this.database.all<StoredRow>('SELECT * FROM upload_jobs ORDER BY created_at, id', []);
    return rows.map(jobFromRow);
  }

  async insert(job: UploadJob): Promise<boolean> {
    const result = await this.database.run(
      `INSERT OR IGNORE INTO upload_jobs
        (id, account_id, batch_id, fields, input, pdf_path, page_count, created_at, updated_at, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.id, ...valuesAfterId(job)],
    );
    return result.changes === 1;
  }

  async saveIfUnchanged(job: UploadJob, loadedUpdatedAt: number): Promise<boolean> {
    const result = await this.database.run(
      `UPDATE upload_jobs
        SET account_id = ?, batch_id = ?, fields = ?, input = ?, pdf_path = ?,
          page_count = ?, created_at = ?, updated_at = ?, state = ?
        WHERE id = ? AND updated_at = ?`,
      [...valuesAfterId(job), job.id, loadedUpdatedAt],
    );
    return result.changes === 1;
  }

  async deleteIfUnchanged(id: JobId, loadedUpdatedAt: number): Promise<boolean> {
    const result = await this.database.run('DELETE FROM upload_jobs WHERE id = ? AND updated_at = ?', [
      id,
      loadedUpdatedAt,
    ]);
    return result.changes === 1;
  }
}
