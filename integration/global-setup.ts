import type { TestProject } from 'vitest/node';

import { obtainToken } from '../src/paperless/client';
import { normalizeServerUrl, type ServerUrl } from '../src/paperless/url';

declare module 'vitest' {
  export interface ProvidedContext {
    serverUrl: ServerUrl;
    token: string;
  }
}

const waitLimitMs = 4 * 60_000;

async function waitUntilAnswering(url: string): Promise<void> {
  const deadline = Date.now() + waitLimitMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/`);
      if (response.status < 500) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`No Paperless-ngx at ${url}. Start it with: dev/test-server.sh up`);
}

export default async function setup(project: TestProject) {
  const parsed = normalizeServerUrl(process.env.PAPERLESS_TEST_URL ?? 'http://localhost:8011');
  if (!parsed.ok) {
    throw new Error(`PAPERLESS_TEST_URL is not a server URL: ${parsed.error.kind}`);
  }
  const serverUrl = parsed.value;
  await waitUntilAnswering(serverUrl);

  // The token endpoint allows five requests a minute, so the whole suite shares one token.
  const token = await obtainToken(
    { baseUrl: serverUrl, fetch },
    { username: 'admin', password: 'waraq-dev-password' },
  );
  if (!token.ok) {
    throw new Error(`Could not sign in to the test server: ${JSON.stringify(token.error)}`);
  }

  project.provide('serverUrl', serverUrl);
  project.provide('token', token.value);
}
