import { describe, expect, it } from 'vitest';
import { advance, advanceTo } from '../src/sim/tick.ts';
import { newWorld, who, put, sgt } from './helpers.ts';
import { PLACE_BY_ID } from '../src/sim/map.ts';
import { scheduleFor } from '../src/sim/osman.ts';
import { dayIndex, minuteOfDay } from '../src/sim/time.ts';

describe('needs', () => {
  it('awake: hunger +1 a minute, energy drains about 2 every 3 minutes', () => {
    const w = newWorld(9);
    const r = who(w, 'Siti');
    const [h, e] = [r.hunger, r.energy];
    advanceTo(w, w.t + 60);
    expect(r.hunger).toBe(h + 60);
    expect(r.energy).toBe(e - 40);
  });

  it('asleep: hunger rises slowly and energy comes back', () => {
    const w = newWorld(13);
    const r = who(w, 'Siti');
    r.energy = 300;
    r.activity = { kind: 'sleeping', reason: 'nap', until: null };
    const h = r.hunger;
    advanceTo(w, w.t + 60);
    expect(r.hunger).toBe(h + 20);
    expect(r.energy).toBe(300 + 180);
  });

  it('hard work tires you faster', () => {
    const w = newWorld(9);
    const r = put(w, 'Siti', 'jetty');
    r.activity = { kind: 'fishing', until: w.t + 30 };
    const e = r.energy;
    advanceTo(w, w.t + 20);
    expect(r.energy).toBe(e - 20);
  });

  it('starving clamps at the top and saps energy', () => {
    const w = newWorld(9);
    const r = who(w, 'Siti');
    r.hunger = 995;
    const e = r.energy;
    advanceTo(w, w.t + 30);
    expect(r.hunger).toBe(1000);
    expect(r.energy).toBeLessThan(e - 20);
  });

  it('someone who runs out of energy dozes off where they stand, then wakes', () => {
    const w = newWorld(9);
    const r = put(w, 'Siti', 'well');
    r.energy = 1;
    advanceTo(w, w.t + 3);
    expect(r.activity?.kind).toBe('sleeping');
    expect(w.isAt(r, 'well')).toBe(true);
    expect(w.takeEvents().some((e) => e.type === 'fell_asleep' && e.reason === 'collapse')).toBe(true);
    advanceTo(w, w.t + 200);
    expect(r.activity).toBeNull();
  });

  it('a nap ends once rested', () => {
    const w = newWorld(13);
    const r = who(w, 'Siti');
    r.energy = 800;
    r.activity = { kind: 'sleeping', reason: 'nap', until: w.t + 180 };
    advanceTo(w, w.t + 50);
    expect(r.activity).toBeNull();
    expect(r.energy).toBeGreaterThanOrEqual(950);
  });
});

describe('the day', () => {
  it('at 23:00 everyone goes home to sleep, and at 06:00 they wake', () => {
    const w = newWorld(22, 50);
    const siti = put(w, 'Siti', 'jetty');
    siti.activity = { kind: 'fishing', until: w.t + 30 };
    advanceTo(w, sgt(23, 0));
    expect(siti.activity?.kind).toBe('walking');
    advanceTo(w, sgt(23, 59));
    for (const r of w.state.residents) {
      expect(r.activity?.kind, r.name).toBe('sleeping');
      expect(w.isAt(r, r.homeId), r.name).toBe(true);
    }
    expect(w.takeEvents().some((e) => e.type === 'night_fell')).toBe(true);
    advanceTo(w, sgt(6, 0, 1));
    for (const r of w.state.residents) expect(r.activity, r.name).toBeNull();
    expect(w.takeEvents().some((e) => e.type === 'morning')).toBe(true);
  });

  it("the lorry comes about 06:30 and stays about an hour and a half, by Pak Osman's day", () => {
    const w = newWorld(6, 0);
    const s = scheduleFor(w, dayIndex(w.t))!;
    advanceTo(w, w.t - minuteOfDay(w.t) + s.arrives - 1);
    expect(w.state.lorryHere).toBe(false);
    advance(w);
    expect(w.state.lorryHere).toBe(true);
    advanceTo(w, w.t - minuteOfDay(w.t) + s.leaves - 1);
    expect(w.state.lorryHere).toBe(true);
    advance(w);
    expect(w.state.lorryHere).toBe(false);
    const types = w.takeEvents().map((e) => e.type);
    expect(types.filter((t) => t === 'lorry_arrived')).toHaveLength(1);
    expect(types.filter((t) => t === 'lorry_left')).toHaveLength(1);
  });
});

describe('activities', () => {
  it('walking covers 3 tiles a minute and arrives', () => {
    const w = newWorld(9);
    const r = who(w, 'Siti');
    const dest = PLACE_BY_ID.get('kopitiam')!;
    const path = [{ x: r.pos.x, y: 3 }, { x: r.pos.x, y: 4 }, { x: r.pos.x + 1, y: 4 }, { x: r.pos.x + 2, y: 4 }];
    r.activity = { kind: 'walking', path: [...path], dest: dest.id, thenSleep: false };
    advance(w);
    expect(r.pos).toEqual(path[2]);
    advance(w);
    expect(r.pos).toEqual(path[3]);
    expect(r.activity).toBeNull();
    expect(w.takeEvents().some((e) => e.type === 'arrived')).toBe(true);
  });

  it('fishing ends after its time with a catch of 0 to 3', () => {
    const w = newWorld(9);
    const r = put(w, 'Siti', 'jetty');
    r.activity = { kind: 'fishing', until: w.t + 30 };
    advanceTo(w, w.t + 30);
    expect(r.activity).toBeNull();
    const ev = w.takeEvents().find((e) => e.type === 'caught_fish');
    expect(ev).toBeDefined();
    const n = r.items.fish ?? 0;
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(3);
  });
});
