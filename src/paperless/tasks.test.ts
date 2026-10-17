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

function clientPaging(pages: unknown[]) {
  const requests: URL[] = [];
  const paging = createPaperlessClient({
    baseUrl: 'https://paperless.example.com' as ServerUrl,
    auth: { kind: 'token', token: 'token' },
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const page = Number(url.searchParams.get('page') ?? '1');
      return new Response(JSON.stringify(pages[page - 1]), { status: 200 });
    },
    appendFile: () => {},
  });
  return { paging, requests };
}

const createdAfter = new Date('2026-10-15T12:00:00Z');

describe('findConsumeTaskByFilename', () => {
  test('asks for consume tasks since the bound, newest first, whatever their status', async () => {
    const { paging, requests } = clientPaging([pending]);

    await paging.findConsumeTaskByFilename('other.pdf', createdAfter);

    expect(requests).toHaveLength(1);
    const query = requests[0].searchParams;
    expect(query.get('task_type')).toBe('consume_file');
    expect(query.get('date_created_after')).toBe('2026-10-15T12:00:00.000Z');
    expect(query.get('ordering')).toBe('-date_created');
    expect(query.has('is_complete')).toBe(false);
  });

  test('matches a finished task as well as a pending one', async () => {
    const filename = success.results[0].input_data.filename;
    const { paging } = clientPaging([success]);

    expect(await paging.findConsumeTaskByFilename(filename, createdAfter)).toEqual({
      ok: true,
      value: success.results[0].task_id,
    });
  });

  test('reads past the first page', async () => {
    const filename = pending.results[0].input_data.filename;
    const firstPage = { ...success, next: 'https://paperless.example.com/api/tasks/?page=2' };
    const { paging, requests } = clientPaging([firstPage, pending]);

    expect(await paging.findConsumeTaskByFilename(filename, createdAfter)).toEqual({
      ok: true,
      value: pending.results[0].task_id,
    });
    expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
  });

  test('returns null when no task has that file name', async () => {
    const { paging } = clientPaging([pending]);

    expect(await paging.findConsumeTaskByFilename('other.pdf', createdAfter)).toEqual({
      ok: true,
      value: null,
    });
  });
});
