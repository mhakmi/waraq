import { describe, expect, test } from 'vitest';

import { failure, success } from '../paperless/errors';
import type { DocumentId, TaskId } from '../paperless/schemas';
import { type Batch, PageId } from '../scan/batch';
import { createUploadQueue, jobInputOf, type QueueSnapshot, retryAfterThrow, type UploadQueueDeps } from './drain';
import { AccountId, BatchId, JobId, newUploadJob, type UploadJob, type UploadState } from './machine';
import { MemoryJobStore, type UploadClient } from './runner';

const start = 1_000_000;
const day = 24 * 60 * 60 * 1000;
const taskId = 'task-1' as TaskId;
const documentId = 42 as DocumentId;
const account = AccountId.parse('account');
const otherAccount = AccountId.parse('other-account');
const batchId = BatchId.parse('0190a000-0000-7000-8000-0000000000b1');
const fresh: UploadState = { kind: 'waiting', attempt: 0, notBefore: start, maybeSent: false };
const signInRequired: UploadState = { kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'send' } } };

function jobId(number: number): JobId {
  return JobId.parse(`0190a000-0000-7000-8000-${String(number).padStart(12, '0')}`);
}

function jobIn(number: number, state: UploadState, accountId = account): UploadJob {
  const job = newUploadJob({
    id: jobId(number),
    accountId,
    batchId,
    fields: {
      title: `Document ${number}`,
      created: null,
      correspondentId: null,
      documentTypeId: null,
      storagePathId: null,
      tagIds: [],
      archiveSerialNumber: null,
      customFields: [],
    },
    input: {
      kind: 'pages',
      pages: [
        { uri: `file:///pages/${number}-1.jpg`, rotation: 0 },
        { uri: `file:///pages/${number}-2.jpg`, rotation: 0 },
      ],
    },
    pageCount: 2,
    now: start - 10_000,
  });
  const pdfPath = state.kind === 'preparing' ? null : `/uploads/${job.id}.pdf`;
  return { ...job, pdfPath, state };
}

function harness() {
  const store = new MemoryJobStore();
  const clock = { now: start };
  const removed: string[] = [];
  const wakes: (number | null)[] = [];
  const posted: string[] = [];
  const errors: unknown[] = [];
  const client: UploadClient<string> = {
    postDocument: async (_fields, _file, filename) => {
      posted.push(filename);
      return success(taskId);
    },
    getTask: async () => success({ kind: 'succeeded', documentId }),
    findDocumentByOriginalFilename: async () => {
      throw new Error('no lookup expected');
    },
    findConsumeTaskByFilename: async () => {
      throw new Error('no lookup expected');
    },
  };
  const deps: UploadQueueDeps<string> = {
    store,
    now: () => clock.now,
    clientFor: async () => client,
    readFile: async () => 'pdf bytes',
    buildPdf: async (job) => success(`/uploads/${job.id}.pdf`),
    removeFile: async (uri) => {
      removed.push(uri);
    },
    wake: (at) => {
      wakes.push(at);
    },
    onError: (error) => {
      errors.push(error);
    },
  };
  return { store, clock, removed, wakes, posted, errors, client, deps };
}

async function stored(store: MemoryJobStore, number: number): Promise<UploadJob | undefined> {
  const jobs = await store.loadAll();
  return jobs.find((job) => job.id === jobId(number));
}

