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
  it('a dish with no price goes on the counter at their cheapest dish price, and they hear so', () => {
    const { w, huat, shop } = kitchen();
    expect(shop.sellPrices.bubur).toBeUndefined();
    accepted(act(w, huat.id, { verb: 'cook', item: 'bubur' }));
    cookDone(w);
    expect(shop.stock.bubur).toBeGreaterThan(0);
    // His cheapest dish (kopi, in the test prices).
    expect(shop.sellPrices.bubur).toBe(shop.sellPrices.kopi);
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

  it('stock with no price is seen as not for sale', () => {
    const { w } = kitchen();
    expect(seen(w, 'Ah Huat')).toMatch(/not for sale: [^.]*rice/i);
  });

  it('the upgrade (save v30) puts cooked dishes already sitting unpriced on the counter; raw goods stay as they are', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 29)!;
    const world = {
      shops: [
        { id: 'kopitiam', ownerId: 'ah-huat', stock: { bubur: 35, 'grilled fish': 7, rice: 4 }, sellPrices: { kopi: 20, 'fish porridge': 50 } },
        { id: 'market-stall', ownerId: null, stock: { bubur: 2 }, sellPrices: {} },
      ],
    };
    const up = step.save!({ world, brains: {} }).world as { shops: { sellPrices: Record<string, number> }[] };
    expect(up.shops[0]!.sellPrices).toEqual({ kopi: 20, 'fish porridge': 50, bubur: 20, 'grilled fish': 20 });
    expect(up.shops[1]!.sellPrices).toEqual({});
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
    refused(act(w, huat.id, { verb: 'give', to: 'Mdm Tan', item: 'bubur' }), /kopitiam/);
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
