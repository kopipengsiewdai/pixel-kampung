import { describe, expect, it } from 'vitest';
import { Budget, ESTIMATE, HOURLY_ALLOWANCE, TOWN_DAILY_CAP } from '../src/mind/budget.ts';
import { MAX_REPLAY_MINUTES } from '../src/sim/skip.ts';
import { CostLog } from '../src/mind/cost-log.ts';
import { FakeModel } from '../src/mind/fake-model.ts';
import { MemoryStore } from '../src/mind/memory.ts';
import { Mind } from '../src/mind/mind.ts';
import { mindBrains } from '../src/mind/setup.ts';
import { CARDS } from '../src/seed/cards.ts';
import { dateAt, dateLabel, dateOfDay, dayOfDate, isLeapYear, MONTHS, nowLabel } from '../src/sim/calendar.ts';
import { perceive } from '../src/sim/perception.ts';
import { createWorld } from '../src/sim/seed.ts';
import { World } from '../src/sim/state.ts';
import * as time from '../src/sim/time.ts';
import { dayIndex, GAME_MINUTES_PER_REAL_MINUTE, gameMinuteAt, minuteOfDay, REAL_MS_PER_GAME_MINUTE, realMsAt } from '../src/sim/time.ts';
import { shortStamp, weekdayAt } from '../src/sim/calendar.ts';
import { feedLine, formatFeedLine } from '../src/feed/feed.ts';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Town, fakeBrains } from '../src/town.ts';
import { clockLabel } from '../src/watch/view.ts';
import { sgt } from './helpers.ts';

describe("the kampung's clock", () => {
  const clock = { anchorT: 1000, anchorMs: 5_000_000 };

  it('a game day is five real hours: a game minute is 12.5 real seconds', () => {
    expect(REAL_MS_PER_GAME_MINUTE).toBe(12_500);
    expect(GAME_MINUTES_PER_REAL_MINUTE).toBe(4.8);
    expect(gameMinuteAt(clock, clock.anchorMs)).toBe(1000);
    expect(gameMinuteAt(clock, clock.anchorMs + 12_499)).toBe(1000);
    expect(gameMinuteAt(clock, clock.anchorMs + 12_500)).toBe(1001);
    expect(gameMinuteAt(clock, clock.anchorMs + 60_000)).toBe(1004);
    expect(gameMinuteAt(clock, clock.anchorMs + 5 * 3_600_000)).toBe(1000 + 1440);
  });

  it('so the same game hour drifts through the real day, coming round again only every five real days', () => {
    // 4.8 game days to a real day: game 07:00 falls at a different real time each day, and back where it began after 5.
    const at7 = (n: number) => realMsAt(clock, 1000 + n * 1440) % 86_400_000;
    expect(new Set([0, 1, 2, 3, 4].map((d) => at7(Math.round(d * 4.8)))).size).toBeGreaterThan(1);
    expect(realMsAt(clock, 1000 + 24 * 1440) - realMsAt(clock, 1000)).toBe(5 * 86_400_000);
  });

  it('turns a game minute back into the real moment it starts', () => {
    for (const t of [1000, 1001, 2440, 999_999]) expect(gameMinuteAt(clock, realMsAt(clock, t))).toBe(t);
    expect(realMsAt(clock, 1024) - realMsAt(clock, 1000)).toBe(5 * 60_000);
  });

  it('a new town keeps its clock in the save', () => {
    const w = createWorld(1, 2000, { anchorMs: 7_000_000 });
    expect(w.clock).toEqual({ anchorT: 2000, anchorMs: 7_000_000 });
    expect(createWorld(1, 2000).clock).toEqual({ anchorT: 2000, anchorMs: 2000 * 60_000 });
  });
});

