import { z } from 'zod';

import type { UploadFields } from '../paperless/client';
import type { PaperlessError } from '../paperless/errors';
import type { DocumentId, TaskId } from '../paperless/schemas';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const JobId = z.string().regex(uuidPattern).brand<'JobId'>();
export type JobId = z.infer<typeof JobId>;

export const BatchId = z.string().regex(uuidPattern).brand<'BatchId'>();
export type BatchId = z.infer<typeof BatchId>;

export const AccountId = z.string().min(1).brand<'AccountId'>();
export type AccountId = z.infer<typeof AccountId>;

export type ResumePoint =
  | { step: 'send' }
  | { step: 'reconcile'; startedAt: number }
  | { step: 'check'; taskId: TaskId; startedAt: number };

export type FailureReason =
  | { kind: 'sign_in_required'; resume: ResumePoint }
  | { kind: 'not_permitted'; resume: ResumePoint }
  | { kind: 'rejected'; status: number; message: string }
  | { kind: 'consumption_failed'; message: string }
  | { kind: 'file_missing' }
  | { kind: 'pdf_failed'; message: string };

export type UploadState =
  | { kind: 'preparing' }
  | { kind: 'waiting'; attempt: number; notBefore: number; maybeSent: false }
  | { kind: 'waiting'; attempt: number; notBefore: number; maybeSent: true; startedAt: number }
  | { kind: 'sending'; attempt: number; startedAt: number }
  | {
      kind: 'processing';
      taskId: TaskId;
      checks: number;
      failedChecks: number;
      nextCheckAt: number;
      startedAt: number;
    }
  | { kind: 'done'; documentId: DocumentId }
  | { kind: 'failed'; reason: FailureReason };

export type UploadJob = {
  id: JobId;
  accountId: AccountId;
  batchId: BatchId;
  fields: UploadFields;
  pdfPath: string | null;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  state: UploadState;
};

export type UploadEvent =
  | { kind: 'prepared' }
  | { kind: 'prepareFailed'; message: string }
  | { kind: 'fileMissing' }
  | { kind: 'sendStarted' }
  | { kind: 'sendAccepted'; taskId: TaskId }
  | { kind: 'sendFailed'; error: PaperlessError }
  | { kind: 'interrupted' }
  | { kind: 'foundDocument'; documentId: DocumentId }
  | { kind: 'foundTask'; taskId: TaskId }
  | { kind: 'notFound' }
  | { kind: 'reconcileFailed'; error: PaperlessError }
  | { kind: 'taskPending' }
  | { kind: 'taskUnknown' }
  | { kind: 'checkFailed'; error: PaperlessError }
  | { kind: 'taskSucceeded'; documentId: DocumentId }
  | { kind: 'taskFailed'; message: string }
  | { kind: 'signedIn' }
  | { kind: 'retryRequested' };

export class InvalidTransition extends Error {
  constructor(
    readonly state: UploadState,
    readonly event: UploadEvent,
  ) {
    super(`An upload in state ${state.kind} does not accept ${event.kind}`);
    this.name = 'InvalidTransition';
  }
}

type StateKind = UploadState['kind'];
type EventKind = UploadEvent['kind'];
type StateOf<Kind extends StateKind> = Extract<UploadState, { kind: Kind }>;
type EventOf<Kind extends EventKind> = Extract<UploadEvent, { kind: Kind }>;

const second = 1000;
const minute = 60 * second;

// After a send that got no reply, the server may still be working on the request for this long.
export const sentGraceWindow = 2 * minute;
const graceRecheckDelay = 30 * second;
// After this many checks in a row with no answer about the task, reconcile decides what happened to it.
export const failedCheckLimit = 10;

export function sendRetryDelay(attempt: number): number {
  return Math.min(30 * minute, 5 * second * 2 ** attempt);
}

export function pollDelay(checks: number): number {
  return Math.min(minute, 2 * second * 2 ** checks);
}

export function uploadFilename(id: JobId): string {
  return `${id}.pdf`;
}

function waitToSend(attempt: number, notBefore: number): UploadState {
  return { kind: 'waiting', attempt, notBefore, maybeSent: false };
}

function waitToReconcile(attempt: number, notBefore: number, startedAt: number): UploadState {
  return { kind: 'waiting', attempt, notBefore, maybeSent: true, startedAt };
}

function startProcessing(taskId: TaskId, nextCheckAt: number, startedAt: number): UploadState {
  return { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt, startedAt };
}

function accessFailure(error: PaperlessError, resume: ResumePoint): UploadState | null {
  if (error.kind === 'unauthorized') {
    return { kind: 'failed', reason: { kind: 'sign_in_required', resume } };
  }
  if (error.kind === 'forbidden') {
    return { kind: 'failed', reason: { kind: 'not_permitted', resume } };
  }
  return null;
}

function resumeAt(resume: ResumePoint, now: number): UploadState {
  switch (resume.step) {
    case 'send':
      return waitToSend(0, now);
    case 'reconcile':
      return waitToReconcile(0, now, resume.startedAt);
    case 'check':
      return startProcessing(resume.taskId, now, resume.startedAt);
  }
}

function afterSendFailure(state: StateOf<'sending'>, error: PaperlessError, now: number): UploadState {
  const retryAt = now + sendRetryDelay(state.attempt);
  switch (error.kind) {
    case 'network':
    case 'timeout':
    case 'server':
    case 'invalid_response':
      return waitToReconcile(state.attempt + 1, retryAt, state.startedAt);
    case 'rate_limited':
      return waitToSend(state.attempt + 1, retryAt);
    case 'unauthorized':
      return { kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'send' } } };
    case 'forbidden':
      return { kind: 'failed', reason: { kind: 'not_permitted', resume: { step: 'send' } } };
    case 'not_found':
      return { kind: 'failed', reason: { kind: 'rejected', status: 404, message: '' } };
    case 'rejected':
      return { kind: 'failed', reason: { kind: 'rejected', status: error.status, message: error.body } };
  }
}

