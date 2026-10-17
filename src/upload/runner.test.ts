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
import {
  deleteJob,
  MemoryJobStore,
  type PdfBuildFailure,
  recoverAfterRestart,
  type RunnerDeps,
  runStep,
  type UploadClient,
} from './runner';

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
    input: { kind: 'pages', pages: [{ uri: 'file:///page-1.jpg', rotation: 0 }] },
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

async function storing(job: UploadJob): Promise<MemoryJobStore> {
  const store = new MemoryJobStore();
  await store.insert(job);
  return store;
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
  const unsureSince = now - 1000;
  const unsure = jobIn({ kind: 'waiting', attempt: 1, notBefore: 0, maybeSent: true, unsureSince }, '/file.pdf');

  async function reconcileWith(client: Partial<UploadClient<string>>, job = unsure) {
    const next = await runStep(job, depsAt(now, await storing(job), { ...offlineClient, ...client }));
    return next.state;
  }

  test('follows a task that carries the file name, whatever its status', async () => {
    const state = await reconcileWith({ findConsumeTaskByFilename: async () => success(taskId) });
    expect(state).toEqual({ kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: now, startedAt: unsureSince });
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
    expect(state).toEqual({ kind: 'waiting', attempt: 1, notBefore: now + 30_000, maybeSent: true, unsureSince });
  });

  test('sends again after a backoff when nothing is found after the grace window', async () => {
    const longAgo = jobIn(
      { kind: 'waiting', attempt: 1, notBefore: 0, maybeSent: true, unsureSince: now - sentGraceWindow },
      '/file.pdf',
    );
    const state = await reconcileWith(
      {
        findConsumeTaskByFilename: async () => success(null),
        findDocumentByOriginalFilename: async () => success(null),
      },
      longAgo,
    );
    expect(state).toEqual({ kind: 'waiting', attempt: 1, notBefore: now + 10_000, maybeSent: false });
  });

  test('stays unsure and backs off when the server cannot be reached', async () => {
    const state = await reconcileWith({
      findConsumeTaskByFilename: async () => failure({ kind: 'timeout' }),
    });
    expect(state).toEqual({ kind: 'waiting', attempt: 2, notBefore: now + 10_000, maybeSent: true, unsureSince });
  });

  test('stops at sign-in and resumes the lookup, not the send, after a 401', async () => {
    const state = await reconcileWith({ findConsumeTaskByFilename: async () => unauthorized });
    expect(state).toEqual({
      kind: 'failed',
      reason: { kind: 'sign_in_required', resume: { step: 'reconcile', unsureSince } },
    });
  });

  test('reports a missing permission after a 403 on the document lookup', async () => {
    const state = await reconcileWith({
      findConsumeTaskByFilename: async () => success(null),
      findDocumentByOriginalFilename: async () => failure({ kind: 'forbidden' }),
    });
    expect(state).toEqual({
      kind: 'failed',
      reason: { kind: 'not_permitted', resume: { step: 'reconcile', unsureSince } },
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
    const deps = depsAt(now, await storing(processing), { ...offlineClient, getTask: async () => unauthorized });
    const next = await runStep(processing, deps);
    expect(next.state).toEqual({
      kind: 'failed',
      reason: { kind: 'sign_in_required', resume: { step: 'check', taskId, startedAt } },
    });
  });
});

describe('prepare', () => {
  test('a document that arrives as a PDF skips the build and is sent as it is', async () => {
    const job: UploadJob = { ...jobIn({ kind: 'preparing' }, null), input: { kind: 'pdf', uri: 'file:///shared.pdf' } };
    const store = await storing(job);

    const next = await runStep(job, depsAt(now, store));

    expect(next.pdfPath).toBe('file:///shared.pdf');
    expect(next.state).toEqual({ kind: 'waiting', attempt: 0, notBefore: now, maybeSent: false });
    expect(await store.loadAll()).toEqual([next]);
  });

  test.each<[PdfBuildFailure, UploadState]>([
    [{ kind: 'file_missing' }, { kind: 'failed', reason: { kind: 'file_missing' } }],
    [{ kind: 'pdf_failed', message: 'out of space' }, { kind: 'failed', reason: { kind: 'pdf_failed', message: 'out of space' } }],
  ])('a build that fails with %o leaves the job %o', async (buildFailure, expected) => {
    const job = jobIn({ kind: 'preparing' }, null);
    const store = await storing(job);
    const deps = { ...depsAt(now, store), buildPdf: async () => failure(buildFailure) };

    const next = await runStep(job, deps);

    expect(next.state).toEqual(expected);
    expect(await store.loadAll()).toEqual([next]);
  });
});

describe('MemoryJobStore', () => {
  test('refuses to insert a job whose id is already stored and keeps the stored one', async () => {
    const job = jobIn({ kind: 'sending', attempt: 0, startedAt: 0 }, '/file.pdf');
    const store = new MemoryJobStore();

    expect(await store.insert(job)).toBe(true);
    expect(await store.insert({ ...job, state: { kind: 'preparing' } })).toBe(false);
    expect(await store.loadAll()).toEqual([job]);
  });

  test('refuses a write from a copy that is no longer the stored one', async () => {
    const job = jobIn({ kind: 'preparing' }, null);
    const store = await storing(job);
    const moved = { ...job, updatedAt: job.updatedAt + 1 };

    expect(await store.saveIfUnchanged(moved, job.updatedAt)).toBe(true);
    expect(await store.saveIfUnchanged({ ...job, pageCount: 2 }, job.updatedAt)).toBe(false);
    expect(await store.loadAll()).toEqual([moved]);
  });

  test('refuses a write for a row that is gone', async () => {
    const store = new MemoryJobStore();
    const job = jobIn({ kind: 'preparing' }, null);

    expect(await store.saveIfUnchanged(job, job.updatedAt)).toBe(false);
    expect(await store.loadAll()).toEqual([]);
  });

  test('refuses a delete from a copy that is no longer the stored one', async () => {
    const job = jobIn({ kind: 'preparing' }, null);
    const store = await storing(job);
    const moved = { ...job, updatedAt: job.updatedAt + 1 };
    await store.saveIfUnchanged(moved, job.updatedAt);

    expect(await store.deleteIfUnchanged(job.id, job.updatedAt)).toBe(false);
    expect(await store.loadAll()).toEqual([moved]);
    expect(await store.deleteIfUnchanged(job.id, moved.updatedAt)).toBe(true);
    expect(await store.loadAll()).toEqual([]);
  });
});

describe('runStep', () => {
  test('two runners that loaded the same job send it once', async () => {
    const job = jobIn({ kind: 'waiting', attempt: 0, notBefore: 0, maybeSent: false }, '/file.pdf');
    const store = await storing(job);
    let posts = 0;
    const counting: UploadClient<string> = {
      ...offlineClient,
      postDocument: async () => {
        posts += 1;
        return success(taskId);
      },
    };
    const deps = { ...depsAt(job.updatedAt, store, counting), readFile: async () => 'pdf bytes' };

    const results = await Promise.all([runStep(job, deps), runStep(job, deps)]);

    expect(posts).toBe(1);
    expect(results.map((result) => result.state.kind).sort()).toEqual(['processing', 'waiting']);
    expect(await store.loadAll()).toEqual(results.filter((result) => result.state.kind === 'processing'));
  });

  test('a job the user deleted after it was loaded is not sent and does not come back', async () => {
    const job = jobIn({ kind: 'waiting', attempt: 0, notBefore: 0, maybeSent: false }, '/file.pdf');
    const store = await storing(job);
    let posts = 0;
    const counting: UploadClient<string> = {
      ...offlineClient,
      postDocument: async () => {
        posts += 1;
        return success(taskId);
      },
    };
    const deps = { ...depsAt(job.updatedAt, store, counting), readFile: async () => 'pdf bytes' };

    expect(await deleteJob(job, store)).toBe(true);
    const next = await runStep(job, deps);

    expect(posts).toBe(0);
    expect(next).toBe(job);
    expect(await store.loadAll()).toEqual([]);
  });

  test('a PDF that is gone from disk fails the job without calling the server', async () => {
    const job = jobIn({ kind: 'waiting', attempt: 0, notBefore: 0, maybeSent: false }, '/gone.pdf');
    const store = await storing(job);

    const next = await runStep(job, depsAt(10, store));

    expect(next.state).toEqual({ kind: 'failed', reason: { kind: 'file_missing' } });
    expect(await store.loadAll()).toEqual([next]);
  });

  test('a clock that steps back between two reads cannot refuse a send that was due', async () => {
    const job = jobIn({ kind: 'waiting', attempt: 0, notBefore: 1000, maybeSent: false }, '/file.pdf');
    const store = await storing(job);
    const clock = [1000, 900];
    const deps: RunnerDeps<string> = {
      ...depsAt(0, store, { ...offlineClient, postDocument: async () => success(taskId) }),
      now: () => clock.shift() ?? 900,
      readFile: async () => 'pdf bytes',
    };

    const next = await runStep(job, deps);

    expect(next.state).toMatchObject({ kind: 'processing', taskId });
  });

  test('a send pushed further ahead than any retry by a clock set back runs now', async () => {
    const job = jobIn({ kind: 'waiting', attempt: 0, notBefore: now + 31 * 60_000, maybeSent: false }, '/gone.pdf');

    const next = await runStep(job, depsAt(now, await storing(job)));

    expect(next.state).toEqual({ kind: 'failed', reason: { kind: 'file_missing' } });
  });

  test('a step that is not due yet changes nothing', async () => {
    const store = new MemoryJobStore();
    const job = jobIn({ kind: 'waiting', attempt: 1, notBefore: 5000, maybeSent: false }, '/file.pdf');

    expect(await runStep(job, depsAt(4999, store))).toBe(job);
    expect(await store.loadAll()).toEqual([]);
  });
});

describe('recoverAfterRestart', () => {
  test('writes the interrupted job back so the next step starts from the stored copy', async () => {
    const job = jobIn({ kind: 'sending', attempt: 0, startedAt: 0 }, '/file.pdf');
    const store = await storing(job);

    const recovered = await recoverAfterRestart(job, store, 10);

    expect(recovered.state).toEqual({ kind: 'waiting', attempt: 1, notBefore: 10, maybeSent: true, unsureSince: 10 });
    expect(await store.loadAll()).toEqual([recovered]);
  });
});

describe('deleteJob', () => {
  test('refuses a job that is being sent and keeps it stored', async () => {
    const job = jobIn({ kind: 'sending', attempt: 0, startedAt: 0 }, '/file.pdf');
    const store = await storing(job);

    expect(await deleteJob(job, store)).toBe(false);
    expect(await store.loadAll()).toEqual([job]);
  });

  test('refuses a stale copy of a job that a runner has since claimed', async () => {
    const job = jobIn({ kind: 'waiting', attempt: 0, notBefore: 0, maybeSent: false }, '/file.pdf');
    const store = await storing(job);
    const sending: UploadJob = { ...job, updatedAt: job.updatedAt + 1, state: { kind: 'sending', attempt: 0, startedAt: 1 } };
    await store.saveIfUnchanged(sending, job.updatedAt);

    expect(await deleteJob(job, store)).toBe(false);
    expect(await store.loadAll()).toEqual([sending]);
  });

  test('removes a finished job', async () => {
    const job = jobIn({ kind: 'failed', reason: { kind: 'file_missing' } }, null);
    const store = await storing(job);

    expect(await deleteJob(job, store)).toBe(true);
    expect(await store.loadAll()).toEqual([]);
  });
});
