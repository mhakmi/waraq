import { describe, expect, test } from 'vitest';

import type { PaperlessError } from '../paperless/errors';
import type { DocumentId, TaskId } from '../paperless/schemas';
import {
  accepts,
  AccountId,
  BatchId,
  canDelete,
  InvalidTransition,
  JobId,
  newUploadJob,
  nextStep,
  failedCheckLimit,
  pollDelay,
  sendRetryDelay,
  sentGraceWindow,
  stepIsDue,
  transition,
  type UploadEvent,
  type UploadJob,
  type UploadState,
} from './machine';

const now = 1_000_000;
const earlier = now - 4000;
const later = now + 4000;
const startedAt = now - 1000;
const unsureSince = now - 1000;
const unsureLongAgo = now - sentGraceWindow;
const taskId = 'task-1' as TaskId;
const documentId = 42 as DocumentId;
const offline: PaperlessError = { kind: 'network', message: 'offline' };

const states = {
  preparing: { kind: 'preparing' },
  waitingReady: { kind: 'waiting', attempt: 2, notBefore: earlier, maybeSent: false },
  waitingEarly: { kind: 'waiting', attempt: 2, notBefore: later, maybeSent: false },
  waitingMaybeSent: { kind: 'waiting', attempt: 2, notBefore: earlier, maybeSent: true, unsureSince },
  waitingMaybeSentLongAgo: { kind: 'waiting', attempt: 2, notBefore: earlier, maybeSent: true, unsureSince: unsureLongAgo },
  sending: { kind: 'sending', attempt: 2, startedAt },
  processing: { kind: 'processing', taskId, checks: 3, failedChecks: 0, nextCheckAt: earlier, startedAt },
  processingUnanswered: {
    kind: 'processing',
    taskId,
    checks: 12,
    failedChecks: failedCheckLimit - 1,
    nextCheckAt: earlier,
    startedAt,
  },
  done: { kind: 'done', documentId },
  failedSignIn: { kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'send' } } },
  failedSignInReconcile: { kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'reconcile', unsureSince } } },
  failedSignInCheck: { kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'check', taskId, startedAt } } },
  failedNotPermitted: { kind: 'failed', reason: { kind: 'not_permitted', resume: { step: 'reconcile', unsureSince } } },
  failedRejected: { kind: 'failed', reason: { kind: 'rejected', status: 413, message: 'too big' } },
  failedConsumption: { kind: 'failed', reason: { kind: 'consumption_failed', message: 'bad pdf' } },
  failedFileMissing: { kind: 'failed', reason: { kind: 'file_missing' } },
  failedPdf: { kind: 'failed', reason: { kind: 'pdf_failed', message: 'no pages' } },
  failedUnreadable: { kind: 'failed', reason: { kind: 'unreadable', message: 'state is not JSON' } },
} satisfies Record<string, UploadState>;

const events = {
  prepared: { kind: 'prepared' },
  prepareFailed: { kind: 'prepareFailed', message: 'no pages' },
  fileMissing: { kind: 'fileMissing' },
  sendStarted: { kind: 'sendStarted' },
  sendAccepted: { kind: 'sendAccepted', taskId },
  sendFailed: { kind: 'sendFailed', error: offline },
  interrupted: { kind: 'interrupted' },
  foundDocument: { kind: 'foundDocument', documentId },
  foundTask: { kind: 'foundTask', taskId },
  notFound: { kind: 'notFound' },
  reconcileFailed: { kind: 'reconcileFailed', error: offline },
  taskPending: { kind: 'taskPending' },
  taskUnknown: { kind: 'taskUnknown' },
  checkFailed: { kind: 'checkFailed', error: offline },
  taskSucceeded: { kind: 'taskSucceeded', documentId },
  taskFailed: { kind: 'taskFailed', message: 'bad pdf' },
  signedIn: { kind: 'signedIn' },
  retryRequested: { kind: 'retryRequested' },
} satisfies Record<UploadEvent['kind'], UploadEvent>;

type StateName = keyof typeof states;
type EventName = keyof typeof events;

const accepted: Record<StateName, EventName[]> = {
  preparing: ['prepared', 'prepareFailed', 'fileMissing'],
  waitingReady: ['sendStarted', 'fileMissing'],
  waitingEarly: ['fileMissing'],
  waitingMaybeSent: ['foundDocument', 'foundTask', 'notFound', 'reconcileFailed'],
  waitingMaybeSentLongAgo: ['foundDocument', 'foundTask', 'notFound', 'reconcileFailed'],
  sending: ['sendAccepted', 'sendFailed', 'interrupted'],
  processing: ['taskPending', 'taskUnknown', 'checkFailed', 'taskSucceeded', 'taskFailed'],
  processingUnanswered: ['taskPending', 'taskUnknown', 'checkFailed', 'taskSucceeded', 'taskFailed'],
  done: [],
  failedSignIn: ['signedIn'],
  failedSignInReconcile: ['signedIn'],
  failedSignInCheck: ['signedIn'],
  failedNotPermitted: ['retryRequested'],
  failedRejected: ['retryRequested'],
  failedConsumption: ['retryRequested'],
  failedFileMissing: [],
  failedPdf: [],
  failedUnreadable: [],
};

