import { describe, expect, test } from 'vitest';

import { copy } from '../copy';
import type { DocumentId, TaskId } from '../paperless/schemas';
import { AccountId, BatchId, JobId, newUploadJob, type UploadJob, type UploadState } from './machine';
import { type RowLook, rowLook, unfinishedCount, uploadSections } from './rows';

const taskId = 'task-1' as TaskId;
const documentId = 42 as DocumentId;
const account = AccountId.parse('account');
const otherAccount = AccountId.parse('other-account');
const firstBatch = BatchId.parse('0190a000-0000-7000-8000-0000000000b1');
const secondBatch = BatchId.parse('0190a000-0000-7000-8000-0000000000b2');
const pdfSize = 12_345_678;

function fileBytes(path: string): number | null {
  return path === '/uploads/job.pdf' ? pdfSize : null;
}

function jobIn(state: UploadState, details: { number?: number; batchId?: BatchId; createdAt?: number; accountId?: AccountId } = {}): UploadJob {
  const job = newUploadJob({
    id: JobId.parse(`0190a000-0000-7000-8000-${String(details.number ?? 1).padStart(12, '0')}`),
    accountId: details.accountId ?? account,
    batchId: details.batchId ?? firstBatch,
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
    input: { kind: 'pages', pages: [] },
    pageCount: 1,
    now: details.createdAt ?? 0,
  });
  return { ...job, pdfPath: '/uploads/job.pdf', state };
}

describe('rowLook', () => {
  const failedWith = (reason: Extract<UploadState, { kind: 'failed' }>['reason']): UploadState => ({ kind: 'failed', reason });

  test.each<[string, UploadState, boolean, RowLook]>([
    ['preparing', { kind: 'preparing' }, true, { kind: 'preparing' }],
    ['preparing offline, since no step runs until the phone is back online', { kind: 'preparing' }, false, { kind: 'waitingOffline' }],
    ['waiting offline', { kind: 'waiting', attempt: 2, notBefore: 500, maybeSent: false }, false, { kind: 'waitingOffline' }],
    [
      'waiting offline after a send that may have landed',
      { kind: 'waiting', attempt: 2, notBefore: 500, maybeSent: true, unsureSince: 400 },
      false,
      { kind: 'waitingOffline' },
    ],
    ['waiting for its first send', { kind: 'waiting', attempt: 0, notBefore: 500, maybeSent: false }, true, { kind: 'waitingToSend' }],
    [
      'waiting to retry',
      { kind: 'waiting', attempt: 2, notBefore: 500, maybeSent: false },
      true,
      { kind: 'waitingRetry', retryAt: 500, attempt: 3 },
    ],
    [
      'looking for a send that may have landed',
      { kind: 'waiting', attempt: 2, notBefore: 500, maybeSent: true, unsureSince: 400 },
      true,
      { kind: 'waitingLookup' },
    ],
    ['sending', { kind: 'sending', attempt: 0, startedAt: 0 }, true, { kind: 'sending', progress: { sent: 3, total: 9 } }],
    [
      'processing',
      { kind: 'processing', taskId, checks: 0, failedChecks: 0, nextCheckAt: 0, startedAt: 0 },
      true,
      { kind: 'processing' },
    ],
    ['done', { kind: 'done', documentId }, true, { kind: 'done', documentId }],
    ['held for sign-in', failedWith({ kind: 'sign_in_required', resume: { step: 'send' } }), true, { kind: 'signInRequired' }],
    ['not permitted', failedWith({ kind: 'not_permitted', resume: { step: 'send' } }), true, { kind: 'notPermitted' }],
    ['too large', failedWith({ kind: 'rejected', status: 413, message: '' }), true, { kind: 'tooLarge', bytes: pdfSize }],
    ['rejected', failedWith({ kind: 'rejected', status: 400, message: 'bad tag' }), true, { kind: 'rejected', message: 'bad tag' }],
    [
      'not consumed',
      failedWith({ kind: 'consumption_failed', message: 'not a PDF' }),
      true,
      { kind: 'consumptionFailed', message: 'not a PDF' },
    ],
    ['file missing', failedWith({ kind: 'file_missing' }), true, { kind: 'fileMissing' }],
    ['PDF failed', failedWith({ kind: 'pdf_failed', message: 'out of space' }), true, { kind: 'pdfFailed', message: 'out of space' }],
    ['unreadable', failedWith({ kind: 'unreadable', message: 'not JSON' }), true, { kind: 'unreadable' }],
  ])('%s', (_name, state, online, expected) => {
    expect(rowLook(jobIn(state), online, { sent: 3, total: 9 }, fileBytes)).toEqual(expected);
  });

  test('a send with no progress yet shows no progress', () => {
    expect(rowLook(jobIn({ kind: 'sending', attempt: 0, startedAt: 0 }), true, undefined, fileBytes)).toEqual({
      kind: 'sending',
      progress: null,
    });
  });
});

