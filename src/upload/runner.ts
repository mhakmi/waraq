import type { PaperlessClient } from '../paperless/client';
import type { Result } from '../paperless/errors';
import type { TaskId } from '../paperless/schemas';
import {
  canDelete,
  type JobId,
  nextStep,
  stepIsDue,
  transition,
  type UploadEvent,
  type UploadJob,
  uploadFilename,
} from './machine';

export interface JobStore {
  loadAll(): Promise<UploadJob[]>;
  save(job: UploadJob): Promise<void>;
  delete(id: JobId): Promise<void>;
}

export class MemoryJobStore implements JobStore {
  private readonly jobs = new Map<JobId, UploadJob>();

  async loadAll(): Promise<UploadJob[]> {
    return Array.from(this.jobs.values(), (job) => structuredClone(job));
  }

  async save(job: UploadJob): Promise<void> {
    this.jobs.set(job.id, structuredClone(job));
  }

  async delete(id: JobId): Promise<void> {
    this.jobs.delete(id);
  }
}

export type UploadClient<File> = Pick<
  PaperlessClient<File>,
  'postDocument' | 'getTask' | 'findDocumentByOriginalFilename' | 'findConsumeTaskByFilename'
>;

const day = 24 * 60 * 60 * 1000;

export type RunnerDeps<File> = {
  client: UploadClient<File>;
  store: JobStore;
  now: () => number;
  readFile: (path: string) => Promise<File | null>;
  buildPdf: (job: UploadJob) => Promise<Result<string, string>>;
};

function advance(job: UploadJob, event: UploadEvent, now: number): UploadJob {
  return { ...job, state: transition(job.state, event, now), updatedAt: now };
}

async function prepare<File>(job: UploadJob, deps: RunnerDeps<File>, now: number): Promise<UploadJob> {
  const built = await deps.buildPdf(job);
  if (!built.ok) {
    return advance(job, { kind: 'prepareFailed', message: built.error }, now);
  }
  return advance({ ...job, pdfPath: built.value }, { kind: 'prepared' }, now);
}

async function reconcile<File>(job: UploadJob, client: UploadClient<File>): Promise<UploadEvent> {
  const filename = uploadFilename(job.id);
  const task = await client.findConsumeTaskByFilename(filename, new Date(job.createdAt - day));
  if (!task.ok) {
    return { kind: 'reconcileFailed', error: task.error };
  }
  if (task.value !== null) {
    return { kind: 'foundTask', taskId: task.value };
  }
  const document = await client.findDocumentByOriginalFilename(filename);
  if (!document.ok) {
    return { kind: 'reconcileFailed', error: document.error };
  }
  if (document.value !== null) {
    return { kind: 'foundDocument', documentId: document.value };
  }
  return { kind: 'notFound' };
}

async function send<File>(job: UploadJob, deps: RunnerDeps<File>, now: number): Promise<UploadJob> {
  const file = job.pdfPath === null ? null : await deps.readFile(job.pdfPath);
  if (file === null) {
    return advance(job, { kind: 'fileMissing' }, now);
  }
  const sending = advance(job, { kind: 'sendStarted' }, now);
  await deps.store.save(sending);
  const posted = await deps.client.postDocument(job.fields, file, uploadFilename(job.id));
  const event: UploadEvent = posted.ok
    ? { kind: 'sendAccepted', taskId: posted.value }
    : { kind: 'sendFailed', error: posted.error };
  return advance(sending, event, deps.now());
}

async function check<File>(taskId: TaskId, client: UploadClient<File>): Promise<UploadEvent> {
  const result = await client.getTask(taskId);
  if (!result.ok) {
    return { kind: 'checkFailed', error: result.error };
  }
  const status = result.value;
  switch (status.kind) {
    case 'pending':
      return { kind: 'taskPending' };
    case 'succeeded':
      return { kind: 'taskSucceeded', documentId: status.documentId };
    case 'failed':
      return { kind: 'taskFailed', message: status.message };
    case 'unknown':
      return { kind: 'taskUnknown' };
  }
}

export async function runStep<File>(job: UploadJob, deps: RunnerDeps<File>): Promise<UploadJob> {
  const now = deps.now();
  const step = nextStep(job);
  if (!stepIsDue(step, now)) {
    return job;
  }

  let next: UploadJob;
  switch (step.effect) {
    case 'prepare':
      next = await prepare(job, deps, now);
      break;
    case 'reconcile':
      next = advance(job, await reconcile(job, deps.client), now);
      break;
    case 'send':
      next = await send(job, deps, now);
      break;
    case 'check':
      next = advance(job, await check(step.taskId, deps.client), now);
      break;
  }
  await deps.store.save(next);
  return next;
}

export function recoverAfterRestart(job: UploadJob, now: number): UploadJob {
  return job.state.kind === 'sending' ? advance(job, { kind: 'interrupted' }, now) : job;
}

export async function deleteJob(job: UploadJob, store: JobStore): Promise<boolean> {
  if (!canDelete(job.state)) {
    return false;
  }
  await store.delete(job.id);
  return true;
}
