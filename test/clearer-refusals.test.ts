import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { Town } from '../src/town.ts';
import { accepted, act, newWorld, put, refused, sgt, who } from './helpers.ts';

// Repeated refusals on game days 20765-20766 (Kampung, 2026-10-29): each was read as something else and tried again.
const offered = (w: World, name: string, verb: string) => perceive(w, who(w, name)).actions.some((a) => a.verb === verb);

describe('short of something to cook with, said plainly', () => {
  it('at home with none at all: "You have no water", not "one batch"', () => {
    const w = newWorld(9);
    const raju = put(w, 'Raju', who(w, 'Raju').homeId);
    raju.items = { rice: 3, pot: 1, firewood: 1 };
    const reply = refused(act(w, raju.id, { verb: 'cook', item: 'bubur' }));
    expect(reply).toMatch(/^You have no water\b/);
    expect(reply).toMatch(/a bag of rice and a pail of water/);
  });

  it('at home with too little: says how much they have', () => {
    const w = newWorld(9);
    const hassan = put(w, 'Hassan', who(w, 'Hassan').homeId);
    hassan.items = { fish: 1, firewood: 1 };
    expect(refused(act(w, hassan.id, { verb: 'cook', item: 'grilled fish' }))).toMatch(/^You have only a fish\b/);
  });

  it('in a kitchen: none there, or only enough for so many batches', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    huat.items = {};
    w.shop('kopitiam')!.stock = { coffee: 2, rice: 4, fish: 1 };
    expect(refused(act(w, huat.id, { verb: 'cook', item: 'kopi' }))).toMatch(/^The kitchen and your bag have no water\b/);
    w.shop('kopitiam')!.stock.water = 5;
    expect(refused(act(w, huat.id, { verb: 'cook', item: 'fish porridge', batches: 3 }))).toMatch(/^There's enough fish for only 1 batch\b/);
  });

  it('still ends the thought after one try', async () => {
    let tries = 0;
    const cook: Brain = { decide: () => { tries++; return { verb: 'cook', item: 'bubur' }; }, save: () => null, load: () => {} };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(14, 0) - 1;
    const town = Town.create(1, start, { brains: (r) => (r.name === 'Raju' ? cook : idle) });
    const w = town.world;
    for (const r of w.state.residents) r.thinkAt = start + 1000;
    const raju = put(w, 'Raju', who(w, 'Raju').homeId);
    raju.items = { rice: 3, firewood: 1 };
    raju.thinkAt = start + 1;
    await town.runUntil(start + 1);
    expect(tries).toBe(1);
    expect(raju.reply?.text).toMatch(/^You have no water/);
  });
});

describe('things called by their Malay names', () => {
  it('roti is bread, ikan panggang is grilled fish, kelapa muda and air kelapa are a coconut', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    fatimah.items = { bread: 1, 'grilled fish': 1, coconut: 2 };
    fatimah.hunger = 900;
    accepted(act(w, fatimah.id, { verb: 'eat', item: 'roti' }));
    fatimah.hunger = 900;
    accepted(act(w, fatimah.id, { verb: 'eat', item: 'ikan panggang' }));
    fatimah.hunger = 900;
    accepted(act(w, fatimah.id, { verb: 'eat', item: 'kelapa muda' }));
    fatimah.hunger = 900;
    accepted(act(w, fatimah.id, { verb: 'eat', item: 'air kelapa' }));
    expect(fatimah.items.bread ?? 0).toBe(0);
    expect(fatimah.items['grilled fish'] ?? 0).toBe(0);
    expect(fatimah.items.coconut ?? 0).toBe(0);
  });
});

describe('harvesting the last bed', () => {
  it('then harvest and water are no longer offered, and asking says nothing of theirs is planted now', () => {
    const w = newWorld(9);
    const kow = put(w, 'Ah Kow', 'farm');
    expect(offered(w, 'Ah Kow', 'harvest')).toBe(false);
    expect(offered(w, 'Ah Kow', 'water')).toBe(false);
    accepted(act(w, kow.id, { verb: 'plant' }));
    expect(offered(w, 'Ah Kow', 'harvest')).toBe(true);
    expect(offered(w, 'Ah Kow', 'water')).toBe(true);
    const bed = w.state.beds.find((b) => b.planterId === kow.id)!;
    bed.plantedDay -= 10;
    bed.wateredDays = 10;
    accepted(act(w, kow.id, { verb: 'harvest' }));
    expect(offered(w, 'Ah Kow', 'harvest')).toBe(false);
    expect(refused(act(w, kow.id, { verb: 'harvest' }))).toMatch(/^Nothing of yours is planted on the plot now\./);
  });
});
