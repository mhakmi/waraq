import { describe, expect, test } from 'vitest';

import { AccountId, BatchId, JobId, newUploadJob, type UploadJob, type UploadState } from './machine';
import { deleteJob, MemoryJobStore, type RunnerDeps, runStep, type UploadClient } from './runner';

const unreachable = async () => {
  throw new Error('the server must not be called');
};

const offlineClient: UploadClient<string> = {
  postDocument: unreachable,
  getTask: unreachable,
  findDocumentByOriginalFilename: unreachable,
  findConsumeTaskByFilename: unreachable,
};

function jobIn(state: UploadState, pdfPath: string | null): UploadJob {
  const job = newUploadJob({
    id: JobId.parse('0190a000-0000-7000-8000-000000000001'),
    accountId: AccountId.parse('account'),
    batchId: BatchId.parse('0190a000-0000-7000-8000-000000000002'),
    pageCount: 1,
    now: 0,
    fields: {
      title: 'Letter',
      created: null,
      correspondentId: null,
      documentTypeId: null,
      storagePathId: null,
      tagIds: [],
      archiveSerialNumber: null,
      customFields: [],
    },
  });
  return { ...job, pdfPath, state };
}

function depsAt(now: number, store: MemoryJobStore): RunnerDeps<string> {
  return {
    client: offlineClient,
    store,
    now: () => now,
    readFile: async () => null,
    buildPdf: unreachable,
  };
}

describe('runStep', () => {
  test('a PDF that is gone from disk fails the job without calling the server', async () => {
    const store = new MemoryJobStore();
    const job = jobIn({ kind: 'waiting', attempt: 0, notBefore: 0, maybeSent: false }, '/gone.pdf');

    const next = await runStep(job, depsAt(10, store));

    expect(next.state).toEqual({ kind: 'failed', reason: { kind: 'file_missing' } });
    expect(await store.loadAll()).toEqual([next]);
  });

  test('a step that is not due yet changes nothing', async () => {
    const store = new MemoryJobStore();
    const job = jobIn({ kind: 'waiting', attempt: 1, notBefore: 5000, maybeSent: false }, '/file.pdf');

    expect(await runStep(job, depsAt(4999, store))).toBe(job);
    expect(await store.loadAll()).toEqual([]);
  });
});

describe('deleteJob', () => {
  test('refuses a job that is being sent and keeps it stored', async () => {
    const store = new MemoryJobStore();
    const job = jobIn({ kind: 'sending', attempt: 0, startedAt: 0 }, '/file.pdf');
    await store.save(job);

    expect(await deleteJob(job, store)).toBe(false);
    expect(await store.loadAll()).toEqual([job]);
  });

  test('removes a finished job', async () => {
    const store = new MemoryJobStore();
    const job = jobIn({ kind: 'failed', reason: { kind: 'file_missing' } }, null);
    await store.save(job);

    expect(await deleteJob(job, store)).toBe(true);
    expect(await store.loadAll()).toEqual([]);
  });
});
