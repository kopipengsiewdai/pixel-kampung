import { describe, expect, it } from 'vitest';
import { BUY_WEEKS, HOUSE_RENT, householdsMinute, rentRound, STALL_RENT } from '../src/sim/households.ts';
import { mrLimDecides } from '../src/sim/mr-lim.ts';
import { skipQuietly } from '../src/sim/skip.ts';
import { weekdayAt } from '../src/sim/calendar.ts';
import { PLACE_BY_ID } from '../src/sim/map.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { FUND_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** Rent is due from today, so the next round collects. */
const rentDueNow = (w: World) => { w.state.rentFrom = dayIndex(w.t) - 1; };
/** A Tuesday morning, Mr Lim at his door (day after the test world's Monday, or `day`). */
const tuesday = (w: World, day = 1) => { w.state.t = sgt(10, 0, day); };
/** That evening: Mr Lim's answers, his own way. */
const hisAnswers = async (w: World) => { w.state.t = sgt(17, 0, Math.floor((w.t - sgt(0, 0)) / 1440)); await mrLimDecides(w, null, 0); };
/** Rent-to-own as it was offered: half as much again a week, for 44 weeks. */
const RTO_WEEKS = 44;

describe('who lives where', () => {
  it('Ah Seng lives with his father and Mei Ling with her aunt; two houses stand free', () => {
    const w = newWorld(9);
    expect(who(w, 'Ah Seng').homeId).toBe(who(w, 'Ah Huat').homeId);
    expect(who(w, 'Mei Ling').homeId).toBe(who(w, 'Mdm Tan').homeId);
    const free = Object.entries(w.state.property).filter(([id, p]) => id.startsWith('house-') && p.holder === null);
    expect(free).toHaveLength(2);
    expect(w.placeName(PLACE_BY_ID.get(who(w, 'Ah Huat').homeId)!)).toBe("Ah Huat's house");
  });

  it("the village head's house is on the map and known to those who have lived here", () => {
    const w = newWorld(9);
    expect(PLACE_BY_ID.get('village-head')?.name).toBe("the village head's house");
    expect(who(w, 'Siti').knownPlaces).toContain('village-head');
  });
});

