import { describe, expect, test } from 'vitest';

import { createPaperlessClient } from './client';
import failure from './fixtures/task-v10-failure.json';
import missing from './fixtures/task-v10-missing.json';
import pending from './fixtures/task-v10-pending.json';
import success from './fixtures/task-v10-success.json';
import type { TaskId } from './schemas';
import type { ServerUrl } from './url';

function clientAnswering(body: unknown) {
  return createPaperlessClient({
    baseUrl: 'https://paperless.example.com' as ServerUrl,
    auth: { kind: 'token', token: 'token' },
    fetch: async () => new Response(JSON.stringify(body), { status: 200 }),
    appendFile: () => {},
  });
}

const someTask = 'some-task' as TaskId;

describe('getTask with responses recorded from Paperless-ngx 3.3.2', () => {
  test('a queued task is pending', async () => {
    expect(await clientAnswering(pending).getTask(someTask)).toEqual({
      ok: true,
      value: { kind: 'pending' },
    });
  });

  test('a finished task gives the new document id', async () => {
    expect(await clientAnswering(success).getTask(someTask)).toEqual({
      ok: true,
      value: { kind: 'succeeded', documentId: 1 },
    });
  });

  test('a failed task gives the server error message', async () => {
    const result = await clientAnswering(failure).getTask(someTask);
    expect(result).toEqual({
      ok: true,
      value: { kind: 'failed', message: failure.results[0].result_data.error_message },
    });
  });

  test('a task the server does not know is unknown', async () => {
    expect(await clientAnswering(missing).getTask(someTask)).toEqual({
      ok: true,
      value: { kind: 'unknown' },
    });
  });
});

describe('findUnfinishedConsumeTask', () => {
  test('matches the uploaded file name', async () => {
    const filename = pending.results[0].input_data.filename;
    expect(await clientAnswering(pending).findUnfinishedConsumeTask(filename)).toEqual({
      ok: true,
      value: pending.results[0].task_id,
    });
  });

  test('returns null when no task has that file name', async () => {
    expect(await clientAnswering(pending).findUnfinishedConsumeTask('other.pdf')).toEqual({
      ok: true,
      value: null,
    });
  });
});
