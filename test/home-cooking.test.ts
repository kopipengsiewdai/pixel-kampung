import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { ITEMS } from '../src/sim/items.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { threshold } from '../src/sim/skills.ts';
import type { Resident, World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { QUIET_THINK_MINUTES, Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const offered = (w: World, name: string, verb: string) => perceive(w, who(w, name)).actions.some((a) => a.verb === verb);
const atHome = (w: World, name: string): Resident => { const r = who(w, name); return put(w, name, r.homeId); };
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) advance(w); };

describe('firewood', () => {
  it('is gathered past the farm plot: 20 minutes, one bundle', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    expect(offered(w, 'Siti', 'gather firewood')).toBe(false);
    refused(act(w, siti.id, { verb: 'gather_firewood' }), /past the farm plot/);
    put(w, 'Siti', 'farm');
    expect(offered(w, 'Siti', 'gather firewood')).toBe(true);
    accepted(act(w, siti.id, { verb: 'gather_firewood' }));
    siti.hunger = 100;
    run(w, 20);
    expect(siti.activity).toBeNull();
    expect(siti.items.firewood).toBe(1);
    expect(ITEMS.firewood.food).toBeUndefined();
  });
});

describe('cooking at home', () => {
  it('anyone can cook a plain dish in their own house: from what they carry, 2 servings, into their hands', () => {
    const w = newWorld(9);
    const siti = atHome(w, 'Siti');
    siti.skills = {};
    siti.items = { rice: 1, water: 1, firewood: 1 };
    expect(offered(w, 'Siti', 'cook')).toBe(true);
    accepted(act(w, siti.id, { verb: 'cook', item: 'bubur' }));
    expect(siti.items.rice ?? 0).toBe(0);
    expect(siti.items.firewood ?? 0).toBe(0);
    siti.hunger = 100;
    run(w, 15);
    expect(siti.stove).toBeNull();
    expect(siti.items.bubur).toBe(2);
  });

  it('grilled fish and boiled kangkong: two of the raw thing, two servings that fill more', () => {
    const w = newWorld(9);
    const hassan = atHome(w, 'Hassan');
    hassan.items = { fish: 2, vegetables: 2, firewood: 2 };
    accepted(act(w, hassan.id, { verb: 'cook', item: 'ikan bakar' }));
    hassan.hunger = 100;
    run(w, 15);
    accepted(act(w, hassan.id, { verb: 'cook', item: 'boiled kangkong' }));
    run(w, 15);
    expect(hassan.items['grilled fish']).toBe(2);
    expect(hassan.items['boiled kangkong']).toBe(2);
    expect(ITEMS['grilled fish'].food!.hunger).toBeGreaterThan(ITEMS.fish.food!.hunger);
    expect(ITEMS['boiled kangkong'].food!.hunger).toBeGreaterThan(ITEMS.vegetables.food!.hunger);
  });

  it('one small pot: one batch at a time, and one pot on a house\'s stove at once', () => {
    const w = newWorld(9);
    const fat = atHome(w, 'Fatimah');
    fat.items = { rice: 3, water: 3, firewood: 3 };
    const res = accepted(act(w, fat.id, { verb: 'cook', item: 'bubur', batches: 3 }));
    expect(res.reply).toMatch(/one small pot/);
    expect(fat.stove!.qty).toBe(2);
    expect(fat.items.rice).toBe(2);
    const aminah = atHome(w, 'Aminah');
    aminah.items = { rice: 1, water: 1, firewood: 1 };
    refused(act(w, aminah.id, { verb: 'cook', item: 'bubur' }), /already a pot on the stove/);
    fat.hunger = 100;
    aminah.hunger = 100;
    run(w, 15);
    accepted(act(w, aminah.id, { verb: 'cook', item: 'bubur' }));
  });

  it('away from home, the stove is at home', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.items = { rice: 1, water: 1, firewood: 1 };
    refused(act(w, siti.id, { verb: 'cook', item: 'bubur' }), /stove is at home/);
  });

  it('a master cook gets one more serving at home too', () => {
    const w = newWorld(9);
    const esah = atHome(w, 'Mak Esah');
    esah.items = { rice: 1, water: 1, firewood: 1 };
    accepted(act(w, esah.id, { verb: 'cook', item: 'bubur' }));
    esah.hunger = 100;
    run(w, 15);
    expect(esah.items.bubur).toBe(3);
  });

  it('no fuel, no fire; no skilled dishes at home; not in someone else\'s house', () => {
    const w = newWorld(9);
    const siti = atHome(w, 'Siti');
    siti.items = { rice: 1, water: 1 };
    refused(act(w, siti.id, { verb: 'cook', item: 'bubur' }), /firewood or kerosene/);
    siti.skills.cooking = { xp: threshold('cooking', 3), peak: 3, lastDay: dayIndex(w.t), today: { day: dayIndex(w.t), xp: 0 }, rusty: false, drops: 0 };
    siti.items = { vegetables: 1, chilli: 1, firewood: 1 };
    refused(act(w, siti.id, { verb: 'cook', item: 'sambal kangkong' }), /proper kitchen/);
    const raju = who(w, 'Raju');
    put(w, 'Raju', siti.homeId);
    raju.items = { rice: 1, water: 1, firewood: 1 };
    if (raju.homeId !== siti.homeId) refused(act(w, raju.id, { verb: 'cook', item: 'bubur' }), /stove is at home/);
  });

  it('a tin of kerosene in the stove lasts four batches, for anyone in the house, before any firewood', () => {
    const w = newWorld(9);
    const fat = atHome(w, 'Fatimah');
    fat.items = { kerosene: 1, firewood: 1, rice: 4, water: 4 };
    for (let b = 0; b < 4; b++) {
      accepted(act(w, fat.id, { verb: 'cook', item: 'bubur' }));
      fat.hunger = 100;
      run(w, 15);
    }
    expect(fat.items.kerosene ?? 0).toBe(0);
    expect(fat.items.firewood).toBe(1);
    expect(w.state.stoves[fat.homeId] ?? 0).toBe(0);
    // Someone else in the house uses what's left in the stove.
    fat.items = { ...fat.items, kerosene: 1, rice: 1, water: 1 };
    accepted(act(w, fat.id, { verb: 'cook', item: 'bubur' }));
    run(w, 15);
    const aminah = atHome(w, 'Aminah');
    aminah.items = { rice: 1, water: 1 };
    accepted(act(w, aminah.id, { verb: 'cook', item: 'bubur' }));
    expect(w.state.stoves[fat.homeId]).toBe(2);
    expect(describePerception(perceive(w, fat))).toMatch(/kerosene in the stove/);
  });
});

