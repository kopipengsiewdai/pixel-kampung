import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { ITEMS } from '../src/sim/items.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { Goods, World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const offered = (w: World, name: string, verb: string) => perceive(w, who(w, name)).actions.some((a) => a.verb === verb);

describe('bubur: rice and water, a dish any cook knows', () => {
  it('cooks as bubur, plain rice or just rice, and it fills a stomach', () => {
    for (const asked of ['bubur', 'plain rice', 'rice']) {
      const w = newWorld(9);
      const huat = put(w, 'Ah Huat', 'kopitiam');
      huat.skills = {};
      // Only rice and water in: "rice" can only be bubur (with fish in too, they'd be asked which).
      const stock: Goods = (w.shop('kopitiam')!.stock = { rice: 1, water: 1 });
      accepted(act(w, huat.id, { verb: 'cook', item: asked }));
      for (let i = 0; i < 15; i++) advance(w);
      expect(stock.bubur).toBe(3);
      expect(stock.rice ?? 0).toBe(0);
    }
    expect(ITEMS.bubur.food!.hunger).toBeGreaterThanOrEqual(300);
  });
});

describe('a cook can use what they carry', () => {
  it('the kitchen short of coffee, the coffee in their bag goes in', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const stock = w.shop('kopitiam')!.stock;
    delete stock.coffee;
    stock.water = 1;
    huat.items = { coffee: 1 };
    accepted(act(w, huat.id, { verb: 'cook', item: 'kopi' }));
    expect(huat.items.coffee ?? 0).toBe(0);
    expect(stock.water ?? 0).toBe(0);
  });

  it('still short when neither has enough', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const stock = w.shop('kopitiam')!.stock;
    delete stock.coffee;
    huat.items = {};
    refused(act(w, huat.id, { verb: 'cook', item: 'kopi' }), /no coffee powder/);
  });
});

describe('eating is offered only with something edible to hand', () => {
  it('raw rice and coffee powder alone offer nothing to eat; bread does', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.items = { rice: 2, coffee: 1 };
    expect(offered(w, 'Siti', 'eat')).toBe(false);
    siti.items.bread = 1;
    expect(offered(w, 'Siti', 'eat')).toBe(true);
  });
});

describe('the notice board knows your own note', () => {
  it("the author sees it as their note; others see the author's name", () => {
    const w = newWorld(9);
    const mei = put(w, 'Mei Ling', 'notice-board');
    accepted(act(w, mei.id, { verb: 'pin_note', text: 'WANTED: a sewing machine.' }));
    expect(act(w, mei.id, { verb: 'read_notice_board' }).reply).toContain('"WANTED: a sewing machine." (your note)');
    const siti = put(w, 'Siti', 'notice-board');
    expect(act(w, siti.id, { verb: 'read_notice_board' }).reply).toContain('(Mei Ling)');
  });
});

describe('a neighbour can see someone is hungry', () => {
  it('nearby people look hungry, or faint with hunger', () => {
    const w = newWorld(9);
    put(w, 'Fatimah', 'well');
    const aminah = put(w, 'Aminah', 'well');
    aminah.hunger = 100;
    expect(seen(w, 'Fatimah')).not.toMatch(/Aminah \([^)]*hungry/);
    aminah.hunger = 750;
    expect(seen(w, 'Fatimah')).toMatch(/Aminah \([^)]*looking hungry\)/);
    aminah.hunger = 980;
    const s = seen(w, 'Fatimah');
    expect(s).toMatch(/Aminah \([^)]*looking faint with hunger\)/);
    for (const line of s.split('\n')) expectInWorld(line);
  });
});

describe('hungry, they are pointed only where someone will serve them', () => {
  const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
  function hungryTown(minded: boolean) {
    const start = sgt(14, 0) - 1;
    const town = Town.create(1, start, { brains: () => idle });
    const w = town.world;
    for (const r of w.state.residents) {
      r.thinkAt = start + 1000;
      r.lastDone = { what: 'fish', t: start };
      if (r.name !== 'Siti') put(w, r.name, r.homeId);
    }
    const stall = w.shop('market-stall')!;
    stall.sellPrices = { fish: 40 };
    stall.stock = { fish: 3 };
    for (const s of w.state.shops) if (s.id !== 'market-stall') s.stock = {};
    if (minded) put(w, w.resident(stall.ownerId!).name, 'market-stall');
    const siti = put(w, 'Siti', 'well');
    siti.knownPlaces.push('market-stall', 'jetty');
    siti.hunger = 820;
    siti.money = 500;
    siti.items = {};
    siti.thinkAt = start + 1;
    return { town, siti, start };
  }

  it('a minded stall is named', async () => {
    const { town, siti, start } = hungryTown(true);
    await town.runUntil(start + 1);
    expect(seen(w0(town), 'Siti')).toContain('You could get something to eat at the wet-market stall.');
  });

  it('an unminded one is not; the jetty is, for a fish', async () => {
    const { town, siti, start } = hungryTown(false);
    await town.runUntil(start + 1);
    const text = seen(w0(town), 'Siti');
    expect(text).not.toMatch(/at the wet-market stall/);
    expect(text).toContain('You could catch a fish at the jetty.');
  });
});

describe("nobody minding the shop: asking again this minute won't help", () => {
  it('one try, not three', async () => {
    let tries = 0;
    const buyer: Brain = { decide: () => { tries++; return { verb: 'buy', item: 'fish', qty: 1 }; }, save: () => null, load: () => {} };
    const start = sgt(9, 0) - 1;
    const town = Town.create(1, start, { brains: () => buyer });
    const w = town.world;
    for (const r of w.state.residents) r.thinkAt = start + 1000;
    const stall = w.shop('market-stall')!;
    put(w, w.resident(stall.ownerId!).name, w.resident(stall.ownerId!).homeId);
    const siti = put(w, 'Siti', 'market-stall');
    siti.thinkAt = start + 1;
    await town.runUntil(start + 1);
    expect(siti.reply?.text).toMatch(/^Nobody's minding/);
    expect(tries).toBe(1);
  });
});

describe('hungry while the lorry is in: it is named too', () => {
  it('with bread on the lorry they can afford, the lorry stop is where they could eat', async () => {
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(6, 0) - 1;
    const town = Town.create(1, start, { brains: () => idle });
    const w = town.world;
    for (const r of w.state.residents) {
      r.thinkAt = start + 100_000;
      r.lastDone = { what: 'fish', t: start };
    }
    for (const s of w.state.shops) s.stock = {};
    while (!w.state.osman.visit) advance(w);
    w.state.osman.visit.goods.bread = 5;
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 820;
    siti.money = 500;
    siti.items = {};
    siti.thinkAt = w.t + 1;
    await town.runUntil(w.t + 1);
    expect(seen(w, 'Siti')).toContain('You could get something to eat at the lorry stop.');
  });
});

function w0(town: Town): World {
  return town.world;
}
