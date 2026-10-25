import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { DEFAULT_DIALS } from '../src/sim/dials.ts';
import { QUIET_THINK_MINUTES, Town } from '../src/town.ts';
import { expectInWorld, newWorld, put, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));

describe('hunger that matters', () => {
  it('from 800 the stomach aches; from 950 they are faint and must eat now', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 700;
    expect(seen(w, 'Siti')).not.toMatch(/stomach aches|faint with hunger/);
    siti.hunger = 800;
    expect(seen(w, 'Siti')).toContain('Your stomach aches; you need to eat soon.');
    siti.hunger = 950;
    const s = seen(w, 'Siti');
    expect(s).toContain("You're faint with hunger. You must eat now.");
    expect(s).not.toContain('stomach aches');
    for (const line of s.split('\n')) expectInWorld(line);
  });

  it('starving, a resident eats food they carry at once, without a thought', () => {
    const w = newWorld(9);
    const raju = put(w, 'Raju', 'jetty');
    raju.hunger = 960;
    raju.items = { fish: 2, bread: 1 };
    raju.activity = { kind: 'fishing', until: w.t + 20 };
    advance(w);
    // The most filling first; what they were doing carries on.
    expect(raju.items.bread ?? 0).toBe(0);
    expect(raju.hunger).toBeLessThan(800);
    expect(raju.activity).toMatchObject({ kind: 'fishing' });
    expect(raju.recent.some((o) => o.text === "Faint with hunger, you eat the loaf of bread you were carrying.")).toBe(true);
    expect(w.takeEvents().some((e) => e.type === 'ate' && e.who === raju.id)).toBe(true);
  });

  it('not when merely hungry, nor asleep', () => {
    const w = newWorld(9);
    const raju = put(w, 'Raju', 'jetty');
    raju.hunger = 900;
    raju.items = { fish: 1 };
    advance(w);
    expect(raju.items.fish).toBe(1);
  });
});

describe('the nudge, when hungry, points to food', () => {
  it('a hungry resident pottering about is told where food is sold, not only where there is work', async () => {
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(9, 0) - 1;
    const town = Town.create(1, start, { brains: () => idle });
    for (const r of town.world.state.residents) {
      r.thinkAt = start + 1000;
      r.lastDone = { what: 'fish', t: start };
    }
    const w = town.world;
    const kopitiam = w.shop('kopitiam')!;
    kopitiam.sellPrices = { 'fish porridge': 40 };
    kopitiam.stock = { 'fish porridge': 3 };
    put(w, 'Ah Huat', 'kopitiam');
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 820;
    siti.money = 500;
    siti.thinkAt = start + 1;
    await town.runUntil(start + 1);
    const text = siti.reply?.text ?? '';
    expect(text).toMatch(/^You're hungry\. You could get something to eat at the kopitiam\.$/);
    expectInWorld(text);
    expect(QUIET_THINK_MINUTES).toBeGreaterThan(0);
  });
});

describe('travellers leave some for the kampung', () => {
  it("travellers don't buy the last few of anything (an owner's dial); residents still can", () => {
    expect(DEFAULT_DIALS.travellerReserve).toBe(2);
    const w = newWorld(6, 29);
    put(w, 'Rahim', 'market-stall');
    const shop = w.shop('market-stall')!;
    shop.stock = { fish: 4, vegetables: 2 };
    for (let i = 0; i < 120; i++) {
      advance(w);
      const r = who(w, 'Rahim');
      r.activity = null;
      r.hunger = 100;
      r.energy = 900;
    }
    expect(shop.stock.fish).toBe(2);
    expect(shop.stock.vegetables).toBe(2);
    expect(shop.today.served).toBe(2);
  });
});
