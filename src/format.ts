import type { IsoDate } from './paperless/schemas';

function dateParts(date: IsoDate): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month, day];
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

// A calendar date has no time zone, so it is read and shown in UTC and never moves a day.
export function formatCalendarDate(date: IsoDate, locale: string): string {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const pickerTimeZone = 'UTC';

export function pickerDate(date: IsoDate): Date {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

export function calendarDateOf(picked: Date): IsoDate {
  return `${picked.getUTCFullYear()}-${twoDigits(picked.getUTCMonth() + 1)}-${twoDigits(picked.getUTCDate())}` as IsoDate;
}

export function todayCalendarDate(now: Date): IsoDate {
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}` as IsoDate;
}

export function formatInstantDate(instant: string, locale: string): string {
  return new Date(instant).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}
