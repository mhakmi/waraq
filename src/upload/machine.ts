import { z } from 'zod';

import { AccountId } from '../account/id';
import type { UploadFields } from '../paperless/client';
import type { PaperlessError } from '../paperless/errors';
import type { DocumentId, TaskId } from '../paperless/schemas';

export { AccountId };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const JobId = z.string().regex(uuidPattern).brand<'JobId'>();
export type JobId = z.infer<typeof JobId>;

export const BatchId = z.string().regex(uuidPattern).brand<'BatchId'>();
export type BatchId = z.infer<typeof BatchId>;

export type PageRotation = 0 | 90 | 180 | 270;

export type PageImage = { uri: string; rotation: PageRotation };

export type JobInput = { kind: 'pages'; pages: PageImage[] } | { kind: 'pdf'; uri: string; thumbnailUri: string };

export function previewImage(input: JobInput): PageImage | null {
  if (input.kind === 'pdf') {
    return { uri: input.thumbnailUri, rotation: 0 };
  }
  return input.pages[0] ?? null;
}

export type ResumePoint =
  | { step: 'send' }
  | { step: 'reconcile'; unsureSince: number }
  | { step: 'check'; taskId: TaskId; startedAt: number };

export type FailureReason =
  | { kind: 'sign_in_required'; resume: ResumePoint }
  | { kind: 'not_permitted'; resume: ResumePoint }
  | { kind: 'rejected'; status: number; message: string }
  | { kind: 'consumption_failed'; message: string }
  | { kind: 'file_missing' }
  | { kind: 'pdf_failed'; message: string }
  | { kind: 'unreadable'; message: string };

export type UploadState =
  | { kind: 'preparing' }
  | { kind: 'waiting'; attempt: number; notBefore: number; maybeSent: false }
  | { kind: 'waiting'; attempt: number; notBefore: number; maybeSent: true; unsureSince: number }
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
  input: JobInput;
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

// A proxy can hand the body on after the phone gave up, so a send that got no reply may still land.
export const sentGraceWindow = 2 * minute;
const graceRecheckDelay = 30 * second;
export const failedCheckLimit = 10;

const longestSendRetry = 30 * minute;
const longestPoll = minute;

export function sendRetryDelay(attempt: number): number {
  return Math.min(longestSendRetry, 5 * second * 2 ** attempt);
}

export function pollDelay(checks: number): number {
  return Math.min(longestPoll, 2 * second * 2 ** checks);
}

export function uploadFilename(id: JobId): string {
  return `${id}.pdf`;
}

function waitToSend(attempt: number, notBefore: number): UploadState {
  return { kind: 'waiting', attempt, notBefore, maybeSent: false };
}

function waitToReconcile(attempt: number, notBefore: number, unsureSince: number): UploadState {
  return { kind: 'waiting', attempt, notBefore, maybeSent: true, unsureSince };
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
      return waitToReconcile(0, now, resume.unsureSince);
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
      return waitToReconcile(state.attempt + 1, retryAt, now);
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
    return waitToReconcile(0, now, now);
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
    fileMissing: () => ({ kind: 'failed', reason: { kind: 'file_missing' } }),
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
      state.maybeSent ? startProcessing(event.taskId, now, state.unsureSince) : 'refused',
    notFound: (state, _event, now) => {
      if (!state.maybeSent) {
        return 'refused';
      }
      if (now - state.unsureSince < sentGraceWindow) {
        return { ...state, notBefore: now + graceRecheckDelay };
      }
      return waitToSend(state.attempt, now + sendRetryDelay(state.attempt));
    },
    reconcileFailed: (state, event, now) => {
      if (!state.maybeSent) {
        return 'refused';
      }
      return (
        accessFailure(event.error, { step: 'reconcile', unsureSince: state.unsureSince }) ??
        waitToReconcile(state.attempt + 1, now + sendRetryDelay(state.attempt), state.unsureSince)
      );
    },
  },
  sending: {
    sendAccepted: (_state, event, now) => startProcessing(event.taskId, now + pollDelay(0), now),
    sendFailed: (state, event, now) => afterSendFailure(state, event.error, now),
    interrupted: (state, _event, now) => waitToReconcile(state.attempt + 1, now, now),
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
        case 'pdf_failed':
          return { kind: 'preparing' };
        default:
          return 'refused';
      }
    },
  },
};

function nextState(state: UploadState, event: UploadEvent, now: number): UploadState | 'refused' {
  const handler = transitions[state.kind][event.kind] as Handler<StateKind, EventKind> | undefined;
  return handler ? handler(state, event, now) : 'refused';
}

export function accepts(state: UploadState, event: UploadEvent, now: number): boolean {
  return nextState(state, event, now) !== 'refused';
}

export function transition(state: UploadState, event: UploadEvent, now: number): UploadState {
  const next = nextState(state, event, now);
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

const longestWait = {
  prepare: 0,
  send: longestSendRetry,
  reconcile: Math.max(longestSendRetry, graceRecheckDelay),
  check: longestPoll,
};

export function stepIsDue(step: NextStep, now: number): step is Exclude<NextStep, { effect: 'none' }> {
  if (step.effect === 'none') {
    return false;
  }
  const clockSetBack = step.at - now > longestWait[step.effect];
  return step.at <= now || clockSetBack;
}

export function canDelete(state: UploadState): boolean {
  return state.kind === 'waiting' || state.kind === 'failed' || state.kind === 'done';
}

export function newUploadJob(details: {
  id: JobId;
  accountId: AccountId;
  batchId: BatchId;
  fields: UploadFields;
  input: JobInput;
  pageCount: number;
  now: number;
}): UploadJob {
  return {
    id: details.id,
    accountId: details.accountId,
    batchId: details.batchId,
    fields: details.fields,
    input: details.input,
    pdfPath: null,
    pageCount: details.pageCount,
    createdAt: details.now,
    updatedAt: details.now,
    state: { kind: 'preparing' },
  };
}
