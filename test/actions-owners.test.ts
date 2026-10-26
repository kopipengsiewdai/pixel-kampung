import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../src/sim/actions/index.ts';
import { advance } from '../src/sim/tick.ts';
import { advanceTo } from '../src/sim/tick.ts';
import { act, accepted, newWorld, put, refused, who, sgt } from './helpers.ts';
import { createWorld } from '../src/sim/seed.ts';
import { perceive } from '../src/sim/perception.ts';

describe('owners price everything themselves', () => {
  it('the kampung starts with stock on the shelves but no prices', () => {
    const state = createWorld(1, sgt(9));
    for (const shop of state.shops) {
      expect(Object.keys(shop.stock).length).toBeGreaterThan(0);
      expect(shop.sellPrices).toEqual({});
      expect(shop.buyPrices).toEqual({});
    }
  });
});

describe('set_price with a buying limit', () => {
  it('an owner buys only as many as they said', () => {
    const w = newWorld();
    const rahim = put(w, 'Rahim', 'market-stall');
    accepted(act(w, rahim.id, { verb: 'set_price', item: 'fish', price: 20, side: 'buy', limit: 3 }));
    const siti = put(w, 'Siti', 'market-stall');
    siti.items.fish = 6;
    accepted(act(w, siti.id, { verb: 'sell', item: 'fish', qty: 2 }));
    refused(act(w, siti.id, { verb: 'sell', item: 'fish', qty: 2 }), /only wants a fish more/);
    expect(perceive(w, siti).shop?.buys).toContainEqual({ item: 'fish', price: 20, wants: 1 });
    accepted(act(w, siti.id, { verb: 'sell', item: 'fish' }));
    refused(act(w, siti.id, { verb: 'sell', item: 'fish' }), /isn't buying any more fish/);
    accepted(act(w, rahim.id, { verb: 'set_price', item: 'fish', price: 18, side: 'buy', limit: 5 }));
    accepted(act(w, siti.id, { verb: 'sell', item: 'fish', qty: 3 }));
  });
  it('no limit on selling prices, and the limit must make sense', () => {
    const w = newWorld();
    const rahim = put(w, 'Rahim', 'market-stall');
    refused(act(w, rahim.id, { verb: 'set_price', item: 'fish', price: 30, limit: 3 }), /limit on how much you buy/);
    refused(act(w, rahim.id, { verb: 'set_price', item: 'fish', price: 20, side: 'buy', limit: -2 }), /sensible amount/);
  });
});

describe('set_price', () => {
  it('sets selling and buying prices at your own shop', () => {
    const w = newWorld();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'set_price', item: 'kopi', price: 12 }));
    accepted(act(w, huat.id, { verb: 'set_price', item: 'fish', price: '$0.22', side: 'buy' }));
    const shop = w.shop('kopitiam')!;
    expect(shop.sellPrices.kopi).toBe(12);
    expect(shop.buyPrices.fish).toBe(22);
    accepted(act(w, huat.id, { verb: 'set_price', item: 'kopi', price: 0 }));
    expect(shop.sellPrices.kopi).toBeUndefined();
  });

  it('setting the price it already is changes nothing: refused in-world, no event (live loop, 0.9.2)', () => {
    const w = newWorld();
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    accepted(act(w, tan.id, { verb: 'set_price', item: 'rice', price: 420 }));
    w.takeEvents();
    refused(act(w, tan.id, { verb: 'set_price', item: 'rice', price: '$4.20' }), /already/);
    refused(act(w, tan.id, { verb: 'set_price', item: 'rice', price: 0, side: 'buy' }), /already/); // not buying it anyway
    expect(w.takeEvents()).toEqual([]);
    accepted(act(w, tan.id, { verb: 'set_price', item: 'rice', price: 400 })); // a real change still works
  });
  it('refusals: not an owner, away from the shop, nonsense price', () => {
    const w = newWorld();
    refused(act(w, who(w, 'Siti').id, { verb: 'set_price', item: 'kopi', price: 5 }), /shopkeepers/);
    const huat = who(w, 'Ah Huat');
    refused(act(w, huat.id, { verb: 'set_price', item: 'kopi', price: 5 }), /be at your shop/);
    put(w, 'Ah Huat', 'kopitiam');
    refused(act(w, huat.id, { verb: 'set_price', item: 'kopi', price: 'cheap' }), /doesn't sound like a price/);
    refused(act(w, huat.id, { verb: 'set_price', item: 'gold', price: 5 }), /don't know what "gold" is/);
  });
});