describe('the kampung calendar', () => {
  it('starts on 1 January, Year 0, with 12 months and 365 days', () => {
    expect(MONTHS).toHaveLength(12);
    expect(dateOfDay(0)).toMatchObject({ year: 0, month: 1, day: 1 });
    expect(dateOfDay(30)).toMatchObject({ year: 0, month: 1, day: 31 });
    expect(dateOfDay(31)).toMatchObject({ year: 0, month: 2, day: 1 });
    expect(dateOfDay(58)).toMatchObject({ year: 0, month: 2, day: 28 });
    expect(dateOfDay(59)).toMatchObject({ year: 0, month: 3, day: 1 }); // Year 0 has no leap day
    expect(dateOfDay(364)).toMatchObject({ year: 0, month: 12, day: 31 });
    expect(dateOfDay(365)).toMatchObject({ year: 1, month: 1, day: 1 });
  });

  it('has a leap day every fourth year, Year 0 aside', () => {
    expect([0, 1, 2, 3, 4, 5, 8, 12, 100].map(isLeapYear)).toEqual([false, false, false, false, true, false, true, true, true]);
    const feb29 = dayOfDate({ year: 4, month: 2, day: 29 });
    expect(dateOfDay(feb29)).toMatchObject({ year: 4, month: 2, day: 29 });
    expect(dateOfDay(feb29 + 1)).toMatchObject({ year: 4, month: 3, day: 1 });
    expect(dayOfDate({ year: 5, month: 1, day: 1 }) - dayOfDate({ year: 4, month: 1, day: 1 })).toBe(366);
  });

  it('every day has exactly one date, in order', () => {
    for (let n = 0; n < 4000; n++) {
      const d = dateOfDay(n);
      expect(dayOfDate(d), `day ${n}`).toBe(n);
      expect(d.day).toBeGreaterThanOrEqual(1);
      expect(d.day).toBeLessThanOrEqual(31);
    }
  });

  it('a town knows its date; 1 January, Year 0 is a Monday and the week runs on from it', () => {
    const w = createWorld(1, sgt(9));
    expect(w.calendar).toEqual({ firstDay: dayIndex(sgt(9)) });
    const d = dateAt(w, sgt(9, 30, 2));
    expect(d).toEqual({ year: 0, month: 1, day: 3, weekday: 'Wednesday' });
    expect(weekdayAt(w, sgt(9, 30, 6))).toBe('Sunday');
    expect(weekdayAt(w, sgt(9, 30, 7))).toBe('Monday');
    expect(dateLabel(d)).toBe('Wednesday, 3 January, Year 0');
    expect(nowLabel(w, sgt(7, 15, 1))).toBe('Tuesday, 2 January, Year 0, 7:15 in the morning');
    expect(nowLabel(w, sgt(12, 0, 0))).toBe('Monday, 1 January, Year 0, 12:00 noon');
  });

  it('residents perceive the date, in the kampung\'s own words', () => {
    const w = new World(createWorld(1, sgt(7, 15, 1)));
    w.state.calendar.firstDay = dayIndex(sgt(0, 0, 0));
    const p = perceive(w, w.state.residents[0]!);
    expect(p.time).toBe('Tuesday, 2 January, Year 0, 7:15 in the morning');
  });

  it('the watch page shows the same date', () => {
    const w = new World(createWorld(1, sgt(7, 5)));
    expect(clockLabel(w)).toBe('Monday 1 January, Year 0, 07:05');
  });
});

describe('thinking money stays in real time', () => {
  it('a resident earns US$0.0139 of thinking per real hour, which is 4.8 game hours', () => {
    const b = new Budget(0, 0);
    b.refill(60);
    expect(b.level).toBeCloseTo(HOURLY_ALLOWANCE / 4.8, 10);
    b.refill(60 + 288); // a real hour later
    expect(b.level).toBeCloseTo(HOURLY_ALLOWANCE * (1 + 1 / 4.8), 10);
  });

  it("the town's daily cap is per real day: 4.8 game days share one US$3.33", async () => {
    expect(TOWN_DAILY_CAP).toBe(3.33);
    // A town anchored at real midnight in Singapore: its first game days fall on one real day.
    const start = sgt(6, 0) - 1;
    const midnight = Date.parse('2026-11-01T16:00:00Z');
    const memory = new MemoryStore(':memory:');
    const costs = new CostLog(null);
    const mind = new Mind({ client: new FakeModel(3), memory, costs, cards: CARDS, townCap: 0.05 });
    const quiet: number[] = [];
    const town = Town.create(3, start, { anchorMs: midnight + 90 * 60_000, brains: mindBrains(mind, fakeBrains), observer: mind.observe, onEvent: (e) => { if (e.type === 'kampung_quiet') quiet.push(e.t); } });
    expect(new Date(realMsAt(town.world.state.clock, start)).toISOString()).toBe('2026-11-01T17:30:00.000Z'); // 01:30 in Singapore
    await town.runUntil(start + 2 * 1440);
    // Spent by game day 1, and still spent all through game day 2: the same real day.
    expect(quiet).toHaveLength(1);
    expect(dayIndex(quiet[0]!)).toBe(dayIndex(start + 1));
    expect(costs.spentOn(costs.dayKey(realMsAt(town.world.state.clock, start + 1)))).toBeGreaterThanOrEqual(0.05);
    expect(costs.dayKey(realMsAt(town.world.state.clock, start + 2 * 1440))).toBe('2026-11-02');
    memory.close();
  });

  it('the cost log is kept by real Singapore date', () => {
    const log = new CostLog(null);
    expect(log.dayKey(Date.parse('2026-11-01T15:59:59Z'))).toBe('2026-11-01');
    expect(log.dayKey(Date.parse('2026-11-01T16:00:00Z'))).toBe('2026-11-02');
  });
});

describe('game-time rules on the kampung clock', () => {
  it('night, the lorry and the days all follow game time', async () => {
    const start = sgt(6, 0) - 1;
    const types: { t: number; type: string }[] = [];
    const town = Town.create(5, start, { onEvent: (e) => types.push({ t: e.t, type: e.type }) });
    await town.runUntil(start + 1440);
    const lorry = types.find((e) => e.type === 'lorry_arrived')!;
    expect(minuteOfDay(lorry.t)).toBeGreaterThanOrEqual(6 * 60 + 20);
    expect(minuteOfDay(lorry.t)).toBeLessThanOrEqual(6 * 60 + 40);
    // One game day took five real hours.
    expect(realMsAt(town.world.state.clock, start + 1440) - realMsAt(town.world.state.clock, start)).toBe(5 * 3_600_000);
  });
});

