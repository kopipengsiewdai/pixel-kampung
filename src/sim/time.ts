/**
 * Game time runs four times as fast as real time (owner decision, 2026-10-25):
 * a game minute is 15 real seconds and a game day is six real hours. A "game
 * minute" t is a plain counter that only ever goes up; each town's clock
 * (saved with it) ties it to real time. Time of day comes from t as it always
 * has (the old counter was minutes since the Unix epoch in Singapore time, so
 * a town upgraded from it carries on at the same hour); the date and the
 * weekday come only from the kampung's own calendar (calendar.ts).
 */
export const SGT_OFFSET_MIN = 8 * 60;
export const MINUTES_PER_DAY = 24 * 60;
export const NIGHT_START_HOUR = 23;
export const NIGHT_END_HOUR = 6;

/** Game minutes per real minute. */
export const GAME_SPEED = 4;
export const REAL_MS_PER_GAME_MINUTE = 60_000 / GAME_SPEED;

/** Ties a town's game minutes to real time: at real moment anchorMs, it was game minute anchorT. */
export interface GameClock {
  anchorT: number;
  anchorMs: number;
}

/** The game minute under way at a real moment. */
export function gameMinuteAt(c: GameClock, ms: number): number {
  return c.anchorT + Math.floor((ms - c.anchorMs) / REAL_MS_PER_GAME_MINUTE);
}

/** The real moment a game minute starts. */
export function realMsAt(c: GameClock, t: number): number {
  return c.anchorMs + (t - c.anchorT) * REAL_MS_PER_GAME_MINUTE;
}

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

/** "7:05 in the morning": how a resident would say the time of day. */
export function timeLabel(t: number): string {
  const h = sgtHour(t);
  const m = sgtMinute(t);
  if (h === 12 && m === 0) return '12:00 noon';
  if (h === 0 && m === 0) return 'midnight';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 12 ? (h < 5 ? 'in the small hours' : 'in the morning')
    : h < 18 ? 'in the afternoon'
      : h < 20 ? 'in the evening'
        : 'at night';
  return `${h12}:${String(m).padStart(2, '0')} ${part}`;
}

/** "07:05". */
export function hhmm(t: number): string {
  return `${String(sgtHour(t)).padStart(2, '0')}:${String(sgtMinute(t)).padStart(2, '0')}`;
}
