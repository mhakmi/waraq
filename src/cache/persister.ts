import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import Storage from 'expo-sqlite/kv-store';

const storageKey = 'query-cache';
const writeDelayMs = 1000;

let pending: PersistedClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function writePending(): Promise<void> {
  timer = null;
  const client = pending;
  pending = null;
  if (client !== null) {
    await Storage.setItem(storageKey, JSON.stringify(client));
  }
}

export const queryPersister: Persister = {
  persistClient(client) {
    pending = client;
    timer ??= setTimeout(writePending, writeDelayMs);
  },
  async restoreClient() {
    const text = await Storage.getItem(storageKey);
    if (text === null) {
      return undefined;
    }
    try {
      return JSON.parse(text) as PersistedClient;
    } catch {
      return undefined;
    }
  },
  async removeClient() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
    await Storage.removeItem(storageKey);
  },
};