describe('every house and stall pays rent to the village fund', () => {
  it('starts at 50 cents a house and a dollar a stall, held by the first of the household or the shopkeeper', () => {
    const w = newWorld(9);
    const home = w.state.property[who(w, 'Ah Huat').homeId]!;
    expect(home).toMatchObject({ holder: who(w, 'Ah Huat').id, rent: HOUSE_RENT, owned: false, owing: 0 });
    expect(w.state.property.kopitiam).toMatchObject({ holder: who(w, 'Ah Huat').id, rent: STALL_RENT });
    expect(HOUSE_RENT).toBe(50);
    expect(STALL_RENT).toBe(100);
  });

  it("no rent is taken before the day it starts", () => {
    const w = newWorld(9);
    const huat = who(w, 'Ah Huat');
    const before = huat.money;
    rentRound(w);
    expect(huat.money).toBe(before);
    expect(w.state.rentFrom).toBeGreaterThanOrEqual(dayIndex(w.t) + 28);
  });

  it('on a rent round each holder pays what they can, and what they cannot is owed; the ledger still checks out', () => {
    const w = newWorld(9);
    rentDueNow(w);
    const huat = who(w, 'Ah Huat');
    huat.money = 1000;
    const rahim = who(w, 'Rahim');
    rahim.money = 0;
    const held = () => w.state.residents.reduce((n, r) => n + r.money, 0) + w.state.fund;
    const before = held();
    w.takeLedger();
    rentRound(w);
    // Money only moved, through the ledger, into the fund.
    expect(held()).toBe(before);
    expect(w.takeLedger().every((l) => l.to === FUND_ID)).toBe(true);
    expect(huat.money).toBe(1000 - HOUSE_RENT - STALL_RENT);
    expect(w.state.fund).toBeGreaterThanOrEqual(HOUSE_RENT + STALL_RENT);
    expect(w.state.property[rahim.homeId]!.owing).toBe(HOUSE_RENT);
    expect(w.state.property['market-stall']!.owing).toBe(STALL_RENT);
    expect(huat.recent.some((o) => /rent/.test(o.text))).toBe(true);
    expectInWorld(huat.recent.at(-1)!.text);
  });

  it('paying what you owe at the village head\'s house', () => {
    const w = newWorld(9);
    rentDueNow(w);
    const rahim = who(w, 'Rahim');
    rahim.money = 0;
    rentRound(w);
    put(w, 'Rahim', 'village-head');
    rahim.money = 500;
    expect(seen(w, 'Rahim')).toMatch(/You owe Mr Lim/);
    accepted(act(w, rahim.id, { verb: 'pay_rent' }));
    expect(w.state.property[rahim.homeId]!.owing).toBe(0);
    expect(w.state.property['market-stall']!.owing).toBe(0);
    expect(rahim.money).toBe(500 - HOUSE_RENT - STALL_RENT);
    put(w, 'Rahim', 'well');
    refused(act(w, rahim.id, { verb: 'pay_rent' }), /village head's house/);
  });
});

describe('buying instead of renting', () => {
  it('outright, at a price Mr Lim takes: no more rent, and it can never be taken', async () => {
    const w = newWorld(9);
    tuesday(w);
    const tan = put(w, 'Mdm Tan', 'village-head');
    tan.money = 100_000;
    accepted(act(w, tan.id, { verb: 'offer_for_place', item: 'my house', money: (BUY_WEEKS * HOUSE_RENT) / 2, side: 'buy' }));
    await hisAnswers(w);
    expect(w.state.property[tan.homeId]!.owned).toBe(true);
    expect(tan.money).toBe(100_000 - (BUY_WEEKS * HOUSE_RENT) / 2);
    rentDueNow(w);
    const before = tan.money;
    rentRound(w);
    // Her stall is still rented.
    expect(tan.money).toBe(before - STALL_RENT);
  });

  it('a rent-to-own already running: the bigger weekly payment, and after enough weeks it is theirs', () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    const place = w.state.property[siti.homeId]!;
    place.rentToOwn = { paid: 0, of: RTO_WEEKS * Math.round(HOUSE_RENT * 1.5) };
    rentDueNow(w);
    siti.money = 100_000;
    for (let k = 0; k < RTO_WEEKS; k++) rentRound(w);
    expect(place.owned).toBe(true);
    expect(siti.money).toBe(100_000 - RTO_WEEKS * Math.round(HOUSE_RENT * 1.5));
  });
});

describe('not paying', () => {
  it('a week owing and more, and the whole household is out: they sleep rough at the jetty, more poorly', () => {
    const w = newWorld(9);
    rentDueNow(w);
    const fat = who(w, 'Fatimah');
    const home = fat.homeId;
    fat.money = 0;
    rentRound(w);
    w.state.t += 8 * 1440;
    rentRound(w);
    for (const name of ['Fatimah', 'Aminah', 'Hassan']) expect(who(w, name).homeId).toBe('rough');
    expect(w.state.property[home]!.holder).toBeNull();
    expect(fat.recent.some((o) => /no longer your home/.test(o.text))).toBe(true);
    expect(w.home(fat).id).toBe('jetty');
    // Sleeping rough, energy comes back at half the speed of a bed at home.
    const n = newWorld(1, 0);
    const rough = put(n, 'Fatimah', 'jetty');
    rough.homeId = 'rough';
    const bed = put(n, 'Siti', who(n, 'Siti').homeId);
    for (const r of [rough, bed]) { r.energy = 100; r.activity = { kind: 'sleeping', reason: 'night', until: null }; }
    for (let i = 0; i < 60; i++) advance(n);
    expect(bed.energy - 100).toBe(180);
    expect(rough.energy - 100).toBe(90);
  });

  it('a place that is owned is never taken', () => {
    const w = newWorld(9);
    const home = who(w, 'Siti').homeId;
    w.state.property[home]!.owned = true;
    rentDueNow(w);
    who(w, 'Siti').money = 0;
    rentRound(w);
    w.state.t += 8 * 1440;
    rentRound(w);
    expect(who(w, 'Siti').homeId).toBe(home);
  });
});

