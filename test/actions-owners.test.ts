import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../src/sim/actions/index.ts';
import { advanceTo } from '../src/sim/tick.ts';
import { act, accepted, newWorld, put, refused, who, sgt } from './helpers.ts';

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
    w.state.t = sgt(7, 10);
    w.state.lorryHere = true;
    refused(act(w, tan.id, { verb: 'order_stock', item: 'durian', qty: 1 }), /doesn't carry "durian"/);
    tan.money = 100;
    refused(act(w, tan.id, { verb: 'order_stock', item: 'rice', qty: 10 }), /would cost \$2\.00/);
    put(w, 'Mdm Tan', 'provision-shop');
    refused(act(w, tan.id, { verb: 'order_stock', item: 'rice', qty: 1 }), /meet the lorry/);
  });
});

describe('cook', () => {
  it('turns kitchen stock into dishes', () => {
    const w = newWorld();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const stock = w.shop('kopitiam')!.stock;
    accepted(act(w, huat.id, { verb: 'cook', item: 'fish porridge', batches: 2 }));
    expect(stock.fish).toBeUndefined();
    expect(stock.rice).toBe(2);
    expect(stock['fish porridge']).toBe(8);
    accepted(act(w, huat.id, { verb: 'cook', item: 'kopi' }));
    expect(stock.kopi).toBe(15);
  });
  it('refusals: no kitchen, away from it, unknown dish, short of ingredients', () => {
    const w = newWorld();
    const tan = put(w, 'Mdm Tan', 'kopitiam');
    refused(act(w, tan.id, { verb: 'cook', item: 'kopi' }), /don't have a kitchen/);
    const huat = who(w, 'Ah Huat');
    refused(act(w, huat.id, { verb: 'cook', item: 'kopi' }), /in your kitchen/);
    put(w, 'Ah Huat', 'kopitiam');
    refused(act(w, huat.id, { verb: 'cook', item: 'bread' }), /don't know how to make "bread"/);
    refused(act(w, huat.id, { verb: 'cook', item: 'fish porridge', batches: 3 }), /short of fish/);
  });
});

describe('the action space', () => {
  it('is exactly the v1 list, each with accept and refusal tests above', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual([
      'accept_job', 'accept_trade', 'buy', 'cook', 'decline_trade', 'eat', 'fish', 'give', 'harvest',
      'let_go', 'look_around', 'offer_job', 'offer_trade', 'order_stock', 'pay_wages', 'pin_note', 'plant',
      'quit_job', 'read_notice_board', 'say', 'sell', 'set_price', 'sleep', 'walk_to', 'water', 'work_shift',
    ]);
  });
});
