import { inject } from 'vitest';

import { createPaperlessClient, type FileAppender } from '../src/paperless/client';

export const serverUrl = inject('serverUrl');
export const token = inject('token');

export const appendBlob: FileAppender<Blob> = (form, field, file, filename) => {
  form.append(field, file, filename);
};

export function clientWithToken(clientToken: string) {
  return createPaperlessClient({
    baseUrl: serverUrl,
    auth: { kind: 'token', token: clientToken },
    fetch,
    appendFile: appendBlob,
  });
}

export const client = clientWithToken(token);

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createLabel(kind: 'tags' | 'correspondents', name: string): Promise<number> {
  const response = await fetch(`${serverUrl}/api/${kind}/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(`Could not create ${kind} ${name}: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { id: number };
  return body.id;
}

export async function documentCount(): Promise<number> {
  const result = await client.listDocuments({ pageSize: 1 });
  if (!result.ok) {
    throw new Error(`Could not count documents: ${JSON.stringify(result.error)}`);
  }
  return result.value.count;
}

export async function eventually<Value>(
  attempt: () => Promise<Value | null>,
  limitMs = 120_000,
): Promise<Value> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    const value = await attempt();
    if (value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Gave up after ${limitMs} ms`);
}
