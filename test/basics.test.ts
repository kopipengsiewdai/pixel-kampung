import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from '../src/sim/money.ts';
import { Rng } from '../src/sim/rng.ts';
import {
  dayIndex, gameMinuteFromMs, isNight, minuteOfDay, sgtHour, timeLabel, msFromGameMinute, sgtMinute,
} from '../src/sim/time.ts';
import { ManualClock, SystemClock } from '../src/sim/clock.ts';

describe('money', () => {
  it('formats cents the kampung way', () => {
    expect(formatMoney(20)).toBe('20¢');
    expect(formatMoney(5)).toBe('5¢');
    expect(formatMoney(100)).toBe('$1.00');
    expect(formatMoney(1235)).toBe('$12.35');
    expect(formatMoney(0)).toBe('0¢');
  });
  it('parses dollars and cents', () => {
    expect(parseMoney('$1.20')).toBe(120);
    expect(parseMoney('20¢')).toBe(20);
    expect(parseMoney('35c')).toBe(35);
    expect(parseMoney('2')).toBe(200);
    expect(parseMoney('lots')).toBeNull();
  });
});

describe('rng', () => {
  it('is deterministic for a seed and resumable from its state', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = [a.next(), a.next(), a.int(1, 6)];
    expect([b.next(), b.next(), b.int(1, 6)]).toEqual(seqA);
    const c = new Rng(0);
    c.state = a.state;
    expect(c.next()).toBe(a.next());
  });
  it('int stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(500, 2000);
      expect(v).toBeGreaterThanOrEqual(500);
      expect(v).toBeLessThanOrEqual(2000);
    }
  });
});

describe('time of day (the hour runs on from the old Singapore-time counter)', () => {
  // 2026-11-02T06:00:00+08:00
  const sixAm = gameMinuteFromMs(Date.parse('2026-11-01T22:00:00Z'));
  it('maps real time to Singapore hours', () => {
    expect(sgtHour(sixAm)).toBe(6);
    expect(minuteOfDay(sixAm)).toBe(360);
    expect(sgtMinute(sixAm + 75)).toBe(15);
    expect(msFromGameMinute(sixAm)).toBe(Date.parse('2026-11-01T22:00:00Z'));
  });
  it('night runs 23:00 to 06:00', () => {
    expect(isNight(sixAm)).toBe(false);
    expect(isNight(sixAm - 1)).toBe(true); // 05:59
    expect(isNight(sixAm + 17 * 60 - 1)).toBe(false); // 22:59
    expect(isNight(sixAm + 17 * 60)).toBe(true); // 23:00
  });
  it('days roll over at Singapore midnight', () => {
    expect(dayIndex(sixAm + 18 * 60)).toBe(dayIndex(sixAm) + 1); // 00:00 next day
    expect(dayIndex(sixAm + 17 * 60)).toBe(dayIndex(sixAm));
  });
  it('labels time in words', () => {
    expect(timeLabel(sixAm + 65)).toBe('7:05 in the morning');
    expect(timeLabel(sixAm + 8 * 60)).toBe('2:00 in the afternoon');
    expect(timeLabel(sixAm + 14 * 60 + 30)).toBe('8:30 at night');
    expect(timeLabel(sixAm + 6 * 60)).toBe('12:00 noon');
  });
});

describe('clocks', () => {
  it('manual clock is settable and advances', () => {
    const c = new ManualClock(1000);
    c.advanceMinutes(2);
    expect(c.nowMs()).toBe(1000 + 120_000);
  });
  it('system clock reads real time', () => {
    const before = Date.now();
    expect(new SystemClock().nowMs()).toBeGreaterThanOrEqual(before);
  });
});
