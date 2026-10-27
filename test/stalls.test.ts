import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { householdsMinute, STALL_RENT } from '../src/sim/households.ts';
import { mrLimDecides, mrLimReviews, type MrLimHead, type ReviewBrief } from '../src/sim/mr-lim.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { MR_LIM_ID, countGoods, type World } from '../src/sim/state.ts';
import { servers } from '../src/sim/travellers.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** A Tuesday morning, rent started. */
function town(): World {
  const w = newWorld(9, 0);
  w.state.rentFrom = dayIndex(w.t);
  w.state.lastRoundDay = dayIndex(w.t);
  w.state.t = sgt(10, 0, 1);
  return w;
}
const round = (w: World, week: number) => { w.state.t = sgt(9, 0, week * 7); householdsMinute(w); };
const stall = (w: World) => w.shop('market-stall')!;
/** Rahim, the market stall's keeper, can't pay for two Mondays: Mr Lim lets the stall go. */
function letGo(w: World) {
  const rahim = who(w, 'Rahim');
  const kow = who(w, 'Ah Kow');
  stall(w).stock = { fish: 3 };
  w.state.jobs.push({ id: w.nextId(), employerId: rahim.id, workerId: kow.id, placeId: 'market-stall', wage: 30, startHour: 8, hours: 4, lastWorkedDay: null });
  // His house is his own, so only the stall's rent is owed.
  w.state.property[rahim.homeId]!.owned = true;
  rahim.money = 0;
  round(w, 1);
  round(w, 2);
  return { rahim, kow };
}

describe("letting a stall go for rent owing (households-build.md \"Housing market\", part d)", () => {
  it('owing over a week: the keeper loses the stall, takes its stock home, and still owes the rent; jobs there end', () => {
    const w = town();
    const { rahim, kow } = letGo(w);
    const place = w.state.property['market-stall']!;
    expect(place).toMatchObject({ holder: null, freeSince: dayIndex(w.t), owing: 0 });
    expect(stall(w).ownerId).toBe(null);
    expect(countGoods(rahim.items, 'fish')).toBeGreaterThanOrEqual(3);
    expect(countGoods(stall(w).stock, 'fish')).toBe(0);
    expect(stall(w).sellPrices).toEqual({});
    expect(w.state.arrears[rahim.id]).toBe(STALL_RENT);
    expect(w.state.jobs.filter((j) => j.placeId === 'market-stall')).toEqual([]);
    for (const r of [rahim, kow]) expectInWorld(r.recent.at(-1)!.text);
    expect(rahim.recent.some((m) => /stall/.test(m.text) && /no longer yours/.test(m.text))).toBe(true);
  });

  it('a stall standing free is shut: nobody serves, nothing is bought there', () => {
    const w = town();
    letGo(w);
    w.state.t = sgt(10, 0, 15);
    const fat = put(w, 'Fatimah', 'market-stall');
    fat.money = 1000;
    expect(servers(w, stall(w))).toEqual([]);
    refused(act(w, fat.id, { verb: 'buy', item: 'fish' }));
    expectInWorld(seen(w, 'Fatimah'));
    expect(seen(w, 'Fatimah')).toMatch(/empty|free/);
    // The town runs on with it shut.
    for (let k = 0; k < 120; k++) advance(w);
  });

  it("goes on Mr Lim's note; offers at his door; whoever takes it keeps it, empty and with no prices yet", async () => {
    const w = town();
    letGo(w);
    // The next morning's note names the stall.
    w.state.t = sgt(6, 0, 15);
    while (w.t < sgt(9, 0, 15)) advance(w);
    const note = w.state.notes.find((n) => n.authorId === MR_LIM_ID && /^To let/.test(n.text))!;
    expect(note.text).toMatch(/stall/);
    w.state.t = sgt(10, 0, 15);
    const kow = put(w, 'Ah Kow', 'village-head');
    kow.money = 1000;
    expectInWorld(accepted(act(w, kow.id, { verb: 'offer_for_place', item: 'the market stall', money: 80 })).reply!);
    w.state.t = sgt(17, 0, 15);
    await mrLimDecides(w, null, 0);
    expect(w.state.property['market-stall']).toMatchObject({ holder: kow.id, rent: 80 });
    expect(stall(w).ownerId).toBe(kow.id);
    expect(stall(w).sellPrices).toEqual({});
    expect(kow.money).toBe(1000 - 80);
    expect(w.shopOf(kow.id)?.id).toBe('market-stall');
  });

  it('one stall a keeper: someone who keeps one can\'t take another', () => {
    const w = town();
    letGo(w);
    w.state.t = sgt(10, 0, 15);
    const huat = put(w, 'Ah Huat', 'village-head');
    huat.money = 1000;
    refused(act(w, huat.id, { verb: 'offer_for_place', item: 'the market stall', money: 80 }), /stall/);
  });

  it("his head looks over stall rents too; a keeper who won't agree a rise loses the stall when it starts", async () => {
    const w = town();
    w.state.t = sgt(17, 0, 7);
    const briefs: ReviewBrief[] = [];
    const head: MrLimHead = { plan: async () => null, review: async (b) => { briefs.push(b); return { changes: [{ house: b.lets.find((l) => l.name === 'Rahim' && /stall/.test(l.place))!.n, rent: 150 }] }; } };
    await mrLimReviews(w, head, 0);
    expect(briefs[0]!.lets.some((l) => l.name === 'Rahim' && /stall/.test(l.place))).toBe(true);
    expect(w.state.property['market-stall']!.notice).toMatchObject({ rent: 150, agreed: false });
    round(w, 2);
    expect(stall(w).ownerId).toBe(null);
    expect(w.state.property['market-stall']!.holder).toBe(null);
  });
});

