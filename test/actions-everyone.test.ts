import { describe, expect, it } from 'vitest';
import { advanceTo } from '../src/sim/tick.ts';
import { act, accepted, newWorld, put, refused, who, sgt, expectInWorld } from './helpers.ts';
import type { World } from '../src/sim/state.ts';

function lorryMorning(): World {
  const w = newWorld(6, 59);
  advanceTo(w, sgt(7, 1));
  return w;
}

describe('walk_to', () => {
  it('sets off along a path to a place, a house or a person', () => {
    const w = newWorld();
    accepted(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'the jetty' }));
    expect(who(w, 'Siti').activity?.kind).toBe('walking');
    accepted(act(w, who(w, 'Muthu').id, { verb: 'walk_to', where: "Ah Huat's house" }));
    put(w, 'Raju', 'farm');
    accepted(act(w, who(w, 'Raju').id, { verb: 'walk_to', where: 'Mei Ling' }));
    advanceTo(w, w.t + 30);
    expect(w.isAt(who(w, 'Siti'), 'jetty')).toBe(true);
  });
  it('refuses unknown places and where you already are', () => {
    const w = newWorld();
    refused(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'Kuala Lumpur' }), /don't know of anywhere/);
    refused(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'attap house 1' }), /don't know of anywhere/);
    refused(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'home' }), /already home/);
    refused(act(w, who(w, 'Siti').id, { verb: 'walk_to' }));
    accepted(act(w, who(w, 'Siti').id, { verb: 'walk to', where: 'the well' }));
  });
});

