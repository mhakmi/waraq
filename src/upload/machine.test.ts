import { describe, expect, test } from 'vitest';

import type { PaperlessError } from '../paperless/errors';
import type { DocumentId, TaskId } from '../paperless/schemas';
import {
  AccountId,
  BatchId,
  canDelete,
  InvalidTransition,
  JobId,
  newUploadJob,
  nextStep,
  pollDelay,
  sendRetryDelay,
  transition,
  type UploadEvent,
  type UploadJob,
  type UploadState,
} from './machine';

const now = 5000;
const taskId = 'task-1' as TaskId;
const documentId = 42 as DocumentId;

const states = {
  preparing: { kind: 'preparing' },
  waitingReady: { kind: 'waiting', attempt: 2, notBefore: 1000, maybeSent: false },
  waitingEarly: { kind: 'waiting', attempt: 2, notBefore: 9000, maybeSent: false },
  waitingMaybeSent: { kind: 'waiting', attempt: 2, notBefore: 1000, maybeSent: true },
  sending: { kind: 'sending', attempt: 2, startedAt: 4000 },
  processing: { kind: 'processing', taskId, checks: 3, nextCheckAt: 4000 },
  done: { kind: 'done', documentId },
  failedSignIn: { kind: 'failed', reason: { kind: 'sign_in_required' } },
  failedRejected: { kind: 'failed', reason: { kind: 'rejected', status: 413, message: 'too big' } },
  failedConsumption: { kind: 'failed', reason: { kind: 'consumption_failed', message: 'bad pdf' } },
  failedFileMissing: { kind: 'failed', reason: { kind: 'file_missing' } },
  failedPdf: { kind: 'failed', reason: { kind: 'pdf_failed', message: 'no pages' } },
} satisfies Record<string, UploadState>;

const events = {
  prepared: { kind: 'prepared' },
  prepareFailed: { kind: 'prepareFailed', message: 'no pages' },
  fileMissing: { kind: 'fileMissing' },
  sendStarted: { kind: 'sendStarted' },
  sendAccepted: { kind: 'sendAccepted', taskId },
  sendFailed: { kind: 'sendFailed', error: { kind: 'network', message: 'offline' } },
  interrupted: { kind: 'interrupted' },
  foundDocument: { kind: 'foundDocument', documentId },
  foundTask: { kind: 'foundTask', taskId },
  notFound: { kind: 'notFound' },
  reconcileFailed: { kind: 'reconcileFailed' },
  taskPending: { kind: 'taskPending' },
  checkFailed: { kind: 'checkFailed' },
  taskSucceeded: { kind: 'taskSucceeded', documentId },
  taskFailed: { kind: 'taskFailed', message: 'bad pdf' },
  signedIn: { kind: 'signedIn' },
  retryRequested: { kind: 'retryRequested' },
} satisfies Record<UploadEvent['kind'], UploadEvent>;

type StateName = keyof typeof states;
type EventName = keyof typeof events;

const accepted: Record<StateName, EventName[]> = {
  preparing: ['prepared', 'prepareFailed'],
  waitingReady: ['sendStarted', 'fileMissing'],
  waitingEarly: ['fileMissing'],
  waitingMaybeSent: ['foundDocument', 'foundTask', 'notFound', 'reconcileFailed'],
  sending: ['sendAccepted', 'sendFailed', 'interrupted'],
  processing: ['taskPending', 'checkFailed', 'taskSucceeded', 'taskFailed'],
  done: [],
  failedSignIn: ['signedIn'],
  failedRejected: ['retryRequested'],
  failedConsumption: ['retryRequested'],
  failedFileMissing: [],
  failedPdf: [],
};

const freshWait: UploadState = { kind: 'waiting', attempt: 0, notBefore: now, maybeSent: false };

describe('transitions the table accepts', () => {
  test.each<[StateName, UploadEvent, UploadState]>([
    ['preparing', events.prepared, freshWait],
    ['preparing', events.prepareFailed, { kind: 'failed', reason: { kind: 'pdf_failed', message: 'no pages' } }],
    ['waitingReady', events.sendStarted, { kind: 'sending', attempt: 2, startedAt: now }],
    ['waitingReady', events.fileMissing, { kind: 'failed', reason: { kind: 'file_missing' } }],
    ['waitingEarly', events.fileMissing, { kind: 'failed', reason: { kind: 'file_missing' } }],
    ['sending', events.sendAccepted, { kind: 'processing', taskId, checks: 0, nextCheckAt: now + 2000 }],
    ['sending', events.interrupted, { kind: 'waiting', attempt: 2, notBefore: now, maybeSent: true }],
    ['waitingMaybeSent', events.foundDocument, { kind: 'done', documentId }],
    ['waitingMaybeSent', events.foundTask, { kind: 'processing', taskId, checks: 0, nextCheckAt: now }],
    ['waitingMaybeSent', events.notFound, { kind: 'waiting', attempt: 2, notBefore: 1000, maybeSent: false }],
    ['waitingMaybeSent', events.reconcileFailed, { kind: 'waiting', attempt: 3, notBefore: now + 20_000, maybeSent: true }],
    ['processing', events.taskPending, { kind: 'processing', taskId, checks: 4, nextCheckAt: now + 32_000 }],
    ['processing', events.checkFailed, { kind: 'processing', taskId, checks: 4, nextCheckAt: now + 32_000 }],
    ['processing', events.taskSucceeded, { kind: 'done', documentId }],
    ['processing', events.taskFailed, { kind: 'failed', reason: { kind: 'consumption_failed', message: 'bad pdf' } }],
    ['failedSignIn', events.signedIn, freshWait],
    ['failedRejected', events.retryRequested, freshWait],
    ['failedConsumption', events.retryRequested, freshWait],
  ])('%s + %o', (stateName, event, expected) => {
    expect(transition(states[stateName], event, now)).toEqual(expected);
  });
});

