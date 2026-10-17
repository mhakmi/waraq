import { describe, expect, test } from 'vitest';

import type { Fetch } from '../paperless/client';
import { failure, success } from '../paperless/errors';
import type { TaskId } from '../paperless/schemas';
import type { ServerUrl } from '../paperless/url';
import { type Server, signIn } from '../signin/connect';
import { createUploadQueue, type UploadQueueDeps } from './drain';
import { AccountId, BatchId, JobId, newUploadJob, type UploadJob, type UploadState } from './machine';
import { uploadSections } from './rows';
import { MemoryJobStore, type UploadClient } from './runner';

const start = 1_000_000;
const taskId = 'task-1' as TaskId;
const batchId = BatchId.parse('0190a000-0000-7000-8000-0000000000b1');

function jobId(number: number): JobId {
  return JobId.parse(`0190a000-0000-7000-8000-${String(number).padStart(12, '0')}`);
}

function jobIn(number: number, state: UploadState, accountId: AccountId): UploadJob {
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
    input: { kind: 'pages', pages: [{ uri: `file:///pages/${number}-1.jpg`, rotation: 0 }] },
    pageCount: 1,
    now: start - 10_000 + number,
  });
  const pdfPath = state.kind === 'preparing' ? null : `/uploads/${job.id}.pdf`;
  return { ...job, pdfPath, state };
}

function harness(accountId: AccountId) {
  const store = new MemoryJobStore();
  const posted: string[] = [];
  const removed: string[] = [];
  const errors: unknown[] = [];
  const client: UploadClient<string> = {
    postDocument: async (_fields, _file, filename) => {
      posted.push(filename);
      return success(taskId);
    },
    getTask: async () => success({ kind: 'pending' }),
    findDocumentByOriginalFilename: async () => success(null),
    findConsumeTaskByFilename: async () => success(null),
  };
  const deps: UploadQueueDeps<string> = {
    store,
    now: () => start,
    clientFor: async (id) => (id === accountId ? client : null),
    readFile: async () => 'pdf bytes',
    buildPdf: async (job) => success(`/uploads/${job.id}.pdf`),
    removeFile: async (uri) => {
      removed.push(uri);
    },
    wake: () => {},
    onError: (error) => {
      errors.push(error);
    },
  };
  return { store, posted, removed, errors, deps };
}

const server: Server = {
  baseUrl: 'https://docs.example.com' as ServerUrl,
  host: 'docs.example.com',
  isHttp: false,
  headers: {},
};

const paperlessFetch: Fetch = async (url) => {
  const body = url.endsWith('/api/token/')
    ? { token: 'abc' }
    : { user: { id: 3, username: 'admin' }, permissions: [] };
  return {
    status: 200,
    url,
    redirected: false,
    headers: new Headers({ 'content-type': 'application/json', 'x-version': '3.3.2', 'x-api-version': '10' }),
    text: async () => JSON.stringify(body),
  };
};

async function signInAs(now: number): Promise<AccountId> {
  const result = await signIn(server, { kind: 'password', username: 'admin', password: 'pw', code: null }, paperlessFetch, now);
  if (result.kind !== 'signed_in') {
    throw new Error(JSON.stringify(result));
  }
  return AccountId.parse(result.stored.account.id);
}

describe('review: signing in again', () => {
  test('signing in again to the same server and user sends the jobs held for sign-in, and shows them', async () => {
    const first = await signInAs(1_000);
    const held = jobIn(1, { kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'send' } } }, first);
    const queued = jobIn(2, { kind: 'waiting', attempt: 0, notBefore: start, maybeSent: false }, first);

    // The token expired, so the user signs out and signs in again with the same server and user.
    const second = await signInAs(2_000);
    const h = harness(second);
    await h.store.insert(held);
    await h.store.insert(queued);
    const queue = createUploadQueue(h.deps);

    await queue.signedIn(second);
    await queue.run();

    expect(h.posted.sort()).toEqual([`${held.id}.pdf`, `${queued.id}.pdf`].sort());
    const shown = uploadSections(await h.store.loadAll(), second, {
      now: start,
      online: true,
      progress: new Map(),
      fileBytes: () => null,
    }).flatMap((section) => section.rows.map((row) => row.job.id));
    expect(shown.sort()).toEqual([held.id, queued.id].sort());
  });
});

describe('review: one bad job', () => {
  test('a job whose step throws every time does not stop the jobs queued after it', async () => {
    const account = AccountId.parse('account');
    const h = harness(account);
    h.deps.buildPdf = async () => {
      throw new Error('File: invalid uri');
    };
    await h.store.insert(jobIn(1, { kind: 'preparing' }, account));
    await h.store.insert(jobIn(2, { kind: 'waiting', attempt: 0, notBefore: start, maybeSent: false }, account));
    const queue = createUploadQueue(h.deps);

    await queue.run();
    await queue.run();
    await queue.run();

    expect(h.posted).toEqual([`${jobId(2)}.pdf`]);
  });
});

describe('review: a PDF that could not be made', () => {
  test('keeps the scanned pages when the PDF build fails for a reason other than a missing page', async () => {
    const account = AccountId.parse('account');
    const h = harness(account);
    h.deps.buildPdf = async () => failure({ kind: 'pdf_failed', message: 'No space left on device' });
    await h.store.insert(jobIn(1, { kind: 'preparing' }, account));

    await createUploadQueue(h.deps).run();

    expect(h.removed).toEqual([]);
  });
});