describe('run', () => {
  test('recovers a job left in sending once per queue, and a new queue recovers again', async () => {
    const h = harness();
    h.deps.clientFor = async () => null;
    await h.store.insert(jobIn(1, { kind: 'sending', attempt: 0, startedAt: start - 5000 }));
    const queue = createUploadQueue(h.deps);

    await queue.run();
    expect((await stored(h.store, 1))?.state).toEqual({
      kind: 'waiting',
      attempt: 1,
      notBefore: start,
      maybeSent: true,
      unsureSince: start,
    });

    const live = jobIn(2, { kind: 'sending', attempt: 0, startedAt: start });
    await h.store.insert(live);
    await queue.run();
    expect(await stored(h.store, 2)).toEqual(live);

    await createUploadQueue(h.deps).run();
    expect((await stored(h.store, 2))?.state).toMatchObject({ kind: 'waiting', maybeSent: true });
  });

  test('skips the jobs of a signed-out account and wakes for the earliest signed-in job', async () => {
    const h = harness();
    h.deps.clientFor = async (accountId) => (accountId === otherAccount ? null : h.client);
    const signedOut = jobIn(1, { kind: 'waiting', attempt: 0, notBefore: start - 1000, maybeSent: false }, otherAccount);
    await h.store.insert(signedOut);
    await h.store.insert(jobIn(2, { kind: 'waiting', attempt: 1, notBefore: start + 3000, maybeSent: false }));
    await h.store.insert(
      jobIn(3, { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: start + 5000, startedAt: start }),
    );

    await createUploadQueue(h.deps).run();

    expect(h.posted).toEqual([]);
    expect(await stored(h.store, 1)).toEqual(signedOut);
    expect(h.wakes).toEqual([start + 3000]);
  });

  test('cancels the wake when no job has a step left', async () => {
    const h = harness();
    await h.store.insert(jobIn(1, { kind: 'done', documentId }));
    await h.store.insert(jobIn(2, signInRequired));

    await createUploadQueue(h.deps).run();

    expect(h.wakes).toEqual([null]);
  });

  test('removes the page files once the PDF is built and the PDF once the job is done', async () => {
    const h = harness();
    await h.store.insert(jobIn(1, { kind: 'preparing' }));
    const queue = createUploadQueue(h.deps);

    await queue.run();
    expect(h.removed).toEqual(['file:///pages/1-1.jpg', 'file:///pages/1-2.jpg']);
    expect((await stored(h.store, 1))?.state.kind).toBe('processing');

    h.clock.now += 2000;
    await queue.run();
    expect((await stored(h.store, 1))?.state).toEqual({ kind: 'done', documentId });
    expect(h.removed).toEqual(['file:///pages/1-1.jpg', 'file:///pages/1-2.jpg', `/uploads/${jobId(1)}.pdf`]);
  });

  test('removes the page files when the PDF cannot be built', async () => {
    const h = harness();
    h.deps.buildPdf = async () => failure({ kind: 'file_missing' });
    await h.store.insert(jobIn(1, { kind: 'preparing' }));

    await createUploadQueue(h.deps).run();

    expect((await stored(h.store, 1))?.state).toEqual({ kind: 'failed', reason: { kind: 'file_missing' } });
    expect(h.removed).toEqual(['file:///pages/1-1.jpg', 'file:///pages/1-2.jpg']);
  });

  test('deletes done jobs older than a week and keeps newer ones', async () => {
    const h = harness();
    const recent = { ...jobIn(2, { kind: 'done', documentId }), updatedAt: start - 6 * day };
    await h.store.insert({ ...jobIn(1, { kind: 'done', documentId }), updatedAt: start - 8 * day });
    await h.store.insert(recent);

    await createUploadQueue(h.deps).run();

    expect(await h.store.loadAll()).toEqual([recent]);
  });

  test('a run asked for while one is running is the same run and makes one more pass', async () => {
    const h = harness();
    const slowAccount = AccountId.parse('slow-account');
    let reachedGate!: () => void;
    const atGate = new Promise<void>((resolve) => {
      reachedGate = resolve;
    });
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    h.deps.clientFor = async (accountId) => {
      if (accountId !== slowAccount) {
        return h.client;
      }
      reachedGate();
      await gate;
      return null;
    };
    await h.store.insert(jobIn(1, { kind: 'preparing' }, slowAccount));
    const queue = createUploadQueue(h.deps);

    const first = queue.run();
    await atGate;
    await h.store.insert(jobIn(2, { kind: 'preparing' }));
    const second = queue.run();
    openGate();
    await first;

    expect(second).toBe(first);
    expect((await stored(h.store, 2))?.state.kind).toBe('processing');
    expect(h.posted).toEqual([`${jobId(2)}.pdf`]);
  });
});

