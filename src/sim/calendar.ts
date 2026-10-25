/**
 * The kampung's own calendar (owner decisions, 2026-10-25): it began on
 * Monday, 1 January, Year 0, the day the town moved to its own clock. Twelve
 * months, 365 days, with a leap day (29 February) every fourth year: Year 4,
 * 8, 12 and so on; Year 0 has none. The week runs on from that Monday.
 * Festivals and every weekday rule go by these dates, so everything about
 * dates and weekdays lives here (a test makes sure nothing else reads one).
 */
import { dayIndex, hhmm, timeLabel } from './time.ts';

export type Weekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

/** The week, from the Monday it began on. */
export const WEEKDAYS: readonly Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

/** The town's weekday at game minute t: 1 January, Year 0 was a Monday. */
export function weekdayAt(w: { calendar: Calendar }, t: number): Weekday {
  const n = dayIndex(t) - w.calendar.firstDay;
  return WEEKDAYS[((n % 7) + 7) % 7]!;
}

/** The town's date at game minute t. */
export function dateAt(w: { calendar: Calendar }, t: number): KampungDate {
  return { ...dateOfDay(dayIndex(t) - w.calendar.firstDay), weekday: weekdayAt(w, t) };
}

/** "Mon 07:05", for the story feed and the watch page. */
export function shortStamp(w: { calendar: Calendar }, t: number): string {
  return `${weekdayAt(w, t).slice(0, 3)} ${hhmm(t)}`;
}

/** "Tuesday, 3 January, Year 0". */
export function dateLabel(d: KampungDate): string {
  return `${d.weekday}, ${d.day} ${MONTHS[d.month - 1]}, Year ${d.year}`;
}

/** "Tuesday, 3 January, Year 0, 7:15 in the morning": the date and time as a resident would say them. */
export function nowLabel(w: { calendar: Calendar }, t: number): string {
  return `${dateLabel(dateAt(w, t))}, ${timeLabel(t)}`;
}