describe('look_around', () => {
  it('describes the scene in words', () => {
    const w = newWorld();
    put(w, 'Siti', 'kopitiam');
    put(w, 'Ah Huat', 'kopitiam');
    const res = accepted(act(w, who(w, 'Siti').id, { verb: 'look_around' }));
    expect(res.reply).toMatch(/kopitiam/);
    expect(res.reply).toMatch(/Ah Huat/);
    // Short: the reply becomes a memory, and the full view (time, money, prices) is already in
    // front of them every time they think. Whole views were 56% of the live town's memory text.
    expect(res.reply).not.toMatch(/10¢|\$|feel|It's/);
    expect(res.reply!.length).toBeLessThan(160);
  });
  it('is refused while asleep', () => {
    const w = newWorld();
    who(w, 'Siti').activity = { kind: 'sleeping', reason: 'nap', until: null };
    refused(act(w, who(w, 'Siti').id, { verb: 'look_around' }), /asleep/);
  });
});

describe('say', () => {
  it('is heard by people nearby', () => {
    const w = newWorld();
    put(w, 'Siti', 'well');
    put(w, 'Raju', 'well');
    accepted(act(w, who(w, 'Siti').id, { verb: 'say', text: 'Hot today, lah.', to: 'Raju' }));
    expect(who(w, 'Raju').recent.at(-1)?.text).toBe('Siti says to you: "Hot today, lah."');
    expect(w.takeEvents().some((e) => e.type === 'said')).toBe(true);
  });
  it('needs words, and the listener close by', () => {
    const w = newWorld();
    refused(act(w, who(w, 'Siti').id, { verb: 'say', text: '   ' }), /nothing comes out/);
    refused(act(w, who(w, 'Siti').id, { verb: 'say', text: 'Oi!', to: 'Rahim' }), /isn't nearby/);
  });
});

describe('buy', () => {
  it('pays the owner and takes the goods', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'kopitiam');
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const [m, hm] = [siti.money, huat.money];
    accepted(act(w, siti.id, { verb: 'buy', item: 'kopi', qty: 2 }));
    expect(siti.items.kopi).toBe(2);
    expect(siti.money).toBe(m - 20);
    expect(huat.money).toBe(hm + 20);
    expect(w.state.shops.find((s) => s.id === 'kopitiam')!.stock.kopi).toBe(8);
    const types = w.takeEvents().map((e) => e.type);
    expect(types).toContain('bought');
    expect(types).toContain('first_sale');
  });
  it('an owner helps themselves from their own stock for free', () => {
    const w = newWorld();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const m = huat.money;
    accepted(act(w, huat.id, { verb: 'buy', item: 'fish porridge' }));
    expect(huat.items['fish porridge']).toBe(1);
    expect(huat.money).toBe(m);
  });
  it('refuses when nobody is serving, it is not sold, out of stock or too dear', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'kopitiam');
    refused(act(w, siti.id, { verb: 'buy', item: 'kopi' }), /Nobody's minding the kopitiam/);
    put(w, 'Ah Huat', 'kopitiam');
    refused(act(w, siti.id, { verb: 'buy', item: 'bread' }), /doesn't sell bread/);
    refused(act(w, siti.id, { verb: 'buy', item: 'durian' }), /doesn't sell "durian"/);
    refused(act(w, siti.id, { verb: 'buy', item: 'kopi', qty: 11 }), /only has 10 cups of kopi/);
    refused(act(w, siti.id, { verb: 'buy', item: 'kopi', qty: -1 }), /sensible amount/);
    siti.money = 5;
    refused(act(w, siti.id, { verb: 'buy', item: 'kopi' }), /can't afford/);
    put(w, 'Raju', 'well');
    refused(act(w, who(w, 'Raju').id, { verb: 'buy', item: 'kopi' }), /nothing for sale here/);
    put(w, 'Raju', 'lorry-stop');
    refused(act(w, who(w, 'Raju').id, { verb: 'buy', item: 'fish' }), /lorry isn't here/);
    const w2 = lorryMorning();
    put(w2, 'Raju', 'lorry-stop');
    refused(act(w2, who(w2, 'Raju').id, { verb: 'buy', item: 'fish' }), /doesn't bring fish from town/);
  });
});

describe('sell', () => {
  it('sells to a shop at its buying price', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'market-stall');
    const rahim = put(w, 'Rahim', 'market-stall');
    siti.items.fish = 3;
    const [m, rm] = [siti.money, rahim.money];
    accepted(act(w, siti.id, { verb: 'sell', item: 'fish', qty: 2 }));
    expect(siti.items.fish).toBe(1);
    expect(siti.money).toBe(m + 40);
    expect(rahim.money).toBe(rm - 40);
  });
  it('sells fish or vegetables to the lorry while it is here, bringing money into town', () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.items.vegetables = 4;
    const m = siti.money;
    accepted(act(w, siti.id, { verb: 'sell', item: 'vegetables', qty: 4 }));
    expect(siti.money).toBe(m + 40);
    expect(w.takeLedger().at(-1)).toMatchObject({ from: 'lorry', to: siti.id, cents: 40 });
  });
  it('an owner puts goods into their own stock for free', () => {
    const w = newWorld();
    const rahim = put(w, 'Rahim', 'market-stall');
    rahim.items.fish = 2;
    const m = rahim.money;
    expect(accepted(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: 2 })).reply).toMatch(/into your stock/);
    expect(w.shop('market-stall')!.stock.fish).toBe(8);
    expect(rahim.money).toBe(m);
  });
  it('refuses when there is no buyer, no lorry, or nothing to sell', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.items.fish = 1;
    refused(act(w, siti.id, { verb: 'sell', item: 'fish' }), /lorry isn't here/);
    put(w, 'Siti', 'well');
    refused(act(w, siti.id, { verb: 'sell', item: 'fish' }), /nobody here to sell to/);
    put(w, 'Siti', 'market-stall');
    put(w, 'Rahim', 'market-stall');
    refused(act(w, siti.id, { verb: 'sell', item: 'fish', qty: 5 }), /don't have 5 fish/);
    siti.items.bread = 1;
    refused(act(w, siti.id, { verb: 'sell', item: 'bread' }), /isn't buying bread/);
    who(w, 'Rahim').money = 0;
    refused(act(w, siti.id, { verb: 'sell', item: 'fish' }), /can't afford/);
    const w2 = lorryMorning();
    const s2 = put(w2, 'Siti', 'lorry-stop');
    s2.items.bread = 1;
    refused(act(w2, s2.id, { verb: 'sell', item: 'bread' }), /only buys fish and vegetables/);
  });
});

describe('offer_trade / accept_trade / decline_trade', () => {
  function pair() {
    const w = newWorld();
    const siti = put(w, 'Siti', 'well');
    const raju = put(w, 'Raju', 'well');
    siti.items.fish = 2;
    return { w, siti, raju };
  }
  it('offer then accept swaps goods for money', () => {
    const { w, siti, raju } = pair();
    const [sm, rm] = [siti.money, raju.money];
    accepted(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: { items: { fish: 2 } }, want: { money: '30¢' } }));
    expect(raju.recent.at(-1)?.text).toMatch(/offers you 2 fish for 30¢/);
    accepted(act(w, raju.id, { verb: 'accept_trade', from: 'Siti' }));
    expect(raju.items.fish).toBe(2);
    expect(siti.items.fish).toBeUndefined();
    expect(siti.money).toBe(sm + 30);
    expect(raju.money).toBe(rm - 30);
    expect(w.state.trades).toHaveLength(0);
  });
  it('decline removes the offer', () => {
    const { w, siti, raju } = pair();
    accepted(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: { items: { fish: 1 } }, want: { money: 15 } }));
    accepted(act(w, raju.id, { verb: 'decline_trade', from: 'Siti' }));
    expect(w.state.trades).toHaveLength(0);
    expect(siti.recent.at(-1)?.text).toMatch(/turned down/);
  });
  it('refuses empty, unaffordable, unknown or missing offers', () => {
    const { w, siti, raju } = pair();
    refused(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: {}, want: { money: 10 } }), /offer something/);
    refused(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: { items: { fish: 9 } }, want: { money: 10 } }), /don't have 9 fish/);
    refused(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: { items: { pearls: 1 } }, want: { money: 10 } }), /don't know what "pearls" is/);
    refused(act(w, siti.id, { verb: 'offer_trade', to: 'Rahim', give: { items: { fish: 1 } }, want: { money: 10 } }), /isn't nearby/);
    refused(act(w, raju.id, { verb: 'accept_trade', from: 'Siti' }), /hasn't offered you a trade/);
    refused(act(w, raju.id, { verb: 'decline_trade', from: 'Siti' }), /hasn't offered you a trade/);
    accepted(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: { items: { fish: 1 } }, want: { money: 5000 } }));
    refused(act(w, raju.id, { verb: 'accept_trade', from: 'Siti' }), /You don't have \$50\.00/);
  });
  it('refuses money nobody could have', () => {
    const { w, siti } = pair();
    for (const money of ['9'.repeat(400), '9'.repeat(30), '$99999999', 1e12, 1.5]) {
      refused(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: { items: { fish: 1 } }, want: { money } }), /doesn't sound like money/);
    }
    expect(w.state.trades).toHaveLength(0);
  });
  it('offers lapse after a while', () => {
    const { w, siti, raju } = pair();
    accepted(act(w, siti.id, { verb: 'offer_trade', to: 'Raju', give: { items: { fish: 1 } }, want: { money: 15 } }));
    advanceTo(w, w.t + 31);
    refused(act(w, raju.id, { verb: 'accept_trade', from: 'Siti' }), /hasn't offered/);
  });
});