describe('stalls between residents', () => {
  it('a stall someone owns can be sold: the keeper changes, the stock goes home with the seller, nobody moves house', () => {
    const w = town();
    const tan = put(w, 'Mdm Tan', 'well');
    const raju = put(w, 'Raju', 'well');
    const tanHome = tan.homeId;
    w.state.property['provision-shop']!.owned = true;
    w.shop('provision-shop')!.stock = { rice: 5 };
    raju.money = 10_000;
    accepted(act(w, tan.id, { verb: 'offer_place', to: 'Raju', item: 'my shop', money: 5000 }));
    accepted(act(w, raju.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(w.state.property['provision-shop']).toMatchObject({ holder: raju.id, owned: true });
    expect(w.shop('provision-shop')!.ownerId).toBe(raju.id);
    expect(countGoods(tan.items, 'rice')).toBeGreaterThanOrEqual(5);
    expect(w.shop('provision-shop')!.sellPrices).toEqual({});
    expect(tan.homeId).toBe(tanHome);
  });

  it('a stall let: the tenant keeps it and pays the owner; owing over a week, it goes back and the owner keeps it again', () => {
    const w = town();
    const tan = put(w, 'Mdm Tan', 'well');
    const kow = put(w, 'Ah Kow', 'well');
    w.state.property['provision-shop']!.owned = true;
    kow.money = 1000;
    accepted(act(w, tan.id, { verb: 'offer_place', to: 'Ah Kow', item: 'my stall', money: 120, renting: true }));
    accepted(act(w, kow.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(w.state.property['provision-shop']).toMatchObject({ holder: kow.id, landlord: tan.id, rent: 120 });
    expect(w.shop('provision-shop')!.ownerId).toBe(kow.id);
    kow.money = 0;
    round(w, 1);
    round(w, 2);
    expect(w.state.property['provision-shop']).toMatchObject({ holder: tan.id, owned: true, landlord: null });
    expect(w.shop('provision-shop')!.ownerId).toBe(tan.id);
  });

  it('someone who keeps a stall can\'t take a second', () => {
    const w = town();
    const tan = put(w, 'Mdm Tan', 'well');
    const huat = put(w, 'Ah Huat', 'well');
    w.state.property['provision-shop']!.owned = true;
    huat.money = 100_000;
    refused(act(w, tan.id, { verb: 'offer_place', to: 'Ah Huat', item: 'my shop', money: 5000 }), /stall|shop|kopitiam/);
    void availableActions;
  });
});

describe('review fixes (stalls)', () => {
  it('the new keeper runs the stall (prices, hiring); the old one is free to be hired', async () => {
    const w = town();
    const { rahim } = letGo(w);
    w.state.t = sgt(10, 0, 15);
    const kow = put(w, 'Ah Kow', 'village-head');
    kow.money = 1000;
    accepted(act(w, kow.id, { verb: 'offer_for_place', item: 'the market stall', money: 80 }));
    w.state.t = sgt(17, 0, 15);
    await mrLimDecides(w, null, 0);
    w.state.t = sgt(10, 0, 16);
    put(w, 'Ah Kow', 'market-stall');
    accepted(act(w, kow.id, { verb: 'set_price', item: 'fish', price: 30 }));
    expect(availableActions(w, rahim).map((a) => a.verb)).not.toContain('set price');
    // What each keeps, as their own mind is told it, follows the change.
    expect(perceive(w, kow).keeps).toMatch(/stall/);
    expect(perceive(w, rahim).keeps).toBe(null);
    const { systemPrompt } = await import('../src/mind/prompt.ts');
    const card = { name: 'Ah Kow', age: 30, personality: 'p', want: 'w', worry: 'w', knows: '', languages: '' };
    expect(systemPrompt(card, 'owner', perceive(w, kow).keeps)).toMatch(/You own .*stall/);
  });

  it('a landlord of a stall counts as keeping one: no second stall from Mr Lim', () => {
    const w = town();
    letGo(w);
    // Mdm Tan owns her shop and lets it to Raju.
    Object.assign(w.state.property['provision-shop']!, { holder: who(w, 'Raju').id, owned: false, landlord: who(w, 'Mdm Tan').id });
    w.shop('provision-shop')!.ownerId = who(w, 'Raju').id;
    w.state.t = sgt(10, 0, 15);
    const tan = put(w, 'Mdm Tan', 'village-head');
    tan.money = 1000;
    refused(act(w, tan.id, { verb: 'offer_for_place', item: 'the market stall', money: 80 }), /stall/);
  });

  it('goods ordered from the lorry for a stall that is let go come to the keeper\'s hands instead', () => {
    const w = town();
    const rahim = who(w, 'Rahim');
    w.state.osman.orders.push({ id: w.nextId(), who: rahim.id, item: 'fish', qty: 2, each: 20, deposit: 0, forShop: 'market-stall', brought: null } as never);
    letGo(w);
    expect(w.state.osman.orders.find((o) => o.who === rahim.id)!.forShop).toBe(null);
  });

  it('naming another stall is never an offer for your own', () => {
    const w = town();
    // The kopitiam stands free; Rahim keeps the market stall and rents his house.
    Object.assign(w.state.property['kopitiam']!, { holder: null, freeSince: dayIndex(w.t) });
    w.shop('kopitiam')!.ownerId = null;
    const rahim = put(w, 'Rahim', 'village-head');
    rahim.money = 100_000;
    refused(act(w, rahim.id, { verb: 'offer_for_place', item: 'the kopitiam', money: 5000, side: 'buy' }), /keep a stall/);
    expect(w.state.placeOffers).toEqual([]);
  });
});

describe('second review fixes (stalls)', () => {
  it('wages owed for a shift cut short can still be paid by the old keeper', () => {
    const w = town();
    const rahim = who(w, 'Rahim');
    const kow = who(w, 'Ah Kow');
    w.state.property[rahim.homeId]!.owned = true;
    const job = { id: w.nextId(), employerId: rahim.id, workerId: kow.id, placeId: 'market-stall', wage: 40, startHour: 8, hours: 4, lastWorkedDay: null };
    w.state.jobs.push(job);
    rahim.money = 0;
    round(w, 1);
    w.state.t = sgt(9, 0, 14) - 30;
    put(w, 'Ah Kow', 'market-stall');
    kow.activity = { kind: 'working', jobId: job.id, until: w.t + 120, worked: 60 };
    round(w, 2);
    expect(w.state.owed.some((o) => o.employerId === rahim.id && o.workerId === kow.id && o.cents > 0)).toBe(true);
    w.state.t = sgt(10, 0, 14);
    put(w, 'Rahim', 'well');
    put(w, 'Ah Kow', 'well');
    rahim.money = 1000;
    expect(availableActions(w, rahim).map((a) => a.verb)).toContain('pay wages');
    accepted(act(w, rahim.id, { verb: 'pay_wages', to: 'Ah Kow' }));
  });

  it('whoever takes a stall gives up work they had elsewhere', async () => {
    const w = town();
    letGo(w);
    const kow = who(w, 'Ah Kow');
    const huat = who(w, 'Ah Huat');
    w.state.jobs = w.state.jobs.filter((j) => j.workerId !== kow.id);
    w.state.jobs.push({ id: w.nextId(), employerId: huat.id, workerId: kow.id, placeId: 'kopitiam', wage: 40, startHour: 8, hours: 4, lastWorkedDay: null });
    w.state.t = sgt(10, 0, 15);
    put(w, 'Ah Kow', 'village-head');
    kow.money = 1000;
    accepted(act(w, kow.id, { verb: 'offer_for_place', item: 'the market stall', money: 80 }));
    w.state.t = sgt(17, 0, 15);
    await mrLimDecides(w, null, 0);
    expect(w.state.jobs.filter((j) => j.workerId === kow.id)).toEqual([]);
    expect(huat.recent.at(-1)!.text).toMatch(/Ah Kow/);
  });
});
