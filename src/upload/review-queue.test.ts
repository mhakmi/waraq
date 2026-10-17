import { expect, test, vi } from 'vitest';

import type { Database } from './database';
import { nodeDatabase } from './nodeDatabase';

let opens = 0;

vi.mock('./expoDatabase', () => ({
  expoDatabase: async (): Promise<Database> => {
    opens += 1;
    if (opens === 1) {
      throw new Error('database is locked');
    }
    return nodeDatabase(':memory:');
  },
}));
vi.mock('../../modules/scanner', () => ({ PdfError: class {}, writePdf: async () => ({ pageCount: 0, bytes: 0 }) }));
vi.mock('../account/store', () => ({ loadAccount: async () => null }));
vi.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: () => () => {} } }));

test('review: a database that fails to open once opens on a later run, so the queue is not stuck until the app restarts', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { runUploads } = await import('./queue');

  await runUploads();
  await runUploads();

  expect(opens).toBe(2);
  expect(warn).toHaveBeenCalledTimes(1);
});
