import { describe, expect, it } from 'vitest';
import { TRADE_OFFER_MINUTES } from '../src/sim/actions/everyone.ts';
import { HOUSE_RENT, householdsMinute, ROUGH } from '../src/sim/households.ts';
import { mrLimReviews, type MrLimHead, type ReviewBrief } from '../src/sim/mr-lim.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { FUND_ID, type Resident, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const living = (w: World, placeId: string) => w.state.residents.filter((r) => r.homeId === placeId);
/** A Tuesday morning; Mdm Tan owns her house; rent started; everyone at the well. */
function town(): { w: World; tan: Resident; tanHome: string } {
  const w = newWorld(9, 0);
  w.state.rentFrom = dayIndex(w.t);
  w.state.lastRoundDay = dayIndex(w.t);
  w.state.t = sgt(10, 0, 1);
  const tan = who(w, 'Mdm Tan');
  w.state.property[tan.homeId]!.owned = true;
  // Her stall too, so only the house's rent moves her money.
  for (const p of Object.values(w.state.property)) if (p.holder === tan.id) p.owned = true;
  return { w, tan, tanHome: tan.homeId };
}
const at = (w: World, ...names: string[]) => names.map((n) => put(w, n, 'well'));
/** Monday's round, `week` weeks on from the test world's first Monday. */
const round = (w: World, week: number) => { w.state.t = sgt(9, 0, week * 7); householdsMinute(w); };
/** Ah Kow rents Mdm Tan's house from her at `cents` a week. */
function letToKow(w: World, cents = 40) {
  const [tan, kow] = at(w, 'Mdm Tan', 'Ah Kow');
  kow!.money = 1000;
  accepted(act(w, tan!.id, { verb: 'offer_place', to: 'Ah Kow', item: 'my house', money: cents, renting: true }));
  accepted(act(w, kow!.id, { verb: 'agree', from: 'Mdm Tan' }));
  return kow!;
}

