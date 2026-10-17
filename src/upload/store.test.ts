import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { success } from '../paperless/errors';
import type { IsoDate, TaskId } from '../paperless/schemas';
import type { Database } from './database';
import { AccountId, BatchId, JobId, newUploadJob, type UploadJob, type UploadState } from './machine';
import { nodeDatabase } from './nodeDatabase';
import { deleteJob, runStep, type UploadClient } from './runner';
import { openJobStore } from './store';

let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'waraq-store-'));
  path = join(folder, 'uploads.db');
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function jobIn(state: UploadState): UploadJob {
  const job = newUploadJob({
    id: JobId.parse('0190a000-0000-7000-8000-000000000001'),
    accountId: AccountId.parse('account'),
    batchId: BatchId.parse('0190a000-0000-7000-8000-000000000002'),
    fields: {
      title: 'Lease renewal notice',
      created: '2026-03-01' as IsoDate,
      correspondentId: 4,
      documentTypeId: null,
      storagePathId: 2,
      tagIds: [1, 7],
      archiveSerialNumber: 120,
      customFields: [{ fieldId: 3, value: 'paid' }],
    },
    input: {
      kind: 'pages',
      pages: [
        { uri: 'file:///page-1.jpg', rotation: 0 },
        { uri: 'file:///page-2.jpg', rotation: 270 },
      ],
    },
    pageCount: 2,
    now: 100,
  });
  return { ...job, pdfPath: '/uploads/job.pdf', state };
}

const waiting: UploadState = { kind: 'waiting', attempt: 0, notBefore: 0, maybeSent: false };
const taskId = 'task-1' as TaskId;

