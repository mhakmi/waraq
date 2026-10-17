import { copy } from '../copy';
import type { Result } from '../paperless/errors';
import { type Batch, type DraftDocument, pageCount, resolveUploadFields } from '../scan/batch';
import {
  accepts,
  type AccountId,
  type JobId,
  type JobInput,
  newUploadJob,
  nextStep,
  stepIsDue,
  type UploadEvent,
  type UploadJob,
} from './machine';
import {
  advance,
  deleteJob,
  type JobStore,
  type PdfBuildFailure,
  recoverAfterRestart,
  runStep,
  type UploadClient,
} from './runner';

export type Progress = { sent: number; total: number };

export type UploadQueueDeps<File> = {
  store: JobStore;
  now: () => number;
  clientFor: (accountId: AccountId, onProgress: (progress: Progress) => void) => Promise<UploadClient<File> | null>;
  readFile: (path: string) => Promise<File | null>;
  buildPdf: (job: UploadJob) => Promise<Result<string, PdfBuildFailure>>;
  removeFile: (uri: string) => Promise<void>;
  wake: (at: number | null) => void;
  onError: (error: unknown) => void;
};

export type QueueSnapshot = { jobs: UploadJob[]; progress: ReadonlyMap<JobId, Progress> };

export type UploadQueue = {
  // Resolves when the run ends. An error goes to onError, so the promise never rejects.
  run(): Promise<void>;
  // enqueue, signedIn, and retry write the jobs, then start a run without waiting for it.
  enqueue(batch: Batch): Promise<void>;
  signedIn(accountId: AccountId): Promise<void>;
  retry(id: JobId): Promise<void>;
  remove(id: JobId): Promise<void>;
  subscribe(listener: () => void): () => void;
  snapshot(): QueueSnapshot;
};

const minute = 60 * 1000;
const week = 7 * 24 * 60 * minute;
export const retryAfterThrow = minute;
const signedInEvent: UploadEvent = { kind: 'signedIn' };
const retryEvent: UploadEvent = { kind: 'retryRequested' };

export function jobInputOf(document: DraftDocument): JobInput {
  if (document.kind === 'pages') {
    return { kind: 'pages', pages: document.pages.map((page) => ({ uri: page.uri, rotation: page.rotation })) };
  }
  if (!document.pdf.uri.startsWith('file:')) {
    throw new Error(`A PDF must be copied into the app's folder before it is queued, got ${document.pdf.uri}`);
  }
  return { kind: 'pdf', uri: document.pdf.uri, thumbnailUri: document.pdf.thumbnailUri };
}

function pageFiles(input: JobInput): string[] {
  return input.kind === 'pages' ? input.pages.map((page) => page.uri) : [];
}

function sentFiles(job: UploadJob): string[] {
  const files = job.input.kind === 'pdf' ? [job.input.uri, job.input.thumbnailUri] : [];
  return Array.from(new Set(job.pdfPath === null ? files : [...files, job.pdfPath]));
}

function jobFiles(job: UploadJob): string[] {
  return [...pageFiles(job.input), ...sentFiles(job)];
}

function pagesNoLongerNeeded(before: UploadJob, after: UploadJob): boolean {
  const pdfBuilt = before.pdfPath === null && after.pdfPath !== null;
  const pageMissing = after.state.kind === 'failed' && after.state.reason.kind === 'file_missing';
  return pdfBuilt || pageMissing;
}

function earlier(current: number | null, candidate: number): number {
  return current === null ? candidate : Math.min(current, candidate);
}