describe('selling and letting houses between residents (households-build.md "Housing market" item 4)', () => {
  it('a sale: offered and agreed in person; the money changes hands, the buyer moves in, the seller\'s household out', () => {
    const { w, tan, tanHome } = town();
    const tanFamily = living(w, tanHome);
    const [, raju] = at(w, 'Mdm Tan', 'Raju');
    const rajuOld = raju!.homeId;
    const rajuFamily = living(w, rajuOld);
    raju!.money = 5000;
    tan.money = 0;
    const offered = accepted(act(w, raju!.id, { verb: 'offer_place', to: 'Mdm Tan', item: 'your house', money: 3000 }));
    expectInWorld(offered.reply!);
    expectInWorld(tan.recent.at(-1)!.text);
    expect(seen(w, 'Mdm Tan')).toMatch(/Raju/);
    expectInWorld(accepted(act(w, tan.id, { verb: 'agree', from: 'Raju' })).reply!);
    expect(raju!.money).toBe(2000);
    expect(tan.money).toBe(3000);
    expect(w.state.property[tanHome]).toMatchObject({ holder: raju!.id, owned: true, landlord: null });
    // Raju held his old house from Mr Lim: his household moves, and he gives it back.
    for (const r of rajuFamily) expect(r.homeId).toBe(tanHome);
    expect(w.state.property[rajuOld]).toMatchObject({ holder: null, freeSince: dayIndex(w.t) });
    // Mdm Tan has nowhere else: her household sleeps rough, together.
    for (const r of tanFamily) {
      expect(r.homeId).toBe(ROUGH);
      expect(w.state.evictedWith[r.id]).toBe(tan.id);
    }
  });

  it('only a house you own: one rented from Mr Lim isn\'t yours to sell or let', () => {
    const { w } = town();
    const [raju] = at(w, 'Raju', 'Ah Kow');
    put(w, 'Mdm Tan', 'jetty');
    raju!.money = 5000;
    refused(act(w, raju!.id, { verb: 'offer_place', to: 'Ah Kow', item: 'my house', money: 3000 }), /Mr Lim/);
    refused(act(w, raju!.id, { verb: 'offer_place', to: 'Ah Kow', item: 'your house', money: 3000 }), /Mr Lim/);
    refused(act(w, raju!.id, { verb: 'offer_place', to: 'Mdm Tan', item: 'your house', money: 3000 }), /isn't here|can't see|nearby|not here/i);
  });

  it('a let: the tenant pays the owner a week up front and moves in; on Mondays the rent goes to the owner, not the fund', () => {
    const { w, tan, tanHome } = town();
    const tanFamily = living(w, tanHome);
    const kowOld = who(w, 'Ah Kow').homeId;
    tan.money = 0;
    const kow = letToKow(w, 40);
    expect(w.state.property[tanHome]).toMatchObject({ holder: kow.id, landlord: tan.id, owned: false, rent: 40, owing: 0 });
    expect(kow.homeId).toBe(tanHome);
    expect(w.state.property[kowOld]!.holder).toBe(null);
    expect(tan.money).toBe(40);
    for (const r of tanFamily) expect(r.homeId).toBe(ROUGH);
    round(w, 1);
    expect(tan.money).toBe(80);
    expect(kow.money).toBe(1000 - 80);
    expectInWorld(kow.recent.at(-1)!.text);
    expect(seen(w, 'Ah Kow')).toMatch(/Mdm Tan/);
    expect(seen(w, 'Mdm Tan')).toMatch(/Ah Kow/);
  });

  it('Mr Lim stays out of a let: no rent review, no offer to him for it, no help with it', async () => {
    const { w, tanHome } = town();
    const kow = letToKow(w);
    w.state.t = sgt(17, 0, 7);
    const briefs: ReviewBrief[] = [];
    const head: MrLimHead = { plan: async () => null, review: async (b) => { briefs.push(b); return null; } };
    await mrLimReviews(w, head, 0);
    expect(briefs[0]!.lets.map((l) => l.name)).not.toContain('Ah Kow');
    w.state.t = sgt(10, 0, 8);
    put(w, 'Ah Kow', 'village-head');
    kow.money = 100_000;
    refused(act(w, kow.id, { verb: 'offer_for_place', item: 'my house', money: 5000, side: 'buy' }));
    expect(w.state.placeOffers).toEqual([]);
    expect(w.state.property[tanHome]!.landlord).toBe(who(w, 'Mdm Tan').id);
  });

  it('owing over a week: the tenant is out, the house goes back to its owner, and the debt is owed to them', () => {
    const { w, tan, tanHome } = town();
    const kow = letToKow(w, 40);
    kow.money = 0;
    round(w, 1);
    expect(w.state.property[tanHome]!.owing).toBe(40);
    round(w, 2);
    expect(kow.homeId).toBe(ROUGH);
    expect(w.state.property[tanHome]).toMatchObject({ holder: tan.id, owned: true, landlord: null, owing: 0 });
    expect(w.state.debts.find((d) => d.debtor === kow.id && d.creditor === tan.id)?.cents).toBe(40);
    expect(w.state.arrears[kow.id] ?? 0).toBe(0);
  });

  it('a landlord changes the rent like Mr Lim: a week\'s notice, agreed in person, or the tenant leaves', () => {
    const { w, tan, tanHome } = town();
    const kow = letToKow(w, 40);
    accepted(act(w, tan.id, { verb: 'change_rent', to: 'Ah Kow', money: 60 }));
    const notice = w.state.property[tanHome]!.notice!;
    expect(notice).toMatchObject({ rent: 60, from: dayIndex(sgt(0, 0, 14)), agreed: false });
    expectInWorld(kow.recent.at(-1)!.text);
    expect(seen(w, 'Ah Kow')).toMatch(/Mdm Tan has given you notice/);
    accepted(act(w, kow.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(w.state.property[tanHome]!.notice!.agreed).toBe(true);
    // Given on a Tuesday: it starts at the round on the Monday after a week (the second).
    round(w, 1);
    expect(w.state.property[tanHome]!.rent).toBe(40);
    round(w, 2);
    expect(w.state.property[tanHome]).toMatchObject({ rent: 60, notice: null, holder: kow.id });
    // Not agreed: they leave, and the house is the owner's again.
    const t2 = town();
    const kow2 = letToKow(t2.w, 40);
    accepted(act(t2.w, t2.tan.id, { verb: 'change_rent', to: 'Ah Kow', money: 60 }));
    round(t2.w, 2);
    expect(kow2.homeId).toBe(ROUGH);
    expect(t2.w.state.property[t2.tanHome]).toMatchObject({ holder: t2.tan.id, owned: true, landlord: null, notice: null });
  });

  it('selling a house that is let keeps the sitting tenant: the buyer is their landlord, on the same rent', () => {
    const { w, tan, tanHome } = town();
    const kow = letToKow(w, 40);
    accepted(act(w, tan.id, { verb: 'change_rent', to: 'Ah Kow', money: 60 }));
    const [, raju] = at(w, 'Mdm Tan', 'Raju');
    const rajuHome = raju!.homeId;
    raju!.money = 5000;
    accepted(act(w, tan.id, { verb: 'offer_place', to: 'Raju', item: 'my house', money: 2000 }));
    accepted(act(w, raju!.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(w.state.property[tanHome]).toMatchObject({ holder: kow.id, landlord: raju!.id, rent: 40, notice: null, owned: false });
    expect(raju!.homeId).toBe(rajuHome);
    expect(kow.homeId).toBe(tanHome);
    expect(kow.recent.at(-1)!.text).toMatch(/Raju/);
    round(w, 1);
    expect(raju!.money).toBe(3000 + 40 - HOUSE_RENT);
  });

  it('an offer stands a while, then lapses', () => {
    const { w } = town();
    const [tan] = at(w, 'Mdm Tan', 'Raju');
    accepted(act(w, tan!.id, { verb: 'offer_place', to: 'Raju', item: 'my house', money: 2000 }));
    expect(w.state.placeDeals).toHaveLength(1);
    for (let k = 0; k <= TRADE_OFFER_MINUTES; k++) advance(w);
    expect(w.state.placeDeals).toHaveLength(0);
  });

  it('the money is checked when it is agreed', () => {
    const { w, tan, tanHome } = town();
    const [, raju] = at(w, 'Mdm Tan', 'Raju');
    raju!.money = 0;
    accepted(act(w, tan.id, { verb: 'offer_place', to: 'Raju', item: 'my house', money: 2000 }));
    refused(act(w, raju!.id, { verb: 'agree', from: 'Mdm Tan' }), /money|haven't/i);
    expect(w.state.property[tanHome]!.holder).toBe(tan.id);
    void FUND_ID;
    void HOUSE_RENT;
  });
});

describe('review fixes (houses between residents)', () => {
  it('an old offer the other way round can\'t be agreed once the house has changed hands', () => {
    const { w, tan, tanHome } = town();
    const [, raju] = at(w, 'Mdm Tan', 'Raju');
    raju!.money = 5000;
    tan.money = 0;
    accepted(act(w, tan.id, { verb: 'offer_place', to: 'Raju', item: 'my house', money: 1000 }));
    accepted(act(w, raju!.id, { verb: 'offer_place', to: 'Mdm Tan', item: 'your house', money: 800 }));
    accepted(act(w, tan.id, { verb: 'agree', from: 'Raju' }));
    expect(w.state.property[tanHome]!.holder).toBe(raju!.id);
    // Raju now owns it; Mdm Tan's old offer to sell it to him doesn't stand.
    tan.money += 5000;
    refused(act(w, raju!.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(w.state.property[tanHome]!.holder).toBe(raju!.id);
    expect(tan.money).toBe(5800);
  });

  it('a let that ends: the owner with nowhere else comes home again, family too', () => {
    const { w, tan, tanHome } = town();
    const family = living(w, tanHome);
    const kow = letToKow(w, 40);
    kow.money = 0;
    round(w, 1);
    round(w, 2);
    for (const r of family) expect(r.homeId).toBe(tanHome);
    expect(w.state.property[tanHome]).toMatchObject({ holder: tan.id, owned: true });
  });

  it("Mr Lim's help is sized from his own rents, not a dear let between residents", async () => {
    const { mrLimHelps, LOAN_WEEKS } = await import('../src/sim/mr-lim.ts');
    const { w } = town();
    const kow = letToKow(w, 900);
    kow.money = 0;
    w.mrLim.asks.push({ who: kow.id, said: null });
    await mrLimHelps(w, null, 0);
    const loan = w.state.loans.find((l) => l.who === kow.id);
    expect(loan?.owed ?? 0).toBeLessThanOrEqual(LOAN_WEEKS * HOUSE_RENT);
  });

  it('with more than one house: a let takes one not let, a sale to the tenant their house, and two owners say whose', () => {
    const { w, tan, tanHome } = town();
    // Mdm Tan owns a second house, standing empty.
    const [spare] = Object.entries(w.state.property).find(([id, p]) => id.startsWith('house-') && p.holder === null)!;
    Object.assign(w.state.property[spare]!, { holder: tan.id, owned: true, freeSince: null });
    const [, kow] = at(w, 'Mdm Tan', 'Ah Kow');
    kow!.money = 10_000;
    accepted(act(w, tan.id, { verb: 'offer_place', to: 'Ah Kow', item: 'my house', money: 40, renting: true }));
    expect(w.state.placeDeals[0]!.placeId).toBe(spare);
    accepted(act(w, kow!.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(tan.homeId).toBe(tanHome);
    // The tenant offers to buy the house they rent, not her home.
    accepted(act(w, kow!.id, { verb: 'offer_place', to: 'Mdm Tan', item: 'your house', money: 3000 }));
    expect(w.state.placeDeals.at(-1)!.placeId).toBe(spare);
    // Both own a house: they must say whose.
    const [, raju] = at(w, 'Mdm Tan', 'Raju');
    w.state.property[raju!.homeId]!.owned = true;
    refused(act(w, raju!.id, { verb: 'offer_place', to: 'Mdm Tan', item: 'house', money: 3000 }), /whose/i);
  });

  it('"agree to the new rent" agrees the rent, even with an offer to sell standing too', () => {
    const { w, tan, tanHome } = town();
    const kow = letToKow(w, 40);
    accepted(act(w, tan.id, { verb: 'change_rent', to: 'Ah Kow', money: 60 }));
    accepted(act(w, tan.id, { verb: 'offer_place', to: 'Ah Kow', item: 'my house', money: 500 }));
    kow.money = 10_000;
    accepted(act(w, kow.id, { verb: 'agree', from: 'Mdm Tan', text: 'I agree to the new rent' }));
    expect(w.state.property[tanHome]).toMatchObject({ landlord: tan.id, notice: { agreed: true } });
    expect(kow.money).toBe(10_000);
  });

  it("someone buying Mr Lim's house week by week can't move away from it", () => {
    const { w } = town();
    const [tan, kow] = at(w, 'Mdm Tan', 'Ah Kow');
    w.state.property[kow!.homeId]!.rentToOwn = { paid: 500, of: 3300 };
    kow!.money = 1000;
    refused(act(w, kow!.id, { verb: 'offer_place', to: 'Mdm Tan', item: 'your house', money: 40, renting: true }), /week by week/);
    accepted(act(w, tan!.id, { verb: 'offer_place', to: 'Ah Kow', item: 'my house', money: 40, renting: true }));
    refused(act(w, kow!.id, { verb: 'agree', from: 'Mdm Tan' }), /week by week/);
  });

  it("a landlord's new rent starts on a Monday, at his round", () => {
    const { w, tan, tanHome } = town();
    letToKow(w, 40);
    accepted(act(w, tan.id, { verb: 'change_rent', to: 'Ah Kow', money: 60 }));
    expect(w.state.property[tanHome]!.notice!.from).toBe(dayIndex(sgt(0, 0, 14)));
    expect(seen(w, 'Ah Kow')).toMatch(/from Monday/);
  });
});

describe('the upgrade (save v28)', () => {
  it('nobody lets to anybody yet; no offers', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 27)!;
    const world = { t: 1000 * 1440, property: { 'house-1': { holder: 'a' } } };
    const up = step.save!({ world, brains: {} }).world as Record<string, unknown>;
    expect(up.placeDeals).toEqual([]);
    expect(up.property).toEqual({ 'house-1': { holder: 'a', landlord: null } });
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});