describe('fish', () => {
  it('casts a line at the jetty and lands a catch later', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'jetty');
    accepted(act(w, siti.id, { verb: 'fish' }));
    expect(siti.activity?.kind).toBe('fishing');
    advanceTo(w, w.t + 30);
    expect(siti.activity).toBeNull();
  });
  it('only at the jetty', () => {
    const w = newWorld();
    refused(act(w, who(w, 'Siti').id, { verb: 'fish' }), /out on the jetty/);
  });
});

describe('plant / water / harvest', () => {
  it('kangkong takes two watered days, then gives a harvest', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'plant' }));
    accepted(act(w, siti.id, { verb: 'water' }));
    refused(act(w, siti.id, { verb: 'harvest' }), /isn't ready yet/);
    w.state.t = sgt(9, 0, 1);
    put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'water' }));
    refused(act(w, siti.id, { verb: 'harvest' }), /isn't ready yet/);
    // A day late: the plain harvest (on the day it was ready, two more).
    w.state.t = sgt(9, 0, 3);
    accepted(act(w, siti.id, { verb: 'harvest' }));
    expect(siti.items.vegetables).toBe(5);
    expect(w.state.beds.every((b) => b.planterId === null)).toBe(true);
  });
  it('refusals: away from the plot, nothing planted, watered twice, too many beds, plot full', () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    refused(act(w, siti.id, { verb: 'plant' }), /farm plot/);
    refused(act(w, siti.id, { verb: 'water' }), /farm plot/);
    refused(act(w, siti.id, { verb: 'harvest' }), /farm plot/);
    put(w, 'Siti', 'farm');
    refused(act(w, siti.id, { verb: 'water' }), /Nothing of yours is planted/);
    refused(act(w, siti.id, { verb: 'harvest' }), /Nothing of yours is planted/);
    accepted(act(w, siti.id, { verb: 'plant' }));
    accepted(act(w, siti.id, { verb: 'water' }));
    refused(act(w, siti.id, { verb: 'water' }), /already watered/);
    accepted(act(w, siti.id, { verb: 'plant' }));
    refused(act(w, siti.id, { verb: 'plant' }), /two beds/);
    for (const b of w.state.beds) b.planterId ??= 'raju';
    const muthu = put(w, 'Muthu', 'farm');
    refused(act(w, muthu.id, { verb: 'plant' }), /Every bed/);
  });
});

