import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, openAsBlob, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import type { UploadFields } from '../src/paperless/client';
import { success } from '../src/paperless/errors';
import {
  AccountId,
  BatchId,
  JobId,
  newUploadJob,
  nextStep,
  transition,
  type UploadJob,
  uploadFilename,
} from '../src/upload/machine';
import {
  MemoryJobStore,
  recoverAfterRestart,
  type RunnerDeps,
  runStep,
  type UploadClient,
} from '../src/upload/runner';
import { uuidV7 } from '../src/upload/uuid';
import { client, clientWithToken, documentCount, documentsNamed, uniqueName } from './helpers';
import { corruptPdf, syntheticPdf } from './synthetic-pdf';

const folder = mkdtempSync(join(tmpdir(), 'waraq-upload-'));

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

function fieldsTitled(title: string): UploadFields {
  return {
    title,
    created: null,
    correspondentId: null,
    documentTypeId: null,
    storagePathId: null,
    tagIds: [],
    archiveSerialNumber: null,
    customFields: [],
  };
}

async function queueJob(store: MemoryJobStore, title: string): Promise<UploadJob> {
  const now = Date.now();
  const job = newUploadJob({
    id: JobId.parse(uuidV7(now, randomBytes(10))),
    accountId: AccountId.parse('test-account'),
    batchId: BatchId.parse(uuidV7(now, randomBytes(10))),
    fields: fieldsTitled(title),
    input: { kind: 'pages', pages: [{ uri: 'file:///page-1.jpg', rotation: 0 }] },
    pageCount: 1,
    now,
  });
  await store.insert(job);
  return job;
}

function depsFor(
  uploadClient: UploadClient<Blob>,
  store: MemoryJobStore,
  pdf: (title: string) => Blob = syntheticPdf,
): RunnerDeps<Blob> {
  return {
    client: uploadClient,
    store,
    now: Date.now,
    readFile: async (path) => (existsSync(path) ? openAsBlob(path, { type: 'application/pdf' }) : null),
    buildPdf: async (job) => {
      const path = join(folder, uploadFilename(job.id));
      writeFileSync(path, Buffer.from(await pdf(job.fields.title).arrayBuffer()));
      return success(path);
    },
  };
}

async function runUntilSettled(job: UploadJob, deps: RunnerDeps<Blob>): Promise<UploadJob> {
  let current = job;
  for (;;) {
    const step = nextStep(current);
    if (step.effect === 'none') {
      return current;
    }
    const wait = step.at - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const next = await runStep(current, deps);
    if (next === current) {
      throw new Error(`runStep made no progress on a due ${step.effect}`);
    }
    current = next;
  }
}

describe('runStep against a real server', () => {
  test('a queued document ends as done with the id of a real document', async () => {
    const before = await documentCount();
    const title = uniqueName('happy path');
    const store = new MemoryJobStore();
    const job = await queueJob(store, title);

    const finished = await runUntilSettled(job, depsFor(client, store));

    expect(finished.state.kind).toBe('done');
    if (finished.state.kind !== 'done') {
      return;
    }
    const document = await client.getDocument(finished.state.documentId);
    expect(document.ok && document.value.title).toBe(title);
    expect(document.ok && document.value.originalFileName).toBe(uploadFilename(job.id));
    expect(await documentCount()).toBe(before + 1);
  });

  test('after a crash mid-send the job finds its upload instead of sending it again', async () => {
    const before = await documentCount();
    const store = new MemoryJobStore();
    const crashingClient: UploadClient<Blob> = {
      ...client,
      postDocument: async (fields, file, filename) => {
        await client.postDocument(fields, file, filename);
        throw new Error('the app was killed before it saved the task id');
      },
    };

    const job = await queueJob(store, uniqueName('crash path'));
    const prepared = await runStep(job, depsFor(client, store));
    await expect(runStep(prepared, depsFor(crashingClient, store))).rejects.toThrow('killed');

    const [saved] = await store.loadAll();
    expect(saved.state.kind).toBe('sending');
    const recovered = await recoverAfterRestart(saved, store, Date.now());
    expect(recovered.state).toMatchObject({ kind: 'waiting', maybeSent: true });

    const finished = await runUntilSettled(recovered, depsFor(client, store));

    expect(finished.state.kind).toBe('done');
    expect(await documentCount()).toBe(before + 1);
    expect(await documentsNamed(uploadFilename(job.id))).toBe(1);
  });

  test('a send the server finishes after the app died is found, not sent again', async () => {
    const before = await documentCount();
    const store = new MemoryJobStore();
    const lateServer: UploadClient<Blob> = {
      ...client,
      postDocument: async (fields, file, filename) => {
        setTimeout(() => void client.postDocument(fields, file, filename), 5000);
        throw new Error('the app was killed while the body was still in flight');
      },
    };

    const job = await queueJob(store, uniqueName('late task'));
    const prepared = await runStep(job, depsFor(client, store));
    await expect(runStep(prepared, depsFor(lateServer, store))).rejects.toThrow('killed');

    const [saved] = await store.loadAll();
    const recovered = await recoverAfterRestart(saved, store, Date.now());
    const lookedOnce = await runStep(recovered, depsFor(client, store));
    expect(lookedOnce.state).toMatchObject({ kind: 'waiting', maybeSent: true });

    const finished = await runUntilSettled(lookedOnce, depsFor(client, store));

    expect(finished.state.kind).toBe('done');
    expect(await documentCount()).toBe(before + 1);
    expect(await documentsNamed(uploadFilename(job.id))).toBe(1);
  });

  test('a file Paperless cannot read ends as consumption_failed', async () => {
    const before = await documentCount();
    const store = new MemoryJobStore();
    const job = await queueJob(store, uniqueName('corrupt'));

    const finished = await runUntilSettled(job, depsFor(client, store, corruptPdf));

    expect(finished.state).toMatchObject({ kind: 'failed', reason: { kind: 'consumption_failed' } });
    expect(await documentCount()).toBe(before);
  });

  test('a bad token ends as sign_in_required and sends nothing', async () => {
    const before = await documentCount();
    const store = new MemoryJobStore();
    const job = await queueJob(store, uniqueName('bad token'));

    const finished = await runUntilSettled(job, depsFor(clientWithToken('not-a-real-token'), store));

    expect(finished.state).toEqual({ kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'send' } } });
    expect(await documentCount()).toBe(before);

    const signedIn = { ...finished, state: transition(finished.state, { kind: 'signedIn' }, Date.now()) };
    const retried = await runUntilSettled(signedIn, depsFor(client, store));
    expect(retried.state.kind).toBe('done');
    expect(await documentCount()).toBe(before + 1);
  });
});