export function createUploadQueue<File>(deps: UploadQueueDeps<File>): UploadQueue {
  let recovered = false;
  let running: Promise<void> | null = null;
  let again = false;
  let jobs: UploadJob[] = [];
  const progress = new Map<JobId, Progress>();
  let snapshot: QueueSnapshot = { jobs, progress: new Map() };
  const listeners = new Set<() => void>();

  function changed(): void {
    snapshot = { jobs, progress: new Map(progress) };
    for (const listener of listeners) {
      listener();
    }
  }

  function showJobs(nextJobs: UploadJob[]): void {
    jobs = nextJobs;
    changed();
  }

  const store: JobStore = {
    async loadAll() {
      const loaded = await deps.store.loadAll();
      showJobs(loaded);
      return loaded;
    },
    async insert(job) {
      const inserted = await deps.store.insert(job);
      if (inserted) {
        showJobs([...jobs, job]);
      }
      return inserted;
    },
    async saveIfUnchanged(job, loadedUpdatedAt) {
      const saved = await deps.store.saveIfUnchanged(job, loadedUpdatedAt);
      if (saved) {
        showJobs(jobs.map((shown) => (shown.id === job.id ? job : shown)));
      }
      return saved;
    },
    async deleteIfUnchanged(id, loadedUpdatedAt) {
      const deleted = await deps.store.deleteIfUnchanged(id, loadedUpdatedAt);
      if (deleted) {
        showJobs(jobs.filter((shown) => shown.id !== id));
      }
      return deleted;
    },
  };

  async function removeFiles(files: string[]): Promise<void> {
    for (const file of files) {
      await deps.removeFile(file);
    }
  }

  async function removeJob(job: UploadJob): Promise<void> {
    if (await deleteJob(job, store)) {
      await removeFiles(jobFiles(job));
    }
  }

  async function afterStep(before: UploadJob, after: UploadJob): Promise<void> {
    if (pagesNoLongerNeeded(before, after)) {
      await removeFiles(pageFiles(after.input));
    }
    if (after.state.kind === 'done') {
      await removeFiles(sentFiles(after));
    }
  }

  async function pass(thrown: Set<JobId>): Promise<{ progressed: boolean; wakeAt: number | null }> {
    let progressed = false;
    let wakeAt: number | null = null;
    for (const job of await store.loadAll()) {
      if (thrown.has(job.id)) {
        wakeAt = earlier(wakeAt, deps.now() + retryAfterThrow);
        continue;
      }
      if (job.state.kind === 'done' && deps.now() - job.updatedAt > week) {
        await removeJob(job);
        continue;
      }
      const step = nextStep(job);
      if (step.effect === 'none') {
        continue;
      }
      const client = await deps.clientFor(job.accountId, (sent) => {
        progress.set(job.id, sent);
        changed();
      });
      if (client === null) {
        continue;
      }
      const stepAt = step.at;
      if (!stepIsDue(step, deps.now())) {
        wakeAt = earlier(wakeAt, stepAt);
        continue;
      }
      try {
        const next = await runStep(job, { client, store, now: deps.now, readFile: deps.readFile, buildPdf: deps.buildPdf });
        if (next !== job) {
          progressed = true;
          await afterStep(job, next);
        }
      } catch (error) {
        thrown.add(job.id);
        deps.onError(error);
        wakeAt = earlier(wakeAt, deps.now() + retryAfterThrow);
      } finally {
        if (progress.delete(job.id)) {
          changed();
        }
      }
    }
    return { progressed, wakeAt };
  }

  async function drain(): Promise<void> {
    try {
      if (!recovered) {
        for (const job of await store.loadAll()) {
          await recoverAfterRestart(job, store, deps.now());
        }
        recovered = true;
      }
      let wakeAt: number | null = null;
      let passAgain = true;
      const thrown = new Set<JobId>();
      while (passAgain) {
        again = false;
        const result = await pass(thrown);
        wakeAt = result.wakeAt;
        passAgain = result.progressed || again;
      }
      deps.wake(wakeAt);
    } catch (error) {
      deps.onError(error);
    } finally {
      running = null;
    }
  }

  function run(): Promise<void> {
    if (running !== null) {
      again = true;
      return running;
    }
    running = drain();
    return running;
  }

  async function findJob(id: JobId): Promise<UploadJob | undefined> {
    const loaded = await store.loadAll();
    return loaded.find((job) => job.id === id);
  }

  return {
    run,

    async enqueue(batch) {
      const jobs = batch.documents.map((document) =>
        newUploadJob({
          id: document.id,
          accountId: batch.accountId,
          batchId: batch.id,
          fields: resolveUploadFields(batch, document, copy.uploads.defaultTitle),
          input: jobInputOf(document),
          pageCount: pageCount(document),
          now: deps.now(),
        }),
      );
      for (const job of jobs) {
        await store.insert(job);
      }
      void run();
    },

    async signedIn(accountId) {
      for (const job of await store.loadAll()) {
        const now = deps.now();
        if (job.accountId === accountId && accepts(job.state, signedInEvent, now)) {
          await store.saveIfUnchanged(advance(job, signedInEvent, now), job.updatedAt);
        }
      }
      void run();
    },

    async retry(id) {
      const job = await findJob(id);
      const now = deps.now();
      if (job !== undefined && accepts(job.state, retryEvent, now)) {
        await store.saveIfUnchanged(advance(job, retryEvent, now), job.updatedAt);
      }
      void run();
    },

    async remove(id) {
      const job = await findJob(id);
      if (job !== undefined) {
        await removeJob(job);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    snapshot: () => snapshot,
  };
}
