import { expect, test } from 'vitest';

import { uuidV7 } from './uuid';

const random = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

test('the first 48 bits are the time in milliseconds', () => {
  const id = uuidV7(0x0190a1b2c3d4, random);
  expect(id.startsWith('0190a1b2-c3d4-')).toBe(true);
});

test('version and variant bits are set over the random bytes', () => {
  expect(uuidV7(0, random)).toBe('00000000-0000-7fff-bfff-ffffffffffff');
});

test('ids made later sort later', () => {
  const zeros = new Uint8Array(10);
  const earlier = uuidV7(1_700_000_000_000, random);
  const later = uuidV7(1_700_000_000_001, zeros);
  expect(earlier < later).toBe(true);
});

test('too few random bytes is an error', () => {
  expect(() => uuidV7(0, new Uint8Array(4))).toThrow(RangeError);
});
