import { describe, expect, it } from 'vitest';
import { ITEMS, type ItemId } from '../src/sim/items.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { FORAGES_A_DAY } from '../src/sim/actions/chores.ts';
import { ILL_AFTER, WELL_AFTER } from '../src/sim/sickness.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** Run on until the resident is done with what they're doing. */
function until(w: World, name: string, limit = 120) {
  const r = who(w, name);
  for (let i = 0; i < limit && r.activity; i++) advance(w);
  expect(r.activity).toBeNull();
}

describe('three meals a day (subsistence.md Q2)', () => {
  it('a proper meal takes off about a third of a day\'s hunger; a snack, less', () => {
    const meals: ItemId[] = ['bubur', 'fish porridge', 'vegetable rice', 'grilled fish', 'sambal kangkong'];
    const snacks: ItemId[] = ['fish', 'banana', 'coconut', 'bread', 'boiled kangkong', 'vegetables', 'papaya', 'red snapper'];
    for (const m of meals) {
      expect(ITEMS[m].food!.hunger, m).toBeGreaterThanOrEqual(330);
      expect(ITEMS[m].food!.hunger, m).toBeLessThanOrEqual(380);
    }
    for (const s of snacks) {
      expect(ITEMS[s].food!.hunger, s).toBeGreaterThanOrEqual(100);
      expect(ITEMS[s].food!.hunger, s).toBeLessThanOrEqual(220);
    }
    expect(ITEMS.kopi.food!.hunger).toBeLessThan(100);
  });
});

describe('foraging: the land feeds the poor, a little (Q1)', () => {
  it('at the farm plot: half an hour, and wild kangkong or a hand of bananas', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    siti.items = {};
    const res = accepted(act(w, siti.id, { verb: 'forage' }));
    expectInWorld(res.reply ?? '');
    const start = w.t;
    until(w, 'Siti');
    expect(w.t - start).toBeGreaterThanOrEqual(29);
    expect(w.t - start).toBeLessThanOrEqual(31);
    const got = Object.keys(siti.items);
    expect(got.length).toBe(1);
    expect(['vegetables', 'banana']).toContain(got[0]);
  });

  it('at the jetty: a coconut off the palms; both are eaten as they are', () => {
    const w = newWorld(9);
    const raju = put(w, 'Raju', 'jetty');
    raju.items = {};
    raju.hunger = 600;
    accepted(act(w, raju.id, { verb: 'forage' }));
    until(w, 'Raju');
    expect(raju.items).toEqual({ coconut: 1 });
    accepted(act(w, raju.id, { verb: 'eat', item: 'coconut' }));
    expect(raju.hunger).toBeLessThan(600 - 100 + 30);
  });

  it('at most two a day each; tomorrow there is more', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    for (let i = 0; i < FORAGES_A_DAY; i++) {
      accepted(act(w, siti.id, { verb: 'forage' }));
      until(w, 'Siti');
    }
    put(w, 'Siti', 'farm');
    expectInWorld(refused(act(w, siti.id, { verb: 'forage' })));
    expect(siti.activity).toBeNull();
    w.state.t = sgt(9, 0, 1);
    accepted(act(w, siti.id, { verb: 'forage' }));
  });

  it("can't be done elsewhere", () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    expectInWorld(refused(act(w, siti.id, { verb: 'forage' })));
  });
});

describe('owners see what unserved travellers would have paid (Q3.3)', () => {
  it('away from the counter has a cost, in money', () => {
    const w = newWorld(6, 29);
    put(w, 'Ah Huat', 'well');
    const shop = w.shop('kopitiam')!;
    for (let i = 0; i < 31; i++) advance(w);
    expect(shop.today.away).toBeGreaterThan(0);
    expect(shop.today.lost).toBeGreaterThan(0);
    put(w, 'Ah Huat', 'kopitiam');
    const s = seen(w, 'Ah Huat');
    expect(s).toMatch(/Travellers who left unserved today would have paid about \$\d+\.\d\d\./);
    for (const line of s.split('\n')) expectInWorld(line);
  });

  it('never more than the travellers could still spend today, nor more than the stock that was there to sell', () => {
    const w = newWorld(6, 0);
    put(w, 'Ah Huat', 'well');
    const shop = w.shop('kopitiam')!;
    shop.stock = { kopi: 10, 'fish porridge': 4 };
    shop.sellPrices = { kopi: 20, 'fish porridge': 50 };
    const sellable = (10 - w.dials.travellerReserve) * 20 + (4 - w.dials.travellerReserve) * 50;
    for (let i = 0; i < 15 * 60; i++) advance(w);
    expect(shop.today.lost).toBeGreaterThan(0);
    expect(shop.today.lost).toBeLessThanOrEqual(Math.min(sellable, w.dials.travellerBudgetCents));
  });
});

