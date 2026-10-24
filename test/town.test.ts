import { describe, expect, it } from 'vitest';
import { Town } from '../src/town.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { feedLine } from '../src/feed/feed.ts';
import { sgt } from './helpers.ts';
import { isNight } from '../src/sim/time.ts';

const START = sgt(6, 0) - 1; // first simulated minute is Monday 06:00

async function runDays(seed: number, days: number) {
  const events: GameEvent[] = [];
  const town = Town.create(seed, START, { onEvent: (e) => events.push(e) });
  const before = town.world.state.residents.reduce((s, r) => s + r.money, 0);
  await town.runUntil(START + days * 1440);
  return { town, events, before };
}

describe('the fake-brain town', () => {
  it('runs 3 game days on a fixed seed: no exceptions, money conserved except through the lorry', async () => {
    const { town, events, before } = await runDays(42, 3);
    const after = town.world.state.residents.reduce((s, r) => s + r.money, 0);
    const lorryIn = events.filter((e) => e.type === 'lorry_sale').reduce((s, e) => s + (e.type === 'lorry_sale' ? e.cents : 0), 0);
    const lorryOut = events.filter((e) => e.type === 'lorry_order').reduce((s, e) => s + (e.type === 'lorry_order' ? e.cents : 0), 0);
    expect(after - before).toBe(lorryIn - lorryOut);
    for (const r of town.world.state.residents) {
      expect(r.money, r.name).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(r.money)).toBe(true);
      for (const n of Object.values(r.items)) expect(n).toBeGreaterThan(0);
    }
    // The town actually lives: people eat, fish, trade and the lorry comes daily.
    const count = (t: string) => events.filter((e) => e.type === t).length;
    expect(count('lorry_arrived')).toBe(3);
    expect(count('ate')).toBeGreaterThan(30);
    expect(count('caught_fish')).toBeGreaterThan(10);
    expect(count('bought')).toBeGreaterThan(10);
    expect(count('lorry_order')).toBeGreaterThan(0);
    expect(count('said')).toBeGreaterThan(0);
    // Nobody acts at night.
    const nightActs = events.filter((e) => isNight(e.t) && ['bought', 'sold', 'said', 'went_fishing', 'ate'].includes(e.type));
    expect(nightActs).toEqual([]);
    // Every event renders (or is deliberately silent) without throwing.
    const names = (id: string) => town.world.resident(id).name;
    const lines = events.map((e) => feedLine(e, names)).filter(Boolean);
    expect(lines.length).toBeGreaterThan(100);
  });

  it('is deterministic: same seed, same story', async () => {
    const a = await runDays(7, 1);
    const b = await runDays(7, 1);
    expect(b.events).toEqual(a.events);
    expect(b.town.snapshot()).toEqual(a.town.snapshot());
    const c = await runDays(8, 1);
    expect(c.events).not.toEqual(a.events);
  });
});
