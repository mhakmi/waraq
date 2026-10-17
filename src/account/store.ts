import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';

import { normalizeServerUrl, type ServerUrl } from '../paperless/url';

export type AccountId = string & { readonly __brand: 'AccountId' };

export type ServerAccount = {
  id: AccountId;
  serverUrl: ServerUrl;
  username: string;
  serverVersion: string;
  apiVersion: number;
  extraHeaders: string[];
  addedAt: number;
};

export type AccountSecrets = {
  token: string;
  headerValues: Record<string, string>;
};

export type StoredAccount = { account: ServerAccount; secrets: AccountSecrets };

const accountKey = 'account';

const StoredServerAccount = z.object({
  id: z.string().min(1),
  serverUrl: z.string(),
  username: z.string(),
  serverVersion: z.string(),
  apiVersion: z.number().int(),
  extraHeaders: z.array(z.string()),
  addedAt: z.number(),
});

const HeaderValues = z.record(z.string(), z.string());

function tokenKey(id: AccountId): string {
  return `token-${id}`;
}

function headersKey(id: AccountId): string {
  return `headers-${id}`;
}

function readJson(text: string | null): unknown {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseAccount(text: string): ServerAccount | null {
  const parsed = StoredServerAccount.safeParse(readJson(text));
  if (!parsed.success) {
    return null;
  }
  const serverUrl = normalizeServerUrl(parsed.data.serverUrl);
  if (!serverUrl.ok) {
    return null;
  }
  return { ...parsed.data, id: parsed.data.id as AccountId, serverUrl: serverUrl.value };
}

export async function loadAccount(): Promise<StoredAccount | null> {
  const text = await Storage.getItem(accountKey);
  if (text === null) {
    return null;
  }
  const account = parseAccount(text);
  const token = account === null ? null : await SecureStore.getItemAsync(tokenKey(account.id));
  if (account === null || token === null) {
    await Storage.removeItem(accountKey);
    return null;
  }
  const headerValues = HeaderValues.safeParse(readJson(await SecureStore.getItemAsync(headersKey(account.id))));
  return { account, secrets: { token, headerValues: headerValues.success ? headerValues.data : {} } };
}

export async function saveAccount({ account, secrets }: StoredAccount): Promise<void> {
  await SecureStore.setItemAsync(tokenKey(account.id), secrets.token);
  await SecureStore.setItemAsync(headersKey(account.id), JSON.stringify(secrets.headerValues));
  await Storage.setItem(accountKey, JSON.stringify(account));
}

export async function clearAccount(id: AccountId): Promise<void> {
  await Storage.removeItem(accountKey);
  await SecureStore.deleteItemAsync(tokenKey(id));
  await SecureStore.deleteItemAsync(headersKey(id));
}