describe('uploadSections', () => {
  test('groups the account jobs by batch, newest batch first, each batch in the order it was queued', () => {
    const rejected: UploadState = { kind: 'failed', reason: { kind: 'rejected', status: 400, message: 'bad' } };
    const missing: UploadState = { kind: 'failed', reason: { kind: 'file_missing' } };
    const jobs = [
      jobIn({ kind: 'done', documentId }, { number: 1, batchId: firstBatch, createdAt: 100 }),
      jobIn(missing, { number: 4, batchId: secondBatch, createdAt: 201 }),
      jobIn(rejected, { number: 3, batchId: secondBatch, createdAt: 200 }),
      jobIn({ kind: 'preparing' }, { number: 5, batchId: firstBatch, createdAt: 300, accountId: otherAccount }),
    ];

    const sections = uploadSections(jobs, account, { now: 1000, online: true, progress: new Map(), fileBytes });

    expect(
      sections.map((section) => ({
        batchId: section.batchId,
        createdAt: section.createdAt,
        rows: section.rows.map((row) => [row.job.id.slice(-1), row.canRetry, row.canDelete]),
      })),
    ).toEqual([
      { batchId: secondBatch, createdAt: 200, rows: [['3', true, true], ['4', false, true]] },
      { batchId: firstBatch, createdAt: 100, rows: [['1', false, true]] },
    ]);
  });
});

describe('unfinishedCount', () => {
  test('counts the account jobs that are not done, failed ones included', () => {
    const jobs = [
      jobIn({ kind: 'preparing' }, { number: 1 }),
      jobIn({ kind: 'failed', reason: { kind: 'file_missing' } }, { number: 2 }),
      jobIn({ kind: 'done', documentId }, { number: 3 }),
      jobIn({ kind: 'preparing' }, { number: 4, accountId: otherAccount }),
    ];

    expect(unfinishedCount(jobs, account)).toBe(2);
  });
});

describe('upload words', () => {
  const now = new Date(2026, 9, 1, 18, 0).getTime();

  test.each([
    [new Date(2026, 9, 1, 14, 14), 'Scanned today at 2:14 p.m.'],
    [new Date(2026, 8, 30, 18, 40), 'Scanned yesterday at 6:40 p.m.'],
    [new Date(2026, 8, 12, 9, 3), 'Scanned Sep 12 at 9:03 a.m.'],
    [new Date(2025, 9, 12, 9, 3), 'Scanned Oct 12, 2025 at 9:03 a.m.'],
  ])('a batch from %s is headed %s', (scanned, heading) => {
    expect(copy.uploads.batchHeading(scanned.getTime(), now)).toBe(heading);
  });

  test.each([
    [120_000, 3, 'Trying again in 2 minutes (attempt 3)'],
    [60_000, 2, 'Trying again in 1 minute (attempt 2)'],
    [10_000, 2, 'Trying again in less than a minute (attempt 2)'],
  ])('a retry in %i ms on attempt %i reads %s', (waitMs, attempt, line) => {
    expect(copy.uploads.retryIn(waitMs, attempt)).toBe(line);
  });

  test('the size limit line names the size when it is known', () => {
    expect(copy.uploads.tooLarge(pdfSize)).toBe("Your server's upload limit is smaller than this file (12.3 MB).");
    expect(copy.uploads.tooLarge(null)).toBe("Your server's upload limit is smaller than this file.");
  });
});