describe('eat', () => {
  it('a shopkeeper can eat straight from their own stock (live: owners starved at their own counters)', () => {
    const w = newWorld();
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    tan.hunger = 1000;
    const shop = w.shop('provision-shop')!;
    const loaves = shop.stock.bread ?? 0;
    accepted(act(w, tan.id, { verb: 'eat', item: 'bread' }));
    expect(tan.hunger).toBeLessThan(1000);
    expect(shop.stock.bread ?? 0).toBe(loaves - 1);
    // Not someone else's shop, and not raw goods.
    const siti = put(w, 'Siti', 'provision-shop');
    refused(act(w, siti.id, { verb: 'eat', item: 'bread' }), /don't have any/);
    refused(act(w, tan.id, { verb: 'eat', item: 'rice' }), /cook|eat/i);
  });
  it('eating takes the edge off hunger', () => {
    const w = newWorld();
    const siti = who(w, 'Siti');
    siti.items.bread = 1;
    siti.hunger = 600;
    accepted(act(w, siti.id, { verb: 'eat', item: 'bread' }));
    expect(siti.hunger).toBe(400);
    expect(siti.items.bread).toBeUndefined();
  });
  it("refuses what you don't have, can't eat, or when full", () => {
    const w = newWorld();
    const siti = who(w, 'Siti');
    refused(act(w, siti.id, { verb: 'eat', item: 'fish' }), /don't have any fish/);
    siti.items.rice = 1;
    refused(act(w, siti.id, { verb: 'eat', item: 'rice' }), /raw rice/);
    siti.items.bread = 1;
    siti.hunger = 10;
    refused(act(w, siti.id, { verb: 'eat', item: 'bread' }), /too full/);
    refused(act(w, siti.id, { verb: 'eat', item: 'rendang' }), /anything called "rendang"/);
  });
});

describe('sleep', () => {
  it('naps at home when tired', () => {
    const w = newWorld(14);
    const siti = who(w, 'Siti');
    siti.energy = 300;
    accepted(act(w, siti.id, { verb: 'sleep' }));
    expect(siti.activity?.kind).toBe('sleeping');
  });
  it("refuses away from home or when you aren't tired", () => {
    const w = newWorld(14);
    const siti = who(w, 'Siti');
    refused(act(w, siti.id, { verb: 'sleep' }), /not tired enough/);
    put(w, 'Siti', 'jetty');
    siti.energy = 300;
    refused(act(w, siti.id, { verb: 'sleep' }), /own bed at home/);
  });
});

describe('accept_job / quit_job / work_shift', () => {
  function hired() {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const siti = put(w, 'Siti', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 200, startHour: 10, hours: 4 }));
    return { w, huat, siti };
  }
  it('accepting an offer makes a job; working a shift earns the wage', () => {
    const { w, huat, siti } = hired();
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    expect(w.jobOf(siti.id)?.employerId).toBe(huat.id);
    refused(act(w, siti.id, { verb: 'work_shift' }), /from 10 in the morning to 2 in the afternoon/);
    advanceTo(w, sgt(10, 0));
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    expect(siti.activity?.kind).toBe('working');
    advanceTo(w, sgt(14, 0));
    expect(siti.activity).toBeNull();
    expect(w.state.owed).toEqual([{ employerId: huat.id, workerId: siti.id, cents: 200, since: expect.any(Number) }]);
    refused(act(w, siti.id, { verb: 'work_shift' }), /shift is from|already done/);
    advanceTo(w, sgt(10, 0, 1));
    put(w, 'Siti', 'kopitiam');
    siti.hunger = 100;
    accepted(act(w, siti.id, { verb: 'work_shift' }));
  });
  it('a worker on shift minds the shop for the owner', () => {
    const { w, siti } = hired();
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    advanceTo(w, sgt(10, 0));
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    put(w, 'Ah Huat', 'jetty');
    const raju = put(w, 'Raju', 'kopitiam');
    accepted(act(w, raju.id, { verb: 'buy', item: 'kopi' }));
  });
  it('starving partway through a shift ends it, paid for the time worked', () => {
    const { w, huat, siti } = hired();
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    advanceTo(w, sgt(10, 0));
    siti.hunger = 940;
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    advanceTo(w, sgt(11, 0));
    expect(siti.activity).toBeNull();
    expect(w.state.owed).toEqual([{ employerId: huat.id, workerId: siti.id, cents: 50, since: expect.any(Number) }]);
  });
  it('quitting ends the job', () => {
    const { w, huat, siti } = hired();
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    accepted(act(w, siti.id, { verb: 'quit_job' }));
    expect(w.jobOf(siti.id)).toBeNull();
    expect(huat.recent.at(-1)?.text).toMatch(/quit/);
  });
  it('refusals: no offer, already employed, boss not here, no job, wrong place, starving', () => {
    const { w, siti } = hired();
    refused(act(w, siti.id, { verb: 'accept_job', from: 'Mdm Tan' }), /hasn't offered you a job/);
    refused(act(w, siti.id, { verb: 'quit_job' }), /don't have a job/);
    refused(act(w, siti.id, { verb: 'work_shift' }), /don't have a job/);
    put(w, 'Ah Huat', 'jetty');
    refused(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }), /in person/);
    put(w, 'Ah Huat', 'kopitiam');
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    const tan = put(w, 'Mdm Tan', 'kopitiam');
    accepted(act(w, tan.id, { verb: 'offer_job', to: 'Siti', wage: 300, startHour: 8, hours: 4 }));
    refused(act(w, siti.id, { verb: 'accept_job', from: 'Mdm Tan' }), /quit your job at the kopitiam first/);
    advanceTo(w, sgt(10, 0));
    put(w, 'Siti', 'well');
    refused(act(w, siti.id, { verb: 'work_shift' }), /Your work is at the kopitiam/);
    put(w, 'Siti', 'kopitiam');
    siti.hunger = 1000;
    refused(act(w, siti.id, { verb: 'work_shift' }), /too weak/);
  });
});

describe('give', () => {
  it('hands over money or goods', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'well');
    const raju = put(w, 'Raju', 'well');
    siti.items.fish = 2;
    const [sm, rm] = [siti.money, raju.money];
    accepted(act(w, siti.id, { verb: 'give', to: 'Raju', money: 50 }));
    accepted(act(w, siti.id, { verb: 'give', to: 'Raju', item: 'fish', qty: 2 }));
    expect(raju.money).toBe(rm + 50);
    expect(siti.money).toBe(sm - 50);
    expect(raju.items.fish).toBe(2);
  });
  it("refuses what you don't have or someone who isn't here", () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'well');
    put(w, 'Raju', 'well');
    refused(act(w, siti.id, { verb: 'give', to: 'Raju', money: 999999 }), /only have/);
    refused(act(w, siti.id, { verb: 'give', to: 'Raju', item: 'fish' }), /don't have a fish/);
    refused(act(w, siti.id, { verb: 'give', to: 'Raju' }), /You'd be giving nothing/);
    refused(act(w, siti.id, { verb: 'give', to: 'Siti', money: 1 }), /That's you/);
    refused(act(w, siti.id, { verb: 'give', to: 'Rahim', money: 1 }), /isn't nearby/);
  });
});

describe('read_notice_board / pin_note', () => {
  it('pins a note others can read', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'notice-board');
    expect(accepted(act(w, siti.id, { verb: 'read_notice_board' })).reply).toMatch(/empty/);
    const pinned = accepted(act(w, siti.id, { verb: 'pin_note', text: 'Fresh fish, cheap. Ask Siti.' }));
    // She remembers what she wrote, not just that she wrote something (Mei Ling forgot her own WANTED note).
    expect(pinned.reply).toContain('Fresh fish, cheap. Ask Siti.');
    const raju = put(w, 'Raju', 'notice-board');
    expect(accepted(act(w, raju.id, { verb: 'read_notice_board' })).reply).toMatch(/Fresh fish, cheap\. Ask Siti\.".*Siti/);
  });
  it('only at the board, and the note needs words that fit', () => {
    const w = newWorld();
    const siti = who(w, 'Siti');
    refused(act(w, siti.id, { verb: 'read_notice_board' }), /from here/);
    refused(act(w, siti.id, { verb: 'pin_note', text: 'hi' }), /at the notice board/);
    put(w, 'Siti', 'notice-board');
    refused(act(w, siti.id, { verb: 'pin_note', text: '' }), /write something/);
    refused(act(w, siti.id, { verb: 'pin_note', text: 'x'.repeat(201) }), /won't fit/);
  });
});

describe('anything else', () => {
  it('unknown or malformed requests get an in-world shrug', () => {
    const w = newWorld();
    const id = who(w, 'Siti').id;
    for (const bad of [null, 42, 'fly', {}, { verb: 'fly' }, { verb: 'start_business' }, { verb: 'buy', item: { x: 1 } },
      { verb: 'constructor' }, { verb: '__proto__' }, { verb: 'toString' }, { verb: 'hasOwnProperty' }]) {
      const res = act(w, id, bad);
      expect(res.ok).toBe(false);
      expectInWorld(res.reply!);
    }
  });
  it('at night everyone should be asleep', () => {
    const w = newWorld(23, 30);
    refused(act(w, who(w, 'Siti').id, { verb: 'look_around' }), /middle of the night/);
  });
  it('busy residents finish what they are doing first', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'jetty');
    accepted(act(w, siti.id, { verb: 'fish' }));
    refused(act(w, siti.id, { verb: 'walk_to', where: 'home' }), /busy fishing/);
  });
});
