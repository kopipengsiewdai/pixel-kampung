import { describe, expect, it } from 'vitest';
import { BUY_WEEKS, HOUSE_RENT, RENT_TO_OWN_WEEKS, rentRound, STALL_RENT } from '../src/sim/households.ts';
import { PLACE_BY_ID } from '../src/sim/map.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { FUND_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** Rent is due from today, so the next round collects. */
const rentDueNow = (w: World) => { w.state.rentFrom = dayIndex(w.t) - 1; };

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
  it('outright, at a year\'s rent: no more rent, and it can never be taken', () => {
    const w = newWorld(9);
    const tan = put(w, 'Mdm Tan', 'village-head');
    tan.money = 100_000;
    accepted(act(w, tan.id, { verb: 'buy_place', item: 'house' }));
    expect(w.state.property[tan.homeId]!.owned).toBe(true);
    expect(tan.money).toBe(100_000 - BUY_WEEKS * HOUSE_RENT);
    rentDueNow(w);
    const before = tan.money;
    rentRound(w);
    // Her stall is still rented.
    expect(tan.money).toBe(before - STALL_RENT);
  });

  it('rent-to-own: a bigger weekly payment, and after enough weeks it is theirs', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'village-head');
    accepted(act(w, siti.id, { verb: 'rent_to_own' }));
    const place = w.state.property[siti.homeId]!;
    expect(place.rentToOwn).toEqual({ paid: 0, of: RENT_TO_OWN_WEEKS });
    rentDueNow(w);
    siti.money = 100_000;
    for (let k = 0; k < RENT_TO_OWN_WEEKS; k++) rentRound(w);
    expect(place.owned).toBe(true);
    expect(siti.money).toBe(100_000 - RENT_TO_OWN_WEEKS * Math.round(HOUSE_RENT * 1.5));
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
  it('can be rented at the village head\'s house, and becomes home', () => {
    const w = newWorld(9);
    const kow = put(w, 'Ah Kow', 'village-head');
    kow.homeId = 'rough';
    expect(seen(w, 'Ah Kow')).toMatch(/free/);
    accepted(act(w, kow.id, { verb: 'rent_house' }));
    expect(kow.homeId).toMatch(/^house-/);
    expect(w.state.property[kow.homeId]!.holder).toBe(kow.id);
    for (const line of seen(w, 'Ah Kow').split('\n')) expectInWorld(line);
  });
});
