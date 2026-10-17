import { openDatabaseAsync } from 'expo-sqlite';

import type { Database, SqlValue } from './database';

export async function expoDatabase(name: string): Promise<Database> {
  const database = await openDatabaseAsync(name);
  await database.execAsync('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  return {
    async exec(sql) {
      await database.execAsync(sql);
    },
    async run(sql, params) {
      const result = await database.runAsync(sql, params);
      return { changes: result.changes };
    },
    async all<Row>(sql: string, params: SqlValue[]) {
      return database.getAllAsync<Row>(sql, params);
    },
  };
}