describe('review fixes: the kampung clock under load', () => {
  it('a town that falls behind by a few real minutes (slow thinking) replays them; only real downtime passes quietly', async () => {
    const start = sgt(9, 0);
    const events: string[] = [];
    const town = Town.create(5, start, { onEvent: (e) => events.push(e.type) });
    await town.catchUp(start + 30); // 6.25 real minutes behind
    expect(events).not.toContain('quiet_spell');
    expect(MAX_REPLAY_MINUTES).toBe(48); // ten real minutes
    await town.catchUp(start + 30 + 2 * 60); // the PC slept half an hour
    expect(events).toContain('quiet_spell');
  });

  it("a plan that can't be afforded yet is made later the same day, once the thinking money is there", async () => {
    const memory = new MemoryStore(':memory:');
    const mind = new Mind({ client: new FakeModel(2), memory, costs: new CostLog(null), cards: CARDS });
    mind.keepSent = true;
    const start = sgt(6, 0) - 1;
    const town = Town.create(2, start, { brains: mindBrains(mind, fakeBrains, ['siti']), observer: mind.observe });
    const siti = town.brains.get('siti')!;
    const saved = siti.save() as { budget: { level: number; lastT: number } };
    siti.load({ ...saved, budget: { level: 0, lastT: start } }); // spent out overnight
    await town.runUntil(start + 12 * 60);
    const plans = mind.sent.filter((s) => s.kind === 'plan');
    expect(plans).toHaveLength(1);
    expect(ESTIMATE.big).toBeLessThanOrEqual(0.01); // big thinking is Haiku at high effort: cents, not dimes
    memory.close();
  });

  it("the free fake brain still knows which day it did the lorry run on, from the new date words", async () => {
    const start = sgt(6, 0) - 1;
    const town = Town.create(1, start);
    await town.runUntil(sgt(8, 0));
    const days = [...town.brains.values()].map((b) => (b.save() as { lorryDay: string | null }).lorryDay).filter((d) => d !== null);
    expect(days.length).toBeGreaterThan(0);
    expect(new Set(days)).toEqual(new Set(['Monday']));
  });

  it('a town made in the last minute before midnight has a date from its first moment', () => {
    const w = new World(createWorld(1, sgt(23, 59)));
    expect(() => clockLabel(w)).not.toThrow();
    expect(dateAt(w.state, w.t)).toMatchObject({ year: 0, month: 1, day: 1 });
    expect(dateAt(w.state, w.t + 1)).toMatchObject({ day: 2 });
  });
});

describe('the kampung week', () => {
  it('starts on a Monday whatever weekday the old clock had: a town begun on a Thursday is still on Monday, 1 January', () => {
    const thursday = sgt(9, 0, 3);
    const w = new World(createWorld(1, thursday));
    expect(dateAt(w.state, thursday)).toMatchObject({ day: 1, weekday: 'Monday' });
    expect(nowLabel(w.state, thursday)).toBe('Monday, 1 January, Year 0, 9:00 in the morning');
    expect(shortStamp(w.state, thursday + 65)).toBe('Mon 10:05');
    expect(clockLabel(w)).toBe('Monday 1 January, Year 0, 09:00');
    expect(perceive(w, w.state.residents[0]!).time).toMatch(/^Monday, 1 January/);
    expect(formatFeedLine(feedLine({ seq: 1, t: thursday, type: 'morning' }, () => '')!, w.state)).toMatch(/^\[Mon 09:00\]/);
  });

  it('no game rule reads the old clock weekday: weekdays come only from the calendar', () => {
    expect('weekday' in time).toBe(false);
    expect('shortStamp' in time).toBe(false);
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk(root);
    for (const f of files) {
      if (f.endsWith(join('sim', 'calendar.ts'))) continue;
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/getUTCDay\(|\bweekday\(/);
    }
  });
});

describe('v4 → v5: a game day every five real hours', () => {
  it('re-anchors the clock where the town stands, at the real moment it got there, so nothing jumps', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 4)!;
    const t = 29_000_000;
    // Saved 1000 game minutes after its last anchor, at 15 real seconds a game minute.
    const world = { t, clock: { anchorT: t - 1000, anchorMs: 1_700_000_000_000 } };
    const up = step.save!({ world, brains: {} }).world as unknown as { t: number; clock: { anchorT: number; anchorMs: number } };
    expect(up.t).toBe(t);
    expect(up.clock).toEqual({ anchorT: t, anchorMs: 1_700_000_000_000 + 1000 * 15_000 });
    // From there on, the new pace: a real minute later it's 4.8 game minutes on.
    expect(gameMinuteAt(up.clock, up.clock.anchorMs)).toBe(t);
    expect(gameMinuteAt(up.clock, up.clock.anchorMs + 5 * 60_000)).toBe(t + 24);
    // Running it again changes nothing.
    expect(step.save!({ world: up as unknown as Record<string, unknown>, brains: {} }).world).toEqual(up);
  });
});
