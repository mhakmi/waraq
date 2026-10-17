import { DatabaseSync } from 'node:sqlite';

import type { Database, SqlValue } from './database';

export function nodeDatabase(path: string): Database {
  const database = new DatabaseSync(path, { timeout: 5000 });
  database.exec('PRAGMA journal_mode=WAL');
  return {
    async exec(sql) {
      database.exec(sql);
    },
    async run(sql, params) {
      const result = database.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    async all<Row>(sql: string, params: SqlValue[]) {
      return database.prepare(sql).all(...params) as Row[];
    },
  };
}
