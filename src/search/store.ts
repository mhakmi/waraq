import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';

const RecentSearches = z.array(z.string());

function storageKey(accountId: string): string {
  return `recent-searches-${accountId}`;
}

export async function loadRecentSearches(accountId: string): Promise<string[]> {
  const text = await Storage.getItem(storageKey(accountId));
  if (text === null) {
    return [];
  }
  try {
    const parsed = RecentSearches.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveRecentSearches(accountId: string, recent: string[]): Promise<void> {
  await Storage.setItem(storageKey(accountId), JSON.stringify(recent));
}

export async function clearRecentSearches(accountId: string): Promise<void> {
  await Storage.removeItem(storageKey(accountId));
}
