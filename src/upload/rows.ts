import type { DocumentId } from '../paperless/schemas';
import type { Progress } from './drain';
import {
  accepts,
  type AccountId,
  type BatchId,
  canDelete,
  type FailureReason,
  type JobId,
  type UploadJob,
} from './machine';

export type RowLook =
  | { kind: 'preparing' }
  | { kind: 'waitingOffline' }
  | { kind: 'waitingToSend' }
  | { kind: 'waitingRetry'; retryAt: number; attempt: number }
  | { kind: 'waitingLookup' }
  | { kind: 'sending'; progress: Progress | null }
  | { kind: 'processing' }
  | { kind: 'done'; documentId: DocumentId }
  | { kind: 'signInRequired' }
  | { kind: 'notPermitted' }
  | { kind: 'tooLarge'; bytes: number | null }
  | { kind: 'rejected'; message: string }
  | { kind: 'consumptionFailed'; message: string }
  | { kind: 'fileMissing' }
  | { kind: 'pdfFailed'; message: string }
  | { kind: 'unreadable' };

export type UploadRow = { job: UploadJob; look: RowLook; canRetry: boolean; canDelete: boolean };
export type UploadSection = { batchId: BatchId; createdAt: number; rows: UploadRow[] };

export type FileBytes = (path: string) => number | null;

function failedLook(reason: FailureReason, pdfPath: string | null, fileBytes: FileBytes): RowLook {
  switch (reason.kind) {
    case 'sign_in_required':
      return { kind: 'signInRequired' };
    case 'not_permitted':
      return { kind: 'notPermitted' };
    case 'rejected':
      if (reason.status === 413) {
        return { kind: 'tooLarge', bytes: pdfPath === null ? null : fileBytes(pdfPath) };
      }
      return { kind: 'rejected', message: reason.message };
    case 'consumption_failed':
      return { kind: 'consumptionFailed', message: reason.message };
    case 'file_missing':
      return { kind: 'fileMissing' };
    case 'pdf_failed':
      return { kind: 'pdfFailed', message: reason.message };
    case 'unreadable':
      return { kind: 'unreadable' };
  }
}

export function rowLook(
  job: UploadJob,
  online: boolean,
  progress: Progress | undefined,
  fileBytes: FileBytes,
): RowLook {
  const state = job.state;
  switch (state.kind) {
    case 'preparing':
      return { kind: 'preparing' };
    case 'waiting':
      if (!online) {
        return { kind: 'waitingOffline' };
      }
      if (state.maybeSent) {
        return { kind: 'waitingLookup' };
      }
      if (state.attempt === 0) {
        return { kind: 'waitingToSend' };
      }
      return { kind: 'waitingRetry', retryAt: state.notBefore, attempt: state.attempt + 1 };
    case 'sending':
      return { kind: 'sending', progress: progress ?? null };
    case 'processing':
      return { kind: 'processing' };
    case 'done':
      return { kind: 'done', documentId: state.documentId };
    case 'failed':
      return failedLook(state.reason, job.pdfPath, fileBytes);
  }
}

export function uploadSections(
  jobs: UploadJob[],
  accountId: AccountId,
  options: { now: number; online: boolean; progress: ReadonlyMap<JobId, Progress>; fileBytes: FileBytes },
): UploadSection[] {
  const ownJobs = jobs
    .filter((job) => job.accountId === accountId)
    .sort((first, second) => first.createdAt - second.createdAt);
  const sections = new Map<BatchId, UploadSection>();
  for (const job of ownJobs) {
    const row: UploadRow = {
      job,
      look: rowLook(job, options.online, options.progress.get(job.id), options.fileBytes),
      canRetry: accepts(job.state, { kind: 'retryRequested' }, options.now),
      canDelete: canDelete(job.state),
    };
    const section = sections.get(job.batchId);
    if (section === undefined) {
      sections.set(job.batchId, { batchId: job.batchId, createdAt: job.createdAt, rows: [row] });
    } else {
      section.rows.push(row);
    }
  }
  return Array.from(sections.values()).sort((first, second) => second.createdAt - first.createdAt);
}

export function unfinishedCount(jobs: UploadJob[], accountId: AccountId): number {
  return jobs.filter((job) => job.accountId === accountId && job.state.kind !== 'done').length;
}