const freshWait: UploadState = { kind: 'waiting', attempt: 0, notBefore: now, maybeSent: false };

describe('transitions the table accepts', () => {
  test.each<[StateName, UploadEvent, UploadState]>([
    ['preparing', events.prepared, freshWait],
    ['preparing', events.prepareFailed, { kind: 'failed', reason: { kind: 'pdf_failed', message: 'no pages' } }],
    ['preparing', events.fileMissing, { kind: 'failed', reason: { kind: 'file_missing' } }],
    ['waitingReady', events.sendStarted, { kind: 'sending', attempt: 2, startedAt: now }],
    ['waitingReady', events.fileMissing, { kind: 'failed', reason: { kind: 'file_missing' } }],
    ['waitingEarly', events.fileMissing, { kind: 'failed', reason: { kind: 'file_missing' } }],
    ['sending', events.sendAccepted, { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: now + 2000, startedAt: now }],
    ['sending', events.interrupted, { kind: 'waiting', attempt: 3, notBefore: now, maybeSent: true, unsureSince: now }],
    ['waitingMaybeSent', events.foundDocument, { kind: 'done', documentId }],
    ['waitingMaybeSent', events.foundTask, { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: now, startedAt: unsureSince }],
    ['waitingMaybeSent', events.notFound, { kind: 'waiting', attempt: 2, notBefore: now + 30_000, maybeSent: true, unsureSince }],
    ['waitingMaybeSentLongAgo', events.notFound, { kind: 'waiting', attempt: 2, notBefore: now + 20_000, maybeSent: false }],
    ['waitingMaybeSent', events.reconcileFailed, { kind: 'waiting', attempt: 3, notBefore: now + 20_000, maybeSent: true, unsureSince }],
    ['processing', events.taskPending, { kind: 'processing', taskId, checks: 4, failedChecks: 0, nextCheckAt: now + 32_000, startedAt }],
    ['processing', events.taskUnknown, { kind: 'processing', taskId, checks: 4, failedChecks: 1, nextCheckAt: now + 32_000, startedAt }],
    ['processing', events.checkFailed, { kind: 'processing', taskId, checks: 4, failedChecks: 1, nextCheckAt: now + 32_000, startedAt }],
    ['processingUnanswered', events.taskPending, { kind: 'processing', taskId, checks: 13, failedChecks: 0, nextCheckAt: now + 60_000, startedAt }],
    ['processingUnanswered', events.taskUnknown, { kind: 'waiting', attempt: 0, notBefore: now, maybeSent: true, unsureSince: now }],
    ['processingUnanswered', events.checkFailed, { kind: 'waiting', attempt: 0, notBefore: now, maybeSent: true, unsureSince: now }],
    ['processing', events.taskSucceeded, { kind: 'done', documentId }],
    ['processing', events.taskFailed, { kind: 'failed', reason: { kind: 'consumption_failed', message: 'bad pdf' } }],
    ['failedSignIn', events.signedIn, freshWait],
    ['failedSignInReconcile', events.signedIn, { kind: 'waiting', attempt: 0, notBefore: now, maybeSent: true, unsureSince }],
    ['failedSignInCheck', events.signedIn, { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: now, startedAt }],
    ['failedNotPermitted', events.retryRequested, { kind: 'waiting', attempt: 0, notBefore: now, maybeSent: true, unsureSince }],
    ['failedRejected', events.retryRequested, freshWait],
    ['failedConsumption', events.retryRequested, freshWait],
  ])('%s + %o', (stateName, event, expected) => {
    expect(transition(states[stateName], event, now)).toEqual(expected);
  });
});

describe('a failed send', () => {
  const retryMaybeSent: UploadState = { kind: 'waiting', attempt: 3, notBefore: now + 20_000, maybeSent: true, unsureSince: now };

  test.each<[PaperlessError, UploadState]>([
    [{ kind: 'network', message: 'offline' }, retryMaybeSent],
    [{ kind: 'timeout' }, retryMaybeSent],
    [{ kind: 'server', status: 502 }, retryMaybeSent],
    [{ kind: 'invalid_response', message: 'not json' }, retryMaybeSent],
    [{ kind: 'rate_limited' }, { kind: 'waiting', attempt: 3, notBefore: now + 20_000, maybeSent: false }],
    [{ kind: 'unauthorized' }, { kind: 'failed', reason: { kind: 'sign_in_required', resume: { step: 'send' } } }],
    [{ kind: 'forbidden' }, { kind: 'failed', reason: { kind: 'not_permitted', resume: { step: 'send' } } }],
    [
      { kind: 'rejected', status: 413, body: 'Request Entity Too Large' },
      { kind: 'failed', reason: { kind: 'rejected', status: 413, message: 'Request Entity Too Large' } },
    ],
    [{ kind: 'not_found' }, { kind: 'failed', reason: { kind: 'rejected', status: 404, message: '' } }],
  ])('with %o', (error, expected) => {
    expect(transition(states.sending, { kind: 'sendFailed', error }, now)).toEqual(expected);
  });

  test.each<UploadEvent>([events.sendFailed, events.interrupted])(
    'that started long before %o still gets the grace recheck',
    (event) => {
      const longSend: UploadState = { kind: 'sending', attempt: 2, startedAt: now - 3 * sentGraceWindow };
      const unsure = transition(longSend, event, now);
      expect(unsure).toMatchObject({ kind: 'waiting', maybeSent: true, unsureSince: now });

      const recheckAt = now + sendRetryDelay(2);
      expect(transition(unsure, events.notFound, recheckAt)).toEqual({
        kind: 'waiting',
        attempt: 3,
        notBefore: recheckAt + 30_000,
        maybeSent: true,
        unsureSince: now,
      });
    },
  );
});

