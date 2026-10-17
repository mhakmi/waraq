import type { IsoDate } from './paperless/schemas';

// A calendar date has no time zone, so it is read and shown in UTC and never moves a day.
export function formatCalendarDate(date: IsoDate, locale: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