describe('a failed send', () => {
  const retryMaybeSent: UploadState = { kind: 'waiting', attempt: 3, notBefore: now + 20_000, maybeSent: true };

  test.each<[PaperlessError, UploadState]>([
    [{ kind: 'network', message: 'offline' }, retryMaybeSent],
    [{ kind: 'timeout' }, retryMaybeSent],
    [{ kind: 'server', status: 502 }, retryMaybeSent],
    [{ kind: 'invalid_response', message: 'not json' }, retryMaybeSent],
    [{ kind: 'rate_limited' }, { kind: 'waiting', attempt: 3, notBefore: now + 20_000, maybeSent: false }],
    [{ kind: 'unauthorized' }, { kind: 'failed', reason: { kind: 'sign_in_required' } }],
    [{ kind: 'forbidden' }, { kind: 'failed', reason: { kind: 'sign_in_required' } }],
    [
      { kind: 'rejected', status: 413, body: 'Request Entity Too Large' },
      { kind: 'failed', reason: { kind: 'rejected', status: 413, message: 'Request Entity Too Large' } },
    ],
    [{ kind: 'not_found' }, { kind: 'failed', reason: { kind: 'rejected', status: 404, message: '' } }],
  ])('with %o', (error, expected) => {
    expect(transition(states.sending, { kind: 'sendFailed', error }, now)).toEqual(expected);
  });
});

describe('transitions the table refuses', () => {
  const refused: [StateName, EventName][] = [];
  for (const stateName of Object.keys(states) as StateName[]) {
    for (const eventName of Object.keys(events) as EventName[]) {
      if (!accepted[stateName].includes(eventName)) {
        refused.push([stateName, eventName]);
      }
    }
  }

  test.each(refused)('%s refuses %s', (stateName, eventName) => {
    expect(() => transition(states[stateName], events[eventName], now)).toThrow(InvalidTransition);
  });
});

describe('backoff', () => {
  test.each([
    [0, 5_000],
    [1, 10_000],
    [5, 160_000],
    [8, 1_280_000],
    [9, 1_800_000],
    [30, 1_800_000],
  ])('send retry %i waits %i ms', (attempt, delay) => {
    expect(sendRetryDelay(attempt)).toBe(delay);
  });

  test.each([
    [0, 2_000],
    [1, 4_000],
    [4, 32_000],
    [5, 60_000],
    [20, 60_000],
  ])('check %i waits %i ms', (checks, delay) => {
    expect(pollDelay(checks)).toBe(delay);
  });
});

function jobIn(state: UploadState): UploadJob {
  const job = newUploadJob({
    id: JobId.parse('0190a000-0000-7000-8000-000000000001'),
    accountId: AccountId.parse('account'),
    batchId: BatchId.parse('0190a000-0000-7000-8000-000000000002'),
    pageCount: 1,
    now: 100,
    fields: {
      title: 'Letter',
      created: null,
      correspondentId: null,
      documentTypeId: null,
      storagePathId: null,
      tagIds: [],
      archiveSerialNumber: null,
      customFields: [],
    },
  });
  return { ...job, state };
}

describe('nextStep', () => {
  test.each<[StateName, ReturnType<typeof nextStep>]>([
    ['preparing', { effect: 'prepare', at: 100 }],
    ['waitingEarly', { effect: 'send', at: 9000 }],
    ['waitingMaybeSent', { effect: 'reconcile', at: 1000 }],
    ['sending', { effect: 'none' }],
    ['processing', { effect: 'check', taskId, at: 4000 }],
    ['done', { effect: 'none' }],
    ['failedRejected', { effect: 'none' }],
  ])('%s', (stateName, expected) => {
    expect(nextStep(jobIn(states[stateName]))).toEqual(expected);
  });
});

describe('canDelete', () => {
  test.each<[StateName, boolean]>([
    ['preparing', false],
    ['waitingReady', true],
    ['sending', false],
    ['processing', false],
    ['done', true],
    ['failedConsumption', true],
  ])('%s gives %s', (stateName, allowed) => {
    expect(canDelete(states[stateName])).toBe(allowed);
  });
});