function nextCheck(state: StateOf<'processing'>, now: number, answered: boolean): UploadState {
  const checks = state.checks + 1;
  const failedChecks = answered ? 0 : state.failedChecks + 1;
  if (failedChecks >= failedCheckLimit) {
    return waitToReconcile(0, now, state.startedAt);
  }
  return { ...state, checks, failedChecks, nextCheckAt: now + pollDelay(checks) };
}

type Handler<State extends StateKind, Event extends EventKind> = (
  state: StateOf<State>,
  event: EventOf<Event>,
  now: number,
) => UploadState | 'refused';

type TransitionTable = {
  [State in StateKind]: { [Event in EventKind]?: Handler<State, Event> };
};

const transitions: TransitionTable = {
  preparing: {
    prepared: (_state, _event, now) => waitToSend(0, now),
    prepareFailed: (_state, event) => ({
      kind: 'failed',
      reason: { kind: 'pdf_failed', message: event.message },
    }),
  },
  waiting: {
    sendStarted: (state, _event, now) =>
      !state.maybeSent && now >= state.notBefore
        ? { kind: 'sending', attempt: state.attempt, startedAt: now }
        : 'refused',
    fileMissing: (state) =>
      state.maybeSent ? 'refused' : { kind: 'failed', reason: { kind: 'file_missing' } },
    foundDocument: (state, event) =>
      state.maybeSent ? { kind: 'done', documentId: event.documentId } : 'refused',
    foundTask: (state, event, now) => (state.maybeSent ? startProcessing(event.taskId, now, now) : 'refused'),
    notFound: (state, _event, now) => {
      if (!state.maybeSent) {
        return 'refused';
      }
      if (now - state.startedAt < sentGraceWindow) {
        return { ...state, notBefore: now + graceRecheckDelay };
      }
      return waitToSend(state.attempt, now);
    },
    reconcileFailed: (state, event, now) => {
      if (!state.maybeSent) {
        return 'refused';
      }
      return (
        accessFailure(event.error, { step: 'reconcile', startedAt: state.startedAt }) ??
        waitToReconcile(state.attempt + 1, now + sendRetryDelay(state.attempt), state.startedAt)
      );
    },
  },
  sending: {
    sendAccepted: (_state, event, now) => startProcessing(event.taskId, now + pollDelay(0), now),
    sendFailed: (state, event, now) => afterSendFailure(state, event.error, now),
    interrupted: (state, _event, now) => waitToReconcile(state.attempt + 1, now, state.startedAt),
  },
  processing: {
    taskPending: (state, _event, now) => nextCheck(state, now, true),
    taskUnknown: (state, _event, now) => nextCheck(state, now, false),
    checkFailed: (state, event, now) =>
      accessFailure(event.error, { step: 'check', taskId: state.taskId, startedAt: state.startedAt }) ??
      nextCheck(state, now, false),
    taskSucceeded: (_state, event) => ({ kind: 'done', documentId: event.documentId }),
    taskFailed: (_state, event) => ({
      kind: 'failed',
      reason: { kind: 'consumption_failed', message: event.message },
    }),
  },
  done: {},
  failed: {
    signedIn: (state, _event, now) =>
      state.reason.kind === 'sign_in_required' ? resumeAt(state.reason.resume, now) : 'refused',
    retryRequested: (state, _event, now) => {
      switch (state.reason.kind) {
        case 'rejected':
        case 'consumption_failed':
          return waitToSend(0, now);
        case 'not_permitted':
          return resumeAt(state.reason.resume, now);
        default:
          return 'refused';
      }
    },
  },
};

export function transition(state: UploadState, event: UploadEvent, now: number): UploadState {
  const handler = transitions[state.kind][event.kind] as Handler<StateKind, EventKind> | undefined;
  const next = handler ? handler(state, event, now) : 'refused';
  if (next === 'refused') {
    throw new InvalidTransition(state, event);
  }
  return next;
}

export type NextStep =
  | { effect: 'prepare' | 'reconcile' | 'send'; at: number }
  | { effect: 'check'; taskId: TaskId; at: number }
  | { effect: 'none' };

export function nextStep(job: UploadJob): NextStep {
  const state = job.state;
  switch (state.kind) {
    case 'preparing':
      return { effect: 'prepare', at: job.createdAt };
    case 'waiting':
      return { effect: state.maybeSent ? 'reconcile' : 'send', at: state.notBefore };
    case 'processing':
      return { effect: 'check', taskId: state.taskId, at: state.nextCheckAt };
    case 'sending':
    case 'done':
    case 'failed':
      return { effect: 'none' };
  }
}

export function canDelete(state: UploadState): boolean {
  return state.kind === 'waiting' || state.kind === 'failed' || state.kind === 'done';
}

export function newUploadJob(details: {
  id: JobId;
  accountId: AccountId;
  batchId: BatchId;
  fields: UploadFields;
  pageCount: number;
  now: number;
}): UploadJob {
  return {
    id: details.id,
    accountId: details.accountId,
    batchId: details.batchId,
    fields: details.fields,
    pdfPath: null,
    pageCount: details.pageCount,
    createdAt: details.now,
    updatedAt: details.now,
    state: { kind: 'preparing' },
  };
}