describe('sickness from hunger (Q4): never death', () => {
  function faintFor(w: World, name: string, minutes: number) {
    const r = who(w, name);
    for (let i = 0; i < minutes; i++) {
      r.hunger = 1000;
      r.items = {};
      if (r.activity?.kind === 'sleeping') r.activity = null;
      advance(w);
    }
    return r;
  }

  it('about a day at faint, and a resident falls ill', () => {
    const w = newWorld(9);
    const aminah = faintFor(w, 'Aminah', ILL_AFTER - 5);
    expect(aminah.ill).toBeNull();
    faintFor(w, 'Aminah', 10);
    expect(aminah.ill).not.toBeNull();
    expect(aminah.recent.some((o) => /ill/.test(o.text))).toBe(true);
  });

  it('ill, they cannot work a shift, do chores or fish, and they tire quickly', () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    siti.ill = { since: w.t, better: null };
    put(w, 'Siti', 'jetty');
    expectInWorld(refused(act(w, siti.id, { verb: 'fish' })));
    expectInWorld(refused(act(w, siti.id, { verb: 'forage' })));
    const huat = put(w, 'Ah Huat', 'kopitiam');
    put(w, 'Siti', 'kopitiam');
    w.state.jobs.push({ id: 99, employerId: huat.id, workerId: siti.id, placeId: 'kopitiam', wage: 100, startHour: 9, hours: 4, lastWorkedDay: null });
    expectInWorld(refused(act(w, siti.id, { verb: 'work_shift' })));
    const well = who(w, 'Muthu');
    siti.energy = 800; well.energy = 800;
    siti.hunger = 100; well.hunger = 100;
    put(w, 'Muthu', 'kopitiam');
    for (let i = 0; i < 30; i++) advance(w);
    expect(siti.energy).toBeLessThan(well.energy);
  });

  it('the ill are not offered, nor pointed to, what they are too ill for', async () => {
    const { availableActions } = await import('../src/sim/actions/index.ts');
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    siti.ill = { since: w.t, better: null };
    siti.hunger = 800;
    siti.items = {};
    siti.money = 0;
    const verbs = availableActions(w, siti).map((a) => a.verb);
    for (const v of ['fish', 'forage', 'mend nets']) expect(verbs).not.toContain(v);
    put(w, 'Siti', 'well');
    expect(seen(w, 'Siti')).not.toMatch(/catch a fish/);
  });

  it('foraging is not offered once the day\'s two are done', async () => {
    const { availableActions } = await import('../src/sim/actions/index.ts');
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    siti.foraged = { day: Math.floor((w.t + 480) / 1440), n: FORAGES_A_DAY };
    expect(availableActions(w, siti).map((a) => a.verb)).not.toContain('forage');
  });

  it('three proper meals a day see an ill resident well within about a day', () => {
    const w = newWorld(6, 0);
    const siti = put(w, 'Siti', 'well');
    siti.ill = { since: w.t, better: null };
    siti.hunger = 1000;
    siti.items = {};
    for (let i = 0; i < 3 * 1440 && siti.ill; i++) {
      const mod = (w.t + 480) % 1440;
      if (mod === 7 * 60 || mod === 12 * 60 || mod === 18 * 60) siti.hunger = Math.max(0, siti.hunger - ITEMS['grilled fish'].food!.hunger);
      advance(w);
    }
    expect(siti.ill).toBeNull();
  });

  it('ill and faint with hunger, both show', () => {
    const w = newWorld(9);
    const aminah = put(w, 'Aminah', 'well');
    aminah.ill = { since: w.t, better: null };
    aminah.hunger = 980;
    put(w, 'Siti', 'well');
    expect(seen(w, 'Siti')).toMatch(/Aminah \([^)]*looking ill and faint with hunger/);
  });

  it('others see it, and kin remember it', () => {
    const w = newWorld(9);
    const aminah = put(w, 'Aminah', 'well');
    aminah.ill = { since: w.t, better: null };
    aminah.items = { water: 1 };
    const fatimah = put(w, 'Fatimah', 'well');
    expect(seen(w, 'Fatimah')).toMatch(/Aminah \([^)]*looking ill/);
    advance(w);
    expect(fatimah.recent.some((o) => o.text === 'Aminah looked ill.')).toBe(true);
  });

  it('well again about six hours after hunger falls below hungry, getting hungry again meanwhile; faint again, the clock starts over', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.ill = { since: w.t, better: null };
    siti.hunger = 100;
    siti.items = {};
    for (let i = 0; i < 60; i++) { siti.hunger = 100; advance(w); }
    for (let i = 0; i < WELL_AFTER - 70; i++) { siti.hunger = 600; advance(w); }
    expect(siti.ill).not.toBeNull();
    for (let i = 0; i < 20; i++) { siti.hunger = 600; advance(w); }
    expect(siti.ill).toBeNull();
    siti.ill = { since: w.t, better: null };
    for (let i = 0; i < WELL_AFTER - 10; i++) { siti.hunger = 100; advance(w); }
    siti.hunger = 960;
    advance(w);
    for (let i = 0; i < 20; i++) { siti.hunger = 100; advance(w); }
    expect(siti.ill).not.toBeNull();
    for (let i = 0; i < WELL_AFTER; i++) { siti.hunger = 100; if (siti.activity?.kind === 'sleeping') siti.activity = null; advance(w); }
    expect(siti.ill).toBeNull();
    expect(siti.recent.some((o) => /better|well again/.test(o.text))).toBe(true);
  });
});