describe('run', () => {
  function diskFullUntilRetry(h: ReturnType<typeof harness>) {
    h.deps.buildPdf = async (job) => {
      if (h.clock.now < start + retryAfterThrow) {
        throw new Error('the disk is full');
      }
      return success(`/uploads/${job.id}.pdf`);
    };
  }

  test('a step that throws is reported once per run and leaves the other jobs running', async () => {
    const h = harness();
    diskFullUntilRetry(h);
    await h.store.insert(jobIn(1, { kind: 'preparing' }));
    await h.store.insert(jobIn(2, fresh));

    await createUploadQueue(h.deps).run();

    expect(h.errors).toEqual([new Error('the disk is full')]);
    expect((await stored(h.store, 1))?.state.kind).toBe('preparing');
    expect((await stored(h.store, 2))?.state.kind).toBe('processing');
  });

  test('a job whose step throws gets another try a minute later', async () => {
    const h = harness();
    diskFullUntilRetry(h);
    await h.store.insert(jobIn(1, { kind: 'preparing' }));
    const queue = createUploadQueue(h.deps);

    await queue.run();
    expect(h.wakes).toEqual([start + retryAfterThrow]);

    h.clock.now = start + retryAfterThrow;
    await queue.run();
    expect((await stored(h.store, 1))?.state.kind).toBe('processing');
  });
});

describe('enqueue', () => {
  const batch: Batch = {
    id: batchId,
    accountId: account,
    createdAt: start,
    shared: { tagIds: [5] },
    documents: [
      { kind: 'pages', id: jobId(1), pages: [page('a', 90)], metadata: { title: 'Lease' } },
      { kind: 'pages', id: jobId(2), pages: [page('b', 0)], metadata: {} },
    ],
  };

  function page(name: string, rotation: 0 | 90) {
    return { id: PageId.parse(`page-${name}`), uri: `file:///pages/${name}.jpg`, width: 1, height: 1, rotation };
  }

  test('makes one job per document from the batch, ready to build its PDF', async () => {
    const h = harness();
    h.deps.clientFor = async () => null;

    await createUploadQueue(h.deps).enqueue(batch);

    const jobs = await h.store.loadAll();
    expect(jobs.map((job) => [job.id, job.fields.title, job.fields.tagIds, job.input, job.state])).toEqual([
      [jobId(1), 'Lease', [5], { kind: 'pages', pages: [{ uri: 'file:///pages/a.jpg', rotation: 90 }] }, { kind: 'preparing' }],
      [jobId(2), 'Scanned document', [5], { kind: 'pages', pages: [{ uri: 'file:///pages/b.jpg', rotation: 0 }] }, { kind: 'preparing' }],
    ]);
  });

  test('a document that arrived as a PDF becomes a job that sends the app\'s copy and keeps its page count', async () => {
    const pdf = { uri: 'file:///batch/shared.pdf', name: 'Lease.pdf', pageCount: 3, thumbnailUri: 'file:///batch/shared.jpg' };
    const h = harness();
    h.deps.clientFor = async () => null;

    await createUploadQueue(h.deps).enqueue({ ...batch, documents: [{ kind: 'pdf', id: jobId(3), pdf, metadata: {} }] });

    const [job] = await h.store.loadAll();
    expect(job.input).toEqual({ kind: 'pdf', uri: pdf.uri, thumbnailUri: pdf.thumbnailUri });
    expect(job.pageCount).toBe(3);
  });

  test('a PDF that is still another app\'s file never becomes a job, because the queue deletes the file when it is done', async () => {
    const foreign = { uri: 'content://com.android.providers.downloads/document/12', name: 'x.pdf', pageCount: 1, thumbnailUri: 'file:///batch/x.jpg' };
    const h = harness();
    const queue = createUploadQueue(h.deps);
    const documents: Batch['documents'] = [...batch.documents, { kind: 'pdf', id: jobId(3), pdf: foreign, metadata: {} }];

    await expect(queue.enqueue({ ...batch, documents })).rejects.toThrow('content://');
    expect(await h.store.loadAll()).toEqual([]);
    expect(() => jobInputOf(documents[2])).toThrow();
  });

  test('queued twice, a batch sends each document once', async () => {
    const h = harness();
    const queue = createUploadQueue(h.deps);

    await queue.enqueue(batch);
    await queue.run();
    await queue.enqueue(batch);
    await queue.run();

    const jobs = await h.store.loadAll();
    expect(jobs.map((job) => job.state.kind)).toEqual(['processing', 'processing']);
    expect(h.posted).toEqual([`${jobId(1)}.pdf`, `${jobId(2)}.pdf`]);
  });
});

