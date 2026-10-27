import { describe, expect, it } from 'vitest';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** Ah Huat at his kopitiam with rice and water in the kitchen. */
function kitchen() {
  const w = newWorld(9, 0);
  const huat = put(w, 'Ah Huat', 'kopitiam');
  const shop = w.shop('kopitiam')!;
  shop.stock = { rice: 2, water: 2 };
  return { w, huat, shop };
}
const cookDone = (w: World) => { for (let k = 0; k < 40; k++) advance(w); };

describe('what a keeper cooks at their own stall goes on sale (a dish never priced sat unsold)', () => {
  it('a dish with no price goes on the counter at a first price from what goes into it, and they hear so', () => {
    const { w, huat, shop } = kitchen();
    expect(shop.sellPrices.bubur).toBeUndefined();
    accepted(act(w, huat.id, { verb: 'cook', item: 'bubur' }));
    cookDone(w);
    expect(shop.stock.bubur).toBeGreaterThan(0);
    // A bag of rice (the town's 35¢; he doesn't buy rice) makes three bowls: about 12¢ a bowl, and half as much again, to the next 5¢.
    expect(shop.sellPrices.bubur).toBe(20);
    const heard = huat.recent.find((m) => /bubur/.test(m.text) && /counter/.test(m.text))?.text ?? '';
    expectInWorld(heard);
    // And a villager can buy it.
    const tan = put(w, 'Mdm Tan', 'kopitiam');
    tan.money = 1000;
    accepted(act(w, tan.id, { verb: 'buy', item: 'bubur' }));
  });

  it('a price already set stands', () => {
    const { w, huat, shop } = kitchen();
    shop.sellPrices.bubur = 45;
    accepted(act(w, huat.id, { verb: 'cook', item: 'bubur' }));
    cookDone(w);
    expect(shop.sellPrices.bubur).toBe(45);
  });

  it('grilled fish is priced from the fish he buys, not below it', () => {
    const { w, huat, shop } = kitchen();
    shop.stock = { fish: 2 };
    accepted(act(w, huat.id, { verb: 'cook', item: 'grilled fish' }));
    cookDone(w);
    // He buys fish at 25¢: two fish make two, 25¢ each, half as much again: 40¢.
    expect(shop.sellPrices['grilled fish']).toBe(40);
  });

  it('a dish another stall sells takes its price there', async () => {
    const { startingPrice } = await import('../src/sim/travellers.ts');
    const { w, shop } = kitchen();
    w.shop('provision-shop')!.sellPrices.bubur = 30;
    expect(startingPrice(w, shop, 'bubur')).toBe(30);
  });

  it('once a keeper stops selling a dish, cooking it again keeps it off the counter', () => {
    const { w, huat, shop } = kitchen();
    shop.stock = { rice: 3, water: 3 };
    accepted(act(w, huat.id, { verb: 'cook', item: 'bubur' }));
    cookDone(w);
    accepted(act(w, huat.id, { verb: 'set_price', item: 'bubur', price: 0 }));
    accepted(act(w, huat.id, { verb: 'cook', item: 'bubur' }));
    cookDone(w);
    expect(shop.sellPrices.bubur).toBeUndefined();
    // Priced again, it's on again.
    accepted(act(w, huat.id, { verb: 'set_price', item: 'bubur', price: 25 }));
    expect(shop.notSelling).not.toContain('bubur');
  });

  it('"cook fish" in a kitchen that could make fish porridge asks which', () => {
    const { w, huat, shop } = kitchen();
    shop.stock = { fish: 2, rice: 2, water: 2 };
    refused(act(w, huat.id, { verb: 'cook', item: 'fish' }), /grilled fish.*fish porridge|fish porridge.*grilled fish/i);
  });

  it('stock with no price is seen as not for sale', () => {
    const { w } = kitchen();
    expect(seen(w, 'Ah Huat')).toMatch(/not for sale: [^.]*rice/i);
  });

  it('the upgrade (save v30) puts cooked dishes already sitting unpriced on the counter; raw goods stay as they are', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 29)!;
    const world = {
      shops: [
        { id: 'kopitiam', ownerId: 'ah-huat', stock: { bubur: 35, 'grilled fish': 7, rice: 4 }, sellPrices: { kopi: 20, 'fish porridge': 50 }, buyPrices: {} },
        { id: 'market-stall', ownerId: null, stock: { bubur: 2 }, sellPrices: {}, buyPrices: {} },
      ],
    };
    const up = step.save!({ world, brains: {} }).world as { shops: { sellPrices: Record<string, number>; notSelling: string[] }[] };
    // From what goes into them, as when cooked: bubur 20¢; grilled fish from the town's 55¢ fish, 85¢.
    expect(up.shops[0]!.sellPrices).toEqual({ kopi: 20, 'fish porridge': 50, bubur: 20, 'grilled fish': 85 });
    expect(up.shops[1]!.sellPrices).toEqual({});
    expect(up.shops.map((x) => x.notSelling)).toEqual([[], []]);
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});

describe('the things said again and again (promise loops): what blocked the doing', () => {
  it('a keeper at their stall hands over a dish from its stock (Ah Huat was told "you don\'t have a bowl of bubur" 83 times)', () => {
    const { w, huat, shop } = kitchen();
    shop.stock = { bubur: 3 };
    const tan = put(w, 'Mdm Tan', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'give', to: 'Mdm Tan', item: 'bubur' }));
    expect(tan.items.bubur).toBe(1);
    expect(shop.stock.bubur).toBe(2);
  });

  it('away from it, they hear where it is', () => {
    const { w, huat, shop } = kitchen();
    shop.stock = { bubur: 3 };
    put(w, 'Ah Huat', 'well');
    put(w, 'Mdm Tan', 'well');
    refused(act(w, huat.id, { verb: 'give', to: 'Mdm Tan', item: 'bubur' }), /in your stock at the kopitiam/);
    // Not when even the stock hasn't enough.
    expect(act(w, huat.id, { verb: 'give', to: 'Mdm Tan', item: 'bubur', qty: 9 }).reply).not.toMatch(/stock/);
    void huat;
  });

  it('"cook fish" means grilling it (Raju was told he didn\'t know how to make "fish" 23 times)', () => {
    const w = newWorld(9, 0);
    const raju = put(w, 'Raju', who(w, 'Raju').homeId);
    raju.items = { fish: 2 };
    const asFish = act(w, raju.id, { verb: 'cook', item: 'fish' });
    const asIkan = act(w, raju.id, { verb: 'cook', item: 'ikan' });
    expect(asFish.reply).not.toMatch(/know how to make/);
    expect(asIkan.reply).not.toMatch(/know how to make/);
  });
});
