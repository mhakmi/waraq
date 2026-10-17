import { failure, type Result, success } from '../paperless/errors';

export type HeaderRow = { key: number; name: string; value: string };

export type HeaderProblem = {
  kind: 'bad_name' | 'bad_value' | 'reserved' | 'duplicate' | 'missing_name';
  name: string;
};

const tokenPattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const reservedNames = ['authorization', 'accept', 'content-type', 'content-length', 'host'];

export function parseHeaderRows(rows: HeaderRow[]): Result<Record<string, string>, HeaderProblem> {
  const headers: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (name === '' && value === '') {
      continue;
    }
    if (name === '') {
      return failure({ kind: 'missing_name', name });
    }
    if (!tokenPattern.test(name)) {
      return failure({ kind: 'bad_name', name });
    }
    if (reservedNames.includes(name.toLowerCase())) {
      return failure({ kind: 'reserved', name });
    }
    if (seen.has(name.toLowerCase())) {
      return failure({ kind: 'duplicate', name });
    }
    if (/[\r\n]/.test(value)) {
      return failure({ kind: 'bad_value', name });
    }
    seen.add(name.toLowerCase());
    headers[name] = value;
  }
  return success(headers);
}