describe('signedIn', () => {
  test('sends the held jobs of that account and leaves other jobs alone', async () => {
    const h = harness();
    h.deps.clientFor = async (accountId) => (accountId === otherAccount ? null : h.client);
    const otherHeld = jobIn(2, signInRequired, otherAccount);
    const notPermitted = jobIn(3, { kind: 'failed', reason: { kind: 'not_permitted', resume: { step: 'send' } } });
    await h.store.insert(jobIn(1, signInRequired));
    await h.store.insert(otherHeld);
    await h.store.insert(notPermitted);

    const queue = createUploadQueue(h.deps);
    await queue.signedIn(account);
    await queue.run();

    expect((await stored(h.store, 1))?.state.kind).toBe('processing');
    expect(await stored(h.store, 2)).toEqual(otherHeld);
    expect(await stored(h.store, 3)).toEqual(notPermitted);
    expect(h.posted).toEqual([`${jobId(1)}.pdf`]);
  });
});

describe('retry and remove', () => {
  test('retry moves a job the machine lets retry and leaves one it refuses', async () => {
    const h = harness();
    h.deps.clientFor = async () => null;
    const missing = jobIn(2, { kind: 'failed', reason: { kind: 'file_missing' } });
    await h.store.insert(jobIn(1, { kind: 'failed', reason: { kind: 'rejected', status: 400, message: 'bad' } }));
    await h.store.insert(missing);
    const queue = createUploadQueue(h.deps);

    await queue.retry(jobId(1));
    await queue.retry(jobId(2));
    await queue.run();

    expect((await stored(h.store, 1))?.state).toEqual(fresh);
    expect(await stored(h.store, 2)).toEqual(missing);
  });

  test('remove deletes a waiting job with its files and keeps a job that is sending', async () => {
    const h = harness();
    const sending = jobIn(2, { kind: 'sending', attempt: 0, startedAt: start });
    await h.store.insert(jobIn(1, fresh));
    await h.store.insert(sending);
    const queue = createUploadQueue(h.deps);

    await queue.remove(jobId(1));
    await queue.remove(jobId(2));

    expect(await h.store.loadAll()).toEqual([sending]);
    expect(h.removed).toEqual(['file:///pages/1-1.jpg', 'file:///pages/1-2.jpg', `/uploads/${jobId(1)}.pdf`]);
  });
});

describe('snapshot', () => {
  test('shows the job as sending with its progress during the send, and drops the progress after', async () => {
    const h = harness();
    await h.store.insert(jobIn(1, fresh));
    const queue = createUploadQueue(h.deps);
    let duringSend: QueueSnapshot | null = null;
    h.deps.clientFor = async (_accountId, onProgress) => ({
      ...h.client,
      postDocument: async () => {
        onProgress({ sent: 5, total: 10 });
        duringSend = queue.snapshot();
        return success(taskId);
      },
    });
    let notified = 0;
    queue.subscribe(() => {
      notified += 1;
    });

    await queue.run();

    expect(duringSend).toEqual({
      jobs: [expect.objectContaining({ state: { kind: 'sending', attempt: 0, startedAt: start } })],
      progress: new Map([[jobId(1), { sent: 5, total: 10 }]]),
    });
    expect(queue.snapshot().progress.size).toBe(0);
    expect(queue.snapshot().jobs.map((job) => job.state.kind)).toEqual(['processing']);
    expect(queue.snapshot()).toBe(queue.snapshot());
    expect(notified).toBeGreaterThan(0);
  });
});
