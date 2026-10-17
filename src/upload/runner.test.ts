import { describe, expect, test } from 'vitest';

import { failure, success } from '../paperless/errors';
import type { DocumentId, TaskId } from '../paperless/schemas';
import {
  AccountId,
  BatchId,
  JobId,
  newUploadJob,
  sentGraceWindow,
  type UploadJob,
  type UploadState,
} from './machine';
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

function depsAt(now: number, store: MemoryJobStore, client: UploadClient<string> = offlineClient): RunnerDeps<string> {
  return {
    client,
    store,
    now: () => now,
    readFile: async () => null,
    buildPdf: unreachable,
  };
}

const taskId = 'task-1' as TaskId;
const documentId = 42 as DocumentId;
const now = 1_000_000;
const unauthorized = failure({ kind: 'unauthorized' } as const);

describe('reconcile', () => {
  const startedAt = now - 1000;
  const unsure = jobIn({ kind: 'waiting', attempt: 1, notBefore: 0, maybeSent: true, startedAt }, '/file.pdf');

  async function reconcileWith(client: Partial<UploadClient<string>>, job = unsure) {
    const next = await runStep(job, depsAt(now, new MemoryJobStore(), { ...offlineClient, ...client }));
    return next.state;
  }

  test('follows a task that carries the file name, whatever its status', async () => {
    const state = await reconcileWith({ findConsumeTaskByFilename: async () => success(taskId) });
    expect(state).toEqual({ kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: now, startedAt: now });
  });

  test('finishes on a document with the file name when no task has it', async () => {
    const state = await reconcileWith({
      findConsumeTaskByFilename: async () => success(null),
      findDocumentByOriginalFilename: async () => success(documentId),
    });
    expect(state).toEqual({ kind: 'done', documentId });
  });

  test('looks again soon when nothing is found inside the grace window', async () => {
    const state = await reconcileWith({
      findConsumeTaskByFilename: async () => success(null),
      findDocumentByOriginalFilename: async () => success(null),
    });
    expect(state).toEqual({ kind: 'waiting', attempt: 1, notBefore: now + 30_000, maybeSent: true, startedAt });
  });

  test('sends again when nothing is found after the grace window', async () => {
    const longAgo = jobIn(
      { kind: 'waiting', attempt: 1, notBefore: 0, maybeSent: true, startedAt: now - sentGraceWindow },
      '/file.pdf',
    );
    const state = await reconcileWith(
      {
        findConsumeTaskByFilename: async () => success(null),
        findDocumentByOriginalFilename: async () => success(null),
      },
      longAgo,
    );
    expect(state).toEqual({ kind: 'waiting', attempt: 1, notBefore: now, maybeSent: false });
  });

  test('stays unsure and backs off when the server cannot be reached', async () => {
    const state = await reconcileWith({
      findConsumeTaskByFilename: async () => failure({ kind: 'timeout' }),
    });
    expect(state).toEqual({ kind: 'waiting', attempt: 2, notBefore: now + 10_000, maybeSent: true, startedAt });
  });

  test('stops at sign-in and resumes the lookup, not the send, after a 401', async () => {
    const state = await reconcileWith({ findConsumeTaskByFilename: async () => unauthorized });
    expect(state).toEqual({
      kind: 'failed',
      reason: { kind: 'sign_in_required', resume: { step: 'reconcile', startedAt } },
    });
  });

  test('reports a missing permission after a 403 on the document lookup', async () => {
    const state = await reconcileWith({
      findConsumeTaskByFilename: async () => success(null),
      findDocumentByOriginalFilename: async () => failure({ kind: 'forbidden' }),
    });
    expect(state).toEqual({
      kind: 'failed',
      reason: { kind: 'not_permitted', resume: { step: 'reconcile', startedAt } },
    });
  });
});

describe('check', () => {
  const startedAt = now - 1000;
  const processing = jobIn(
    { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: 0, startedAt },
    '/file.pdf',
  );

  test('stops at sign-in and resumes the check with its task id after a 401', async () => {
    const deps = depsAt(now, new MemoryJobStore(), { ...offlineClient, getTask: async () => unauthorized });
    const next = await runStep(processing, deps);
    expect(next.state).toEqual({
      kind: 'failed',
      reason: { kind: 'sign_in_required', resume: { step: 'check', taskId, startedAt } },
    });
  });
});

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
