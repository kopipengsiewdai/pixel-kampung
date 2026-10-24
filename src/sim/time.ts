/**
 * Game time is real time: one game minute is one real minute, in Singapore time
 * (UTC+8, no daylight saving). A "game minute" is minutes since the Unix epoch.
 */
export const SGT_OFFSET_MIN = 8 * 60;
export const MINUTES_PER_DAY = 24 * 60;
export const NIGHT_START_HOUR = 23;
export const NIGHT_END_HOUR = 6;

export function gameMinuteFromMs(ms: number): number {
  return Math.floor(ms / 60_000);
}

export function msFromGameMinute(t: number): number {
  return t * 60_000;
}

/** Minutes since local (SGT) midnight, 0–1439. */
export function minuteOfDay(t: number): number {
  return (((t + SGT_OFFSET_MIN) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function sgtHour(t: number): number {
  return Math.floor(minuteOfDay(t) / 60);
}

export function sgtMinute(t: number): number {
  return minuteOfDay(t) % 60;
}

/** Local (SGT) calendar day number. */
export function dayIndex(t: number): number {
  return Math.floor((t + SGT_OFFSET_MIN) / MINUTES_PER_DAY);
}

/** The game minute at a given SGT hour:minute on the same local day as t. */
export function atTimeOfDay(t: number, hour: number, minute = 0): number {
  return t - minuteOfDay(t) + hour * 60 + minute;
}

export function isNight(t: number): boolean {
  const h = sgtHour(t);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

const WEEKDAYS = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];

export function weekday(t: number): string {
  // Day 0 (1970-01-01) was a Thursday.
  return WEEKDAYS[((dayIndex(t) % 7) + 7) % 7]!;
}

/** "Monday 7:05 in the morning": how a resident would say the time. */
export function timeLabel(t: number): string {
  const h = sgtHour(t);
  const m = sgtMinute(t);
  if (h === 12 && m === 0) return `${weekday(t)} 12:00 noon`;
  if (h === 0 && m === 0) return `${weekday(t)} midnight`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 12 ? (h < 5 ? 'in the small hours' : 'in the morning')
    : h < 18 ? 'in the afternoon'
      : h < 20 ? 'in the evening'
        : 'at night';
  return `${weekday(t)} ${h12}:${String(m).padStart(2, '0')} ${part}`;
}

/** "Mon 07:05", for the story feed. */
export function shortStamp(t: number): string {
  return `${weekday(t).slice(0, 3)} ${String(sgtHour(t)).padStart(2, '0')}:${String(sgtMinute(t)).padStart(2, '0')}`;
}