describe('the upgrade (save v20)', () => {
  it('nobody has foraged or is ill; anyone already faint starts counting from now; no lost sales yet', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 19)!;
    const world = {
      t: 5000,
      residents: [{ id: 'a', hunger: 1000 }, { id: 'b', hunger: 300 }],
      shops: [{ id: 'kopitiam', today: { day: 3, served: 2, left: 1 } }],
    };
    const up = step.save!({ world, brains: {} }).world as { residents: Record<string, unknown>[]; shops: { today: Record<string, unknown> }[]; illSeen: unknown };
    expect(up.residents[0]).toMatchObject({ foraged: null, faintFrom: 5000, ill: null });
    expect(up.residents[1]).toMatchObject({ foraged: null, faintFrom: null, ill: null });
    expect(up.shops[0]!.today).toEqual({ day: 3, served: 2, left: 1, lost: 0 });
    expect(up.illSeen).toEqual({});
    expect(world.residents[0]).toEqual({ id: 'a', hunger: 1000 });
  });
});

describe('sickness and the rest of the town', () => {
  it('a quiet spell (the town away) does not count towards falling ill', async () => {
    const { skipQuietly } = await import('../src/sim/skip.ts');
    const w = newWorld(9);
    const raju = who(w, 'Raju');
    raju.hunger = 1000;
    raju.faintFrom = w.t - 60;
    skipQuietly(w, w.t + 20 * 60);
    expect(w.t - raju.faintFrom).toBe(60);
  });

  it('ill and pottering about away from home, they think of resting at home', async () => {
    const { Town, QUIET_THINK_MINUTES } = await import('../src/town.ts');
    const idle = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(14, 0) - 1;
    const town = Town.create(1, start, { brains: () => idle });
    for (const r of town.world.state.residents) { r.thinkAt = start + 1000; r.lastDone = { what: 'fish', t: start }; }
    const siti = put(town.world, 'Siti', 'well');
    siti.ill = { since: start, better: null };
    siti.hunger = 100;
    siti.thinkAt = start + 3 * QUIET_THINK_MINUTES;
    await town.runUntil(start + 3 * QUIET_THINK_MINUTES);
    expect(siti.reply?.text).toBe("You feel ill. You'd do best to rest at home.");
  });
});