describe('a free house', () => {
  it('can be rented at the village head\'s house, and becomes home', async () => {
    const w = newWorld(9);
    tuesday(w);
    const kow = put(w, 'Ah Kow', 'village-head');
    kow.homeId = 'rough';
    expect(seen(w, 'Ah Kow')).toMatch(/free/);
    accepted(act(w, kow.id, { verb: 'offer_for_place', item: 'a house', money: HOUSE_RENT }));
    await hisAnswers(w);
    expect(kow.homeId).toMatch(/^house-/);
    expect(w.state.property[kow.homeId]!.holder).toBe(kow.id);
    for (const line of seen(w, 'Ah Kow').split('\n')) expectInWorld(line);
  });
});

describe('the review: rent that holds up', () => {
  it('the evicted keep their debt, and must pay it and a week up front before Mr Lim lets them another house; their family comes home with them', async () => {
    const w = newWorld(9);
    rentDueNow(w);
    const fat = who(w, 'Fatimah');
    fat.money = 0;
    rentRound(w);
    w.state.t += 7 * 1440;
    rentRound(w);
    expect(fat.homeId).toBe('rough');
    expect(w.state.arrears[fat.id]).toBe(HOUSE_RENT);
    tuesday(w, 8);
    put(w, 'Fatimah', 'village-head');
    refused(act(w, fat.id, { verb: 'offer_for_place', item: 'a house', money: HOUSE_RENT }), /still owe Mr Lim/);
    fat.money = 1000;
    accepted(act(w, fat.id, { verb: 'pay_rent' }));
    accepted(act(w, fat.id, { verb: 'offer_for_place', item: 'a house', money: HOUSE_RENT }));
    await hisAnswers(w);
    expect(fat.money).toBe(1000 - 2 * HOUSE_RENT);
    for (const name of ['Aminah', 'Hassan']) expect(who(w, name).homeId).toBe(fat.homeId);
  });

  it('with no money, no house: a week up front', () => {
    const w = newWorld(9);
    tuesday(w);
    const kow = put(w, 'Ah Kow', 'village-head');
    kow.homeId = 'rough';
    kow.money = 10;
    refused(act(w, kow.id, { verb: 'offer_for_place', item: 'a house', money: HOUSE_RENT }), /first week/);
  });

  it('rent-to-own counts every cent paid, part payments and paying what was owed too', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'village-head');
    const place = w.state.property[siti.homeId]!;
    place.rentToOwn = { paid: 0, of: RTO_WEEKS * Math.round(HOUSE_RENT * 1.5) };
    rentDueNow(w);
    siti.money = 50;
    rentRound(w);
    siti.money = 100;
    rentRound(w);
    expect(place.rentToOwn!.paid).toBe(150);
    siti.money = 0;
    rentRound(w);
    siti.money = 75;
    accepted(act(w, siti.id, { verb: 'pay_rent' }));
    expect(place.rentToOwn!.paid).toBe(225);
  });

  it("grace runs from the oldest week still owed, and the next Monday after a missed one, they're out", () => {
    const w = newWorld(9);
    rentDueNow(w);
    const siti = who(w, 'Siti');
    const home = siti.homeId;
    siti.money = 0;
    rentRound(w);
    w.state.t += 7 * 1440;
    siti.money = HOUSE_RENT;
    rentRound(w);
    // The old week is paid; this week's grace starts now.
    expect(siti.homeId).toBe(home);
    expect(w.state.property[home]!.since).toBe(dayIndex(w.t));
  });

  it('a Monday round the kampung slept through is caught up, once', () => {
    const w = newWorld(8, 0);
    while (weekdayAt(w.state, w.t) !== 'Monday') w.state.t += 1440;
    w.state.rentFrom = dayIndex(w.t);
    w.state.lastRoundDay = 0;
    const huat = who(w, 'Ah Huat');
    huat.money = 10_000;
    skipQuietly(w, w.t + 3 * 60);
    householdsMinute(w);
    householdsMinute(w);
    expect(huat.money).toBe(10_000 - HOUSE_RENT - STALL_RENT);
  });

  it("money Mr Lim can't make out is turned down, not taken in full", () => {
    const w = newWorld(9);
    rentDueNow(w);
    const rahim = who(w, 'Rahim');
    rahim.money = 0;
    rentRound(w);
    put(w, 'Rahim', 'village-head');
    rahim.money = 500;
    refused(act(w, rahim.id, { verb: 'pay_rent', money: 'half' }), /doesn't sound like money/);
    expect(rahim.money).toBe(500);
  });
});
