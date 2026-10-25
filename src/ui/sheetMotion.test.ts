import { describe, expect, test } from 'vitest';

import { openingPlace, restingPlace } from './sheetMotion';

const tall = { height: 900, peek: 500 };

describe('where a released sheet comes to rest', () => {
  test('a fling down closes it from peek or expanded, but not when it never left expanded', () => {
    expect(restingPlace(400, 1500, tall.height, tall.peek).name).toBe('closed');
    expect(restingPlace(30, 1500, tall.height, tall.peek).name).toBe('closed');
    expect(restingPlace(0, 6000, tall.height, tall.peek).name).toBe('expanded');
  });

  test('a fling up expands it', () => {
    expect(restingPlace(800, -1500, tall.height, tall.peek)).toEqual({ name: 'expanded', belowExpanded: 0 });
  });

  test('a slow release goes to the nearest place', () => {
    expect(restingPlace(100, 0, tall.height, tall.peek)).toEqual({ name: 'expanded', belowExpanded: 0 });
    expect(restingPlace(380, 0, tall.height, tall.peek)).toEqual({ name: 'peek', belowExpanded: 400 });
    expect(restingPlace(700, 0, tall.height, tall.peek)).toEqual({ name: 'closed', belowExpanded: 900 });
  });

  test('a sheet shorter than the peek height has no peek place', () => {
    expect(restingPlace(100, 0, 300, 500)).toEqual({ name: 'expanded', belowExpanded: 0 });
    expect(restingPlace(200, 0, 300, 500)).toEqual({ name: 'closed', belowExpanded: 300 });
  });
});

describe('where a sheet opens', () => {
  test('at its peek when taller than the peek height, otherwise expanded', () => {
    expect(openingPlace(false, tall.height, tall.peek)).toEqual({ name: 'peek', belowExpanded: 400 });
    expect(openingPlace(false, 300, 500)).toEqual({ name: 'expanded', belowExpanded: 0 });
  });

  test('expanded with a screen reader, so every control can be reached without a drag', () => {
    expect(openingPlace(true, tall.height, tall.peek)).toEqual({ name: 'expanded', belowExpanded: 0 });
  });
});
