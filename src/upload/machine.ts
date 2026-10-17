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

export type FailureReason =
  | { kind: 'sign_in_required' }
  | { kind: 'rejected'; status: number; message: string }
  | { kind: 'consumption_failed'; message: string }
  | { kind: 'file_missing' }
  | { kind: 'pdf_failed'; message: string };

export type UploadState =
  | { kind: 'preparing' }
  | { kind: 'waiting'; attempt: number; notBefore: number; maybeSent: boolean }
  | { kind: 'sending'; attempt: number; startedAt: number }
  | { kind: 'processing'; taskId: TaskId; checks: number; nextCheckAt: number }
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
  | { kind: 'reconcileFailed' }
  | { kind: 'taskPending' }
  | { kind: 'checkFailed' }
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

const second = 1000;
const minute = 60 * second;

export function sendRetryDelay(attempt: number): number {
  return Math.min(30 * minute, 5 * second * 2 ** attempt);
}

export function pollDelay(checks: number): number {
  return Math.min(minute, 2 * second * 2 ** checks);
}

export function uploadFilename(id: JobId): string {
  return `${id}.pdf`;
}

function waitingFromStart(now: number): UploadState {
  return { kind: 'waiting', attempt: 0, notBefore: now, maybeSent: false };
}

function retryLater(attempt: number, now: number, maybeSent: boolean): UploadState {
  return { kind: 'waiting', attempt: attempt + 1, notBefore: now + sendRetryDelay(attempt), maybeSent };
}

function afterSendFailure(attempt: number, error: PaperlessError, now: number): UploadState {
  switch (error.kind) {
    case 'network':
    case 'timeout':
    case 'server':
    case 'invalid_response':
      return retryLater(attempt, now, true);
    case 'rate_limited':
      return retryLater(attempt, now, false);
    case 'unauthorized':
    case 'forbidden':
      return { kind: 'failed', reason: { kind: 'sign_in_required' } };
    case 'not_found':
      return { kind: 'failed', reason: { kind: 'rejected', status: 404, message: '' } };
    case 'rejected':
      return { kind: 'failed', reason: { kind: 'rejected', status: error.status, message: error.body } };
  }
}

function nextCheck(state: Extract<UploadState, { kind: 'processing' }>, now: number): UploadState {
  const checks = state.checks + 1;
  return { ...state, checks, nextCheckAt: now + pollDelay(checks) };
}

type StateKind = UploadState['kind'];
type EventKind = UploadEvent['kind'];
type StateOf<Kind extends StateKind> = Extract<UploadState, { kind: Kind }>;
type EventOf<Kind extends EventKind> = Extract<UploadEvent, { kind: Kind }>;

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
    prepared: (_state, _event, now) => waitingFromStart(now),
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
    foundTask: (state, event, now) =>
      state.maybeSent ? { kind: 'processing', taskId: event.taskId, checks: 0, nextCheckAt: now } : 'refused',
    notFound: (state) => (state.maybeSent ? { ...state, maybeSent: false } : 'refused'),
    reconcileFailed: (state, _event, now) =>
      state.maybeSent ? retryLater(state.attempt, now, true) : 'refused',
  },
  sending: {
    sendAccepted: (_state, event, now) => ({
      kind: 'processing',
      taskId: event.taskId,
      checks: 0,
      nextCheckAt: now + pollDelay(0),
    }),
    sendFailed: (state, event, now) => afterSendFailure(state.attempt, event.error, now),
    interrupted: (state, _event, now) => ({
      kind: 'waiting',
      attempt: state.attempt,
      notBefore: now,
      maybeSent: true,
    }),
  },
  processing: {
    taskPending: (state, _event, now) => nextCheck(state, now),
    checkFailed: (state, _event, now) => nextCheck(state, now),
    taskSucceeded: (_state, event) => ({ kind: 'done', documentId: event.documentId }),
    taskFailed: (_state, event) => ({
      kind: 'failed',
      reason: { kind: 'consumption_failed', message: event.message },
    }),
  },
  done: {},
  failed: {
    signedIn: (state, _event, now) =>
      state.reason.kind === 'sign_in_required' ? waitingFromStart(now) : 'refused',
    retryRequested: (state, _event, now) =>
      state.reason.kind === 'rejected' || state.reason.kind === 'consumption_failed'
        ? waitingFromStart(now)
        : 'refused',
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