describe('a failed reconcile', () => {
  const resume = { step: 'reconcile', unsureSince } as const;
  const retryMaybeSent: UploadState = { kind: 'waiting', attempt: 3, notBefore: now + 20_000, maybeSent: true, unsureSince };

  test.each<[PaperlessError, UploadState]>([
    [offline, retryMaybeSent],
    [{ kind: 'timeout' }, retryMaybeSent],
    [{ kind: 'server', status: 502 }, retryMaybeSent],
    [{ kind: 'rate_limited' }, retryMaybeSent],
    [{ kind: 'invalid_response', message: 'not json' }, retryMaybeSent],
    [{ kind: 'unauthorized' }, { kind: 'failed', reason: { kind: 'sign_in_required', resume } }],
    [{ kind: 'forbidden' }, { kind: 'failed', reason: { kind: 'not_permitted', resume } }],
  ])('with %o', (error, expected) => {
    expect(transition(states.waitingMaybeSent, { kind: 'reconcileFailed', error }, now)).toEqual(expected);
  });
});

describe('a failed check', () => {
  const resume = { step: 'check', taskId, startedAt } as const;
  const checkAgain: UploadState = { kind: 'processing', taskId, checks: 4, failedChecks: 1, nextCheckAt: now + 32_000, startedAt };

  test.each<[PaperlessError, UploadState]>([
    [offline, checkAgain],
    [{ kind: 'server', status: 502 }, checkAgain],
    [{ kind: 'unauthorized' }, { kind: 'failed', reason: { kind: 'sign_in_required', resume } }],
    [{ kind: 'forbidden' }, { kind: 'failed', reason: { kind: 'not_permitted', resume } }],
  ])('with %o', (error, expected) => {
    expect(transition(states.processing, { kind: 'checkFailed', error }, now)).toEqual(expected);
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
    expect(accepts(states[stateName], events[eventName], now)).toBe(false);
  });
});

describe('accepts', () => {
  const allowed: [StateName, EventName][] = [];
  for (const stateName of Object.keys(states) as StateName[]) {
    for (const eventName of accepted[stateName]) {
      allowed.push([stateName, eventName]);
    }
  }

  test.each(allowed)('%s accepts %s', (stateName, eventName) => {
    expect(accepts(states[stateName], events[eventName], now)).toBe(true);
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
    input: { kind: 'pages', pages: [{ uri: 'file:///page-1.jpg', rotation: 0 }] },
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
    ['waitingEarly', { effect: 'send', at: later }],
    ['waitingMaybeSent', { effect: 'reconcile', at: earlier }],
    ['sending', { effect: 'none' }],
    ['processing', { effect: 'check', taskId, at: earlier }],
    ['done', { effect: 'none' }],
    ['failedRejected', { effect: 'none' }],
  ])('%s', (stateName, expected) => {
    expect(nextStep(jobIn(states[stateName]))).toEqual(expected);
  });
});

describe('stepIsDue', () => {
  const minute = 60_000;

  test.each<[string, ReturnType<typeof nextStep>, boolean]>([
    ['a send whose time has come', { effect: 'send', at: now }, true],
    ['a send due in a minute', { effect: 'send', at: now + minute }, false],
    ['a send due in exactly the longest retry', { effect: 'send', at: now + 30 * minute }, false],
    ['a send further ahead than any retry', { effect: 'send', at: now + 30 * minute + 1 }, true],
    ['a lookup further ahead than any retry', { effect: 'reconcile', at: now + 30 * minute + 1 }, true],
    ['a check due in a minute', { effect: 'check', taskId, at: now + minute }, false],
    ['a check further ahead than any poll', { effect: 'check', taskId, at: now + minute + 1 }, true],
    ['a prepare queued in the future', { effect: 'prepare', at: now + 1 }, true],
    ['nothing to do', { effect: 'none' }, false],
  ])('%s', (_name, step, due) => {
    expect(stepIsDue(step, now)).toBe(due);
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
    ['failedUnreadable', true],
  ])('%s gives %s', (stateName, allowed) => {
    expect(canDelete(states[stateName])).toBe(allowed);
  });
});
