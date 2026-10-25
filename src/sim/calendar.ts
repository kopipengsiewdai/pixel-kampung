/**
 * The kampung's own calendar (owner decision, 2026-10-25): it began on
 * 1 January, Year 0, the day the town moved to its own clock. Twelve months,
 * 365 days, with a leap day (29 February) every fourth year: Year 4, 8, 12 and
 * so on; Year 0 has none. Weekdays carry on from the clock. Festivals will be
 * pinned to these dates, so everything about dates lives here.
 */
import { dayIndex, timeLabel, weekday, type Weekday } from './time.ts';

/** Where a town's calendar starts: the day index (time.ts) of 1 January, Year 0. */
export interface Calendar {
  firstDay: number;
}

export interface KampungDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  weekday: Weekday;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export function isLeapYear(year: number): boolean {
  return year > 0 && year % 4 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** The date `n` days after 1 January, Year 0 (n ≥ 0), without its weekday. */
export function dateOfDay(n: number): Omit<KampungDate, 'weekday'> {
  if (!Number.isInteger(n) || n < 0) throw new Error(`no kampung date for day ${n}`);
  let year = 0;
  let rest = n;
  // Whole four-year runs first (1461 days each, once Year 0's short run is past), then single years.
  if (rest >= 365) {
    rest -= 365;
    year = 1;
    year += 4 * Math.floor(rest / 1461);
    rest %= 1461;
  }
  while (rest >= daysInYear(year)) {
    rest -= daysInYear(year);
    year++;
  }
  let month = 1;
  while (rest >= daysInMonth(year, month)) {
    rest -= daysInMonth(year, month);
    month++;
  }
  return { year, month, day: rest + 1 };
}

/** Days from 1 January, Year 0 to a date: the inverse of dateOfDay. */
export function dayOfDate(d: Pick<KampungDate, 'year' | 'month' | 'day'>): number {
  let n = 0;
  for (let y = 0; y < d.year; y++) n += daysInYear(y);
  for (let m = 1; m < d.month; m++) n += daysInMonth(d.year, m);
  return n + d.day - 1;
}

/** The town's date at game minute t. */
export function dateAt(w: { calendar: Calendar }, t: number): KampungDate {
  return { ...dateOfDay(dayIndex(t) - w.calendar.firstDay), weekday: weekday(t) };
}

/** "Tuesday, 3 January, Year 0". */
export function dateLabel(d: KampungDate): string {
  return `${d.weekday}, ${d.day} ${MONTHS[d.month - 1]}, Year ${d.year}`;
}

/** "Tuesday, 3 January, Year 0, 7:15 in the morning": the date and time as a resident would say them. */
export function nowLabel(w: { calendar: Calendar }, t: number): string {
  return `${dateLabel(dateAt(w, t))}, ${timeLabel(t)}`;
}
