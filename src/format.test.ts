import { afterAll, describe, expect, test } from 'vitest';

import { calendarDateOf, formatCalendarDate, pickerDate } from './format';
import type { IsoDate } from './paperless/schemas';

const startingZone = process.env.TZ;

afterAll(() => {
  process.env.TZ = startingZone;
});

const zones = [
  'Pacific/Kiritimati',
  'Asia/Riyadh',
  'Europe/London',
  'America/Toronto',
  'America/Santiago',
  'Pacific/Pago_Pago',
  'UTC',
];

const daylightSavingDays = {
  torontoSpringForward: '2026-03-08',
  torontoFallBack: '2026-11-01',
  londonSpringForward: '2026-03-29',
  santiagoMidnightChange: '2026-09-06',
};
const ordinaryDays = { newYear: '2026-01-01', yearEnd: '2026-12-31', leapDay: '2024-02-29' };
const dates = Object.values({ ...daylightSavingDays, ...ordinaryDays }) as IsoDate[];

function pickInDialog(opened: Date, year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, opened.getUTCHours(), opened.getUTCMinutes()));
}

describe.each(zones)('in %s', (zone) => {
  test('the zone is in effect', () => {
    process.env.TZ = zone;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  test.each(dates)('%s goes through the date picker and back on the same day', (date) => {
    process.env.TZ = zone;
    expect(calendarDateOf(pickerDate(date))).toBe(date);
    expect(formatCalendarDate(date, 'en-CA')).toBe(
      new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }),
    );
  });

  test('a day picked from the dialog is stored as that day', () => {
    process.env.TZ = zone;
    const picked = pickInDialog(pickerDate('2026-09-27' as IsoDate), 2026, 8, 6);
    expect(calendarDateOf(picked)).toBe('2026-09-06');
  });
});
