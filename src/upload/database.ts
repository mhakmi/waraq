export type SqlValue = string | number | null;

export interface Database {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  all<Row>(sql: string, params: SqlValue[]): Promise<Row[]>;
}