describe('offer_job', () => {
  it('offers a nearby job-seeker a wage and hours', () => {
    const w = newWorld();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const siti = put(w, 'Siti', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: '$2.00', startHour: 8, hours: 4 }));
    expect(w.state.jobOffers).toHaveLength(1);
    expect(siti.recent.at(-1)?.text).toMatch(/offers you work at the kopitiam, from 8 in the morning to 12 noon every day, for \$2\.00/);
  });
  it('understands wages and hours the way people say them (live: 35 offers refused)', () => {
    const w = newWorld();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    put(w, 'Ah Kow', 'kopitiam');
    put(w, 'Mei Ling', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Ah Kow', money: '$1.50 a shift', startHour: '7am', hours: '4 hours' }));
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Mei Ling', wage: '$1.20', startHour: '17:00', hours: 3 }));
    expect(w.state.jobOffers.map((o) => [o.wage, o.startHour, o.hours])).toEqual([[150, 7, 4], [120, 17, 3]]);
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Ah Kow', wage: 150, startHour: '1pm', hours: 2 }));
    expect(w.state.jobOffers.find((o) => o.workerId === who(w, 'Ah Kow').id)?.startHour).toBe(13);
  });
  it('refusals: other owners, night hours, silly wages, far away, already yours', () => {
    const w = newWorld();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    put(w, 'Siti', 'kopitiam');
    put(w, 'Mdm Tan', 'kopitiam');
    refused(act(w, huat.id, { verb: 'offer_job', to: 'Mdm Tan', wage: 100, startHour: 8, hours: 4 }), /business to run/);
    refused(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 100, startHour: 20, hours: 6 }), /through the night/);
    refused(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 100, startHour: 8, hours: 12 }), /that long/);
    refused(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 0, startHour: 8, hours: 4 }), /wage/);
    refused(act(w, huat.id, { verb: 'offer_job', to: 'Raju', wage: 100, startHour: 8, hours: 4 }), /isn't nearby/);
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 100, startHour: 8, hours: 4 }));
    accepted(act(w, who(w, 'Siti').id, { verb: 'accept_job', from: 'Ah Huat' }));
    refused(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 100, startHour: 8, hours: 4 }), /already works for you/);
    refused(act(w, who(w, 'Raju').id, { verb: 'offer_job', to: 'Siti', wage: 100, startHour: 8, hours: 4 }), /shopkeepers/);
  });
});

function withWorker() {
  const w = newWorld(9);
  const huat = put(w, 'Ah Huat', 'kopitiam');
  const siti = put(w, 'Siti', 'kopitiam');
  accepted(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 200, startHour: 9, hours: 2 }));
  accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
  return { w, huat, siti };
}

