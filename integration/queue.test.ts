import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, openAsBlob, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import { success } from '../src/paperless/errors';
import { type Batch, filesOf, PageId } from '../src/scan/batch';
import { createUploadQueue, type UploadQueue } from '../src/upload/drain';
import { AccountId, BatchId, JobId, uploadFilename } from '../src/upload/machine';
import { nodeDatabase } from '../src/upload/nodeDatabase';
import type { UploadClient } from '../src/upload/runner';
import { openJobStore } from '../src/upload/store';
import { uuidV7 } from '../src/upload/uuid';
import { client, documentCount, documentsNamed, uniqueName } from './helpers';
import { syntheticPdf } from './synthetic-pdf';

const folder = mkdtempSync(join(tmpdir(), 'waraq-queue-'));

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

const accountId = AccountId.parse('test-account');

function newId(): string {
  return uuidV7(Date.now(), randomBytes(10));
}

function batchTitled(titles: string[]): Batch {
  return {
    id: BatchId.parse(newId()),
    accountId,
    createdAt: Date.now(),
    shared: {},
    documents: titles.map((title) => {
      const page = join(folder, `${newId()}.jpg`);
      writeFileSync(page, 'a scanned page');
      const pages = [{ id: PageId.parse(newId()), uri: page, width: 1240, height: 1754, rotation: 0 as const }];
      return { kind: 'pages' as const, id: JobId.parse(newId()), pages, metadata: { title } };
    }),
  };
}

async function queueOn(databasePath: string, uploadClient: UploadClient<Blob>) {
  const store = await openJobStore(nodeDatabase(databasePath));
  const wakes: (number | null)[] = [];
  const queue = createUploadQueue<Blob>({
    store,
    now: Date.now,
    clientFor: async () => uploadClient,
    readFile: async (path) => (existsSync(path) ? openAsBlob(path, { type: 'application/pdf' }) : null),
    buildPdf: async (job) => {
      const path = join(folder, uploadFilename(job.id));
      writeFileSync(path, Buffer.from(await syntheticPdf(job.fields.title).arrayBuffer()));
      return success(path);
    },
    removeFile: async (uri) => {
      rmSync(uri, { force: true });
    },
    wake: (at) => {
      wakes.push(at);
    },
    onError: (error) => {
      throw error;
    },
  });
  return { store, queue, wakes };
}

async function runUntilIdle(queue: UploadQueue, wakes: (number | null)[]): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await queue.run();
    const wakeAt = wakes[wakes.length - 1];
    if (wakeAt === null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, wakeAt - Date.now())));
  }
  throw new Error('The queue still had work after two minutes');
}

describe('the upload queue against a real server', () => {
  test('a batch of two documents drains to done, each sent once, and its files are removed', async () => {
    const before = await documentCount();
    const { store, queue, wakes } = await queueOn(join(folder, 'batch.db'), client);
    const batch = batchTitled([uniqueName('queue first'), uniqueName('queue second')]);

    await queue.enqueue(batch);
    await runUntilIdle(queue, wakes);

    const jobs = await store.loadAll();
    expect(jobs.map((job) => job.state.kind)).toEqual(['done', 'done']);
    for (const document of batch.documents) {
      expect(await documentsNamed(uploadFilename(document.id))).toBe(1);
      expect(existsSync(filesOf(document)[0])).toBe(false);
      expect(existsSync(join(folder, uploadFilename(document.id)))).toBe(false);
    }
    expect(await documentCount()).toBe(before + 2);
  });

  test('after the app dies mid-send, a new queue on the same database finds the upload instead of sending it again', async () => {
    const before = await documentCount();
    const databasePath = join(folder, 'crash.db');
    let bodySent!: () => void;
    const sent = new Promise<void>((resolve) => {
      bodySent = resolve;
    });
    const dyingClient: UploadClient<Blob> = {
      ...client,
      postDocument: async (fields, file, filename) => {
        await client.postDocument(fields, file, filename);
        bodySent();
        return new Promise(() => {});
      },
    };
    const dying = await queueOn(databasePath, dyingClient);
    const batch = batchTitled([uniqueName('queue crash')]);

    void dying.queue.enqueue(batch);
    await sent;
    const [left] = await dying.store.loadAll();
    expect(left.state.kind).toBe('sending');

    const restarted = await queueOn(databasePath, client);
    await runUntilIdle(restarted.queue, restarted.wakes);

    const [finished] = await restarted.store.loadAll();
    expect(finished.state.kind).toBe('done');
    expect(await documentsNamed(uploadFilename(batch.documents[0].id))).toBe(1);
    expect(await documentCount()).toBe(before + 1);
  });
});
