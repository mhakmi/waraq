import { describe, expect, test } from 'vitest';

import { type HeaderRow, parseHeaderRows } from './headers';

function rows(...pairs: [string, string][]): HeaderRow[] {
  return pairs.map(([name, value], key) => ({ key, name, value }));
}

describe('parseHeaderRows', () => {
  test('keeps named headers, trims them, and skips empty rows', () => {
    expect(parseHeaderRows(rows([' CF-Access-Client-Id ', ' abc '], ['', ''], ['X-Secret', 'two words']))).toEqual({
      ok: true,
      value: { 'CF-Access-Client-Id': 'abc', 'X-Secret': 'two words' },
    });
  });

  test.each([
    [rows(['', 'value']), { kind: 'missing_name', name: '' }],
    [rows(['Bad Name', 'value']), { kind: 'bad_name', name: 'Bad Name' }],
    [rows(['authorization', 'Basic abc']), { kind: 'reserved', name: 'authorization' }],
    [rows(['Accept', 'text/html']), { kind: 'reserved', name: 'Accept' }],
    [rows(['X-Token', 'a'], ['x-token', 'b']), { kind: 'duplicate', name: 'x-token' }],
    [rows(['X-Token', 'a\nb']), { kind: 'bad_value', name: 'X-Token' }],
  ])('%j is refused with %j', (input, problem) => {
    expect(parseHeaderRows(input)).toEqual({ ok: false, error: problem });
  });
});