describe('family: the hungry think of their kin', () => {
  it('with no shop being minded, a hungry resident thinks of a relative in another house, and of the jetty in turn', async () => {
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(9, 0) - 1;
    const town = Town.create(1, start, { brains: () => idle });
    const w = town.world;
    for (const r of w.state.residents) {
      r.thinkAt = start + 1000;
      r.lastDone = { what: 'fish', t: start };
      put(w, r.name, r.homeId);
    }
    for (const s of w.state.shops) s.stock = {};
    const aminah = put(w, 'Aminah', 'well');
    aminah.hunger = 820;
    aminah.items = {};
    aminah.thinkAt = start + 1;
    const heard: string[] = [];
    for (let k = 0; k < 2; k++) {
      const at = start + 1 + k * QUIET_THINK_MINUTES;
      aminah.thinkAt = at;
      put(w, 'Aminah', 'well');
      await town.runUntil(at);
      heard.push(aminah.reply?.text ?? '');
    }
    expect(heard).toContain("You're hungry. You could ask your uncle Rahim for something to eat.");
    expect(heard).toContain("You're hungry. You could catch a fish at the jetty.");
    for (const text of heard) expectInWorld(text);
  });
});

describe('family: a faint relative is remembered', () => {
  it('seeing kin faint with hunger becomes a memory, once a day', () => {
    const w = newWorld(9);
    const remembered: { id: string; text: string }[] = [];
    w.observer = (id, _t, text) => { remembered.push({ id, text }); };
    const rahim = put(w, 'Rahim', 'well');
    const aminah = put(w, 'Aminah', 'well');
    aminah.hunger = 990;
    rahim.hunger = 100;
    run(w, 3);
    // However much else is going on meanwhile.
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 20; i++) w.remember(rahim.id, `Something else happens (${k}, ${i}).`);
      run(w, 1);
    }
    const seen = remembered.filter((x) => x.id === rahim.id && /Aminah looked faint with hunger/.test(x.text));
    expect(seen).toHaveLength(1);
    // Not for someone who isn't family.
    const kow = put(w, 'Ah Kow', 'well');
    kow.hunger = 100;
    run(w, 2);
    expect(kow.recent.some((o) => /faint with hunger/.test(o.text))).toBe(false);
  });
});