describe('let_go', () => {
  it('ends the job, paying for time already worked', () => {
    const { w, huat, siti } = withWorker();
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    advanceTo(w, w.t + 60);
    accepted(act(w, huat.id, { verb: 'let_go', who: 'Siti' }));
    expect(w.jobOf(siti.id)).toBeNull();
    expect(siti.activity).toBeNull();
    expect(w.state.owed[0]?.cents).toBe(100);
    expect(w.takeEvents().some((e) => e.type === 'let_go')).toBe(true);
  });
  it("refuses someone who doesn't work for you, or who isn't here", () => {
    const { w, huat } = withWorker();
    refused(act(w, huat.id, { verb: 'let_go', who: 'Raju' }), /doesn't work for you/);
    put(w, 'Siti', 'jetty');
    refused(act(w, huat.id, { verb: 'let_go', who: 'Siti' }), /in person/);
  });
});

describe('pay_wages', () => {
  it('pays what is owed', () => {
    const { w, huat, siti } = withWorker();
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    advanceTo(w, sgt(11, 0));
    const [hm, sm] = [huat.money, siti.money];
    accepted(act(w, huat.id, { verb: 'pay_wages', to: 'Siti' }));
    expect(siti.money).toBe(sm + 200);
    expect(huat.money).toBe(hm - 200);
    expect(w.state.owed).toHaveLength(0);
  });
  it('an owner short of cash can pay part of what is owed', () => {
    const { w, huat, siti } = withWorker();
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    advanceTo(w, sgt(11, 0));
    const sm = siti.money;
    expect(accepted(act(w, huat.id, { verb: 'pay_wages', to: 'Siti', money: 80 })).reply).toMatch(/still owe \$1\.20/);
    expect(siti.money).toBe(sm + 80);
    expect(w.state.owed[0]?.cents).toBe(120);
    expect(siti.recent.at(-1)?.text).toMatch(/still owes you \$1\.20/);
    accepted(act(w, huat.id, { verb: 'pay_wages', to: 'Siti' }));
    expect(w.state.owed).toHaveLength(0);
  });
  it("refuses paying more than owed, or more than you have", () => {
    const { w, huat, siti } = withWorker();
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    advanceTo(w, sgt(11, 0));
    refused(act(w, huat.id, { verb: 'pay_wages', to: 'Siti', money: 500 }), /only owe Siti \$2\.00/);
    huat.money = 30;
    refused(act(w, huat.id, { verb: 'pay_wages', to: 'Siti', money: 100 }), /only have 30¢/);
  });
  it("refuses when nothing is owed or the money isn't there", () => {
    const { w, huat, siti } = withWorker();
    refused(act(w, huat.id, { verb: 'pay_wages', to: 'Siti' }), /don't owe Siti anything/);
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    advanceTo(w, sgt(11, 0));
    huat.money = 50;
    refused(act(w, huat.id, { verb: 'pay_wages', to: 'Siti' }), /don't have enough to pay Siti the \$2\.00/);
  });
});

describe('order_stock', () => {
  it('buys from the lorry: money leaves town, stock arrives at the shop', () => {
    const w = newWorld(6, 59);
    advanceTo(w, sgt(7, 5));
    const tan = put(w, 'Mdm Tan', 'lorry-stop');
    const m = tan.money;
    accepted(act(w, tan.id, { verb: 'order_stock', item: 'rice', qty: 10 }));
    expect(tan.money).toBe(m - 200);
    expect(w.shop('provision-shop')!.stock.rice).toBe(30);
    expect(w.takeLedger().at(-1)).toMatchObject({ from: tan.id, to: 'lorry', cents: 200 });
  });
  it('refusals: no lorry, wrong place, not carried, too dear', () => {
    const w = newWorld(9);
    const tan = put(w, 'Mdm Tan', 'lorry-stop');
    refused(act(w, tan.id, { verb: 'order_stock', item: 'rice', qty: 1 }), /lorry isn't here/);
    const m = newWorld(6, 59);
    advanceTo(m, sgt(7, 5));
    const t2 = put(m, 'Mdm Tan', 'lorry-stop');
    refused(act(m, t2.id, { verb: 'order_stock', item: 'durian', qty: 1 }), /doesn't bring that from town/);
    t2.money = 100;
    refused(act(m, t2.id, { verb: 'order_stock', item: 'rice', qty: 10 }), /is \$2\.00 and you have \$1\.00/);
    put(m, 'Mdm Tan', 'provision-shop');
    refused(act(m, t2.id, { verb: 'order_stock', item: 'rice', qty: 1 }), /meet the lorry/);
  });
});

describe('cook, as a kopitiam worker on shift', () => {
  it('a worker on shift can cook from the kitchen stock without leaving the shift', () => {
    const { w, siti } = withWorker();
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    const p = perceive(w, siti);
    expect(p.actions.map((a) => a.verb).sort()).toEqual(['cook', 'say', 'sweep']);
    expect(p.job?.stock).toContainEqual({ item: 'fish', qty: 2 });
    accepted(act(w, siti.id, { verb: 'cook', item: 'fish porridge' }));
    for (let i = 0; i < 10; i++) advance(w);
    expect(w.shop('kopitiam')!.stock['fish porridge']).toBe(6);
    expect(siti.activity?.kind).toBe('working');
    refused(act(w, siti.id, { verb: 'walk_to', where: 'home' }), /middle of your shift/);
  });
  it('only during the shift, and only in a kitchen', () => {
    const { w, siti } = withWorker();
    refused(act(w, siti.id, { verb: 'cook', item: 'kopi' }), /only use the kitchen during your shift/);
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    const raju = put(w, 'Raju', 'provision-shop');
    accepted(act(w, tan.id, { verb: 'offer_job', to: 'Raju', wage: 100, startHour: 9, hours: 2 }));
    accepted(act(w, raju.id, { verb: 'accept_job', from: 'Mdm Tan' }));
    accepted(act(w, raju.id, { verb: 'work_shift' }));
    refused(act(w, raju.id, { verb: 'cook', item: 'kopi' }), /stove is at home/);
  });
});

describe('cook', () => {
  it('turns kitchen stock into dishes (a novice cook)', () => {
    const w = newWorld();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    huat.skills = {};
    const stock = w.shop('kopitiam')!.stock;
    accepted(act(w, huat.id, { verb: 'cook', item: 'fish porridge', batches: 2 }));
    expect(stock.fish).toBeUndefined();
    expect(stock.rice).toBe(2);
    // Two batches take 20 minutes at the stove.
    for (let i = 0; i < 20; i++) advance(w);
    expect(stock['fish porridge']).toBe(8);
    accepted(act(w, huat.id, { verb: 'cook', item: 'kopi' }));
    for (let i = 0; i < 5; i++) advance(w);
    expect(stock.kopi).toBe(15);
  });
  it('refusals: no kitchen, away from it, unknown dish, short of ingredients', () => {
    const w = newWorld();
    const tan = put(w, 'Mdm Tan', 'kopitiam');
    refused(act(w, tan.id, { verb: 'cook', item: 'kopi' }), /stove is at home/);
    const huat = put(w, 'Ah Huat', 'well');
    refused(act(w, huat.id, { verb: 'cook', item: 'kopi' }), /in your kitchen/);
    put(w, 'Ah Huat', 'kopitiam');
    refused(act(w, huat.id, { verb: 'cook', item: 'bread' }), /don't know how to make "bread"/);
    refused(act(w, huat.id, { verb: 'cook', item: 'fish porridge', batches: 3 }), /short of fish/);
  });
});

describe('the action space', () => {
  it('is exactly the v1 list, each with accept and refusal tests above', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual([
      'accept_job', 'accept_trade', 'agree', 'ask_errand', 'ask_to_bring', 'borrow', 'buy', 'buy_place', 'cast_net', 'collect', 'cook',
      'decline_trade', 'eat', 'fetch_water', 'fish', 'gather_firewood', 'give', 'go_with', 'harvest', 'help', 'lend', 'let_go', 'let_off',
      'look_around', 'mend_nets', 'offer_job', 'offer_trade', 'order_stock', 'pay_lorry_man', 'pay_rent', 'pay_wages', 'pin_note', 'plant',
      'quit_job', 'read_notice_board', 'refuse', 'rent_house', 'rent_to_own', 'repay', 'say', 'sell', 'set_price', 'sleep', 'sweep', 'teach',
      'walk_to', 'water', 'work_shift', 'write_iou',
    ]);
  });
});