async function insertRaw(database: Database, state: string, fields: string): Promise<void> {
  await database.run(
    `INSERT INTO upload_jobs
      (id, account_id, batch_id, fields, input, pdf_path, page_count, created_at, updated_at, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      '0190a000-0000-7000-8000-000000000009',
      'account',
      '0190a000-0000-7000-8000-000000000002',
      fields,
      '{"kind":"pdf","uri":"file:///shared.pdf","thumbnailUri":"file:///shared.jpg"}',
      null,
      1,
      50,
      60,
      state,
    ],
  );
}

describe('SqliteJobStore', () => {
  test('gives back every field of a stored job as it went in', async () => {
    const store = await openJobStore(nodeDatabase(path));
    const job = jobIn({ kind: 'processing', taskId, checks: 2, failedChecks: 1, nextCheckAt: 900, startedAt: 800 });

    await store.insert(job);

    expect(await store.loadAll()).toEqual([job]);
  });

  test('inserts a job once and keeps the first copy when the same id comes again', async () => {
    const store = await openJobStore(nodeDatabase(path));
    const job = jobIn(waiting);

    expect(await store.insert(job)).toBe(true);
    expect(await store.insert({ ...job, state: { kind: 'preparing' } })).toBe(false);
    expect(await store.loadAll()).toEqual([job]);
  });

  test('refuses a write from a copy that is no longer the stored one', async () => {
    const store = await openJobStore(nodeDatabase(path));
    const job = jobIn({ kind: 'preparing' });
    await store.insert(job);
    const moved = { ...job, updatedAt: job.updatedAt + 1, state: waiting };

    expect(await store.saveIfUnchanged(moved, job.updatedAt)).toBe(true);
    expect(await store.saveIfUnchanged({ ...job, pageCount: 9 }, job.updatedAt)).toBe(false);
    expect(await store.loadAll()).toEqual([moved]);
  });

  test('refuses a write for a row that is gone', async () => {
    const store = await openJobStore(nodeDatabase(path));
    const job = jobIn(waiting);

    expect(await store.saveIfUnchanged(job, job.updatedAt)).toBe(false);
    expect(await store.loadAll()).toEqual([]);
  });

  test('refuses a delete from a copy that is no longer the stored one', async () => {
    const store = await openJobStore(nodeDatabase(path));
    const job = jobIn(waiting);
    await store.insert(job);
    const moved = { ...job, updatedAt: job.updatedAt + 1 };
    await store.saveIfUnchanged(moved, job.updatedAt);

    expect(await store.deleteIfUnchanged(job.id, job.updatedAt)).toBe(false);
    expect(await store.loadAll()).toEqual([moved]);
    expect(await store.deleteIfUnchanged(job.id, moved.updatedAt)).toBe(true);
    expect(await store.loadAll()).toEqual([]);
  });

  test('two stores on one file that loaded the same job send it once', async () => {
    const first = await openJobStore(nodeDatabase(path));
    await first.insert(jobIn(waiting));
    const second = await openJobStore(nodeDatabase(path));
    const [firstCopy] = await first.loadAll();
    const [secondCopy] = await second.loadAll();
    let posts = 0;
    const client: UploadClient<string> = {
      postDocument: async () => {
        posts += 1;
        return success(taskId);
      },
      getTask: async () => {
        throw new Error('not called');
      },
      findDocumentByOriginalFilename: async () => {
        throw new Error('not called');
      },
      findConsumeTaskByFilename: async () => {
        throw new Error('not called');
      },
    };
    const depsFor = (store: typeof first) => ({
      client,
      store,
      now: () => 1000,
      readFile: async () => 'pdf bytes',
      buildPdf: async () => success('/unused.pdf'),
    });

    const results = await Promise.all([runStep(firstCopy, depsFor(first)), runStep(secondCopy, depsFor(second))]);

    expect(posts).toBe(1);
    const winners = results.filter((result) => result.state.kind === 'processing');
    expect(winners).toHaveLength(1);
    expect(await first.loadAll()).toEqual(winners);
  });

  test('shows a row whose state is not JSON as unreadable, keeps its fields, and lets it be deleted', async () => {
    const database = nodeDatabase(path);
    const store = await openJobStore(database);
    await insertRaw(database, '{"kind":"waiting",', JSON.stringify(jobIn(waiting).fields));

    const [job] = await store.loadAll();

    expect(job).toEqual({
      id: '0190a000-0000-7000-8000-000000000009',
      accountId: 'account',
      batchId: '0190a000-0000-7000-8000-000000000002',
      fields: jobIn(waiting).fields,
      input: { kind: 'pdf', uri: 'file:///shared.pdf', thumbnailUri: 'file:///shared.jpg' },
      pdfPath: null,
      pageCount: 1,
      createdAt: 50,
      updatedAt: 60,
      state: { kind: 'failed', reason: { kind: 'unreadable', message: expect.stringContaining('state') } },
    });
    expect(await deleteJob(job, store)).toBe(true);
    expect(await store.loadAll()).toEqual([]);
  });

  test('shows a row with a state kind it does not know as unreadable with empty fields', async () => {
    const database = nodeDatabase(path);
    const store = await openJobStore(database);
    await insertRaw(database, '{"kind":"paused"}', 'not json');

    const [job] = await store.loadAll();

    expect(job.state).toEqual({ kind: 'failed', reason: { kind: 'unreadable', message: expect.any(String) } });
    expect(job.fields.title).toBe('');
  });

  test('a processing row whose fields column cannot be read is unreadable, because it may still send', async () => {
    const database = nodeDatabase(path);
    const store = await openJobStore(database);
    const processing: UploadState = { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: 0, startedAt: 0 };
    await insertRaw(database, JSON.stringify(processing), 'not json');

    const [job] = await store.loadAll();

    expect(job.state.kind).toBe('failed');
  });

  test('a done row keeps its state when its fields column cannot be read, because done never reads the fields', async () => {
    const database = nodeDatabase(path);
    const store = await openJobStore(database);
    await insertRaw(database, '{"kind":"done","documentId":42}', 'not json');

    const [job] = await store.loadAll();

    expect(job.state).toEqual({ kind: 'done', documentId: 42 });
    expect(job.fields.title).toBe('');
  });

  test('a waiting row whose fields column cannot be read is unreadable, because the send needs the fields', async () => {
    const database = nodeDatabase(path);
    const store = await openJobStore(database);
    await insertRaw(database, JSON.stringify(waiting), 'not json');

    const [job] = await store.loadAll();

    expect(job.state).toEqual({ kind: 'failed', reason: { kind: 'unreadable', message: expect.stringContaining('fields') } });
  });
});
