import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { DECIDE_AT, mrLimDecides, WAIT_DAYS, type MrLimHead } from '../src/sim/mr-lim.ts';
import { HOUSE_RENT, rentRound } from '../src/sim/households.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { FUND_ID, MR_LIM_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const freeHouses = (w: World) => Object.entries(w.state.property).filter(([id, p]) => id.startsWith('house-') && p.holder === null).map(([id]) => id);
/** A Tuesday at his door, offers being made. */
const tuesday = () => { const w = newWorld(10, 0); w.state.t = sgt(10, 0, 1); return w; };
async function evening(w: World, head: MrLimHead | null = null) {
  w.state.t = w.t - (w.t % 1) ;
  while (((w.t + 480) % 1440) < DECIDE_AT) advance(w);
  await mrLimDecides(w, head, 0);
}
const offer = (w: World, name: string, cents: number, item = 'house', side: 'rent' | 'buy' = 'rent') => {
  const r = put(w, name, 'village-head');
  return act(w, r.id, { verb: 'offer_for_place', item, money: cents, side });
};

describe('a free market in houses (households-build.md "Housing market"): free places go up on the board', () => {
  it('each morning Mr Lim pins what stands free, asking for offers', () => {
    const w = newWorld(6, 0);
    while (w.t < sgt(9, 0)) advance(w);
    const note = w.state.notes.find((n) => n.authorId === MR_LIM_ID && /offer/i.test(n.text))!;
    expect(note).toBeTruthy();
    expectInWorld(note.text);
    expect(freeHouses(w).length).toBeGreaterThan(0);
  });
});

describe('offers at his door; he decides in the evening', () => {
  it('a rent offer for a free house, with no floor: the best he gets, and a week up front', async () => {
    const w = tuesday();
    const kow = who(w, 'Ah Kow');
    kow.homeId = 'rough';
    kow.money = 200;
    expectInWorld(accepted(offer(w, 'Ah Kow', HOUSE_RENT)).reply!);
    expect(seen(w, 'Ah Kow')).toMatch(/You've offered Mr Lim/);
    await evening(w);
    expect(kow.homeId).toMatch(/^house-/);
    const place = w.state.property[kow.homeId]!;
    expect(place).toMatchObject({ holder: kow.id, rent: HOUSE_RENT, owned: false });
    expect(kow.money).toBe(200 - HOUSE_RENT);
  });

  it('several want the same place: he chooses the best offer, and tells the others', async () => {
    const w = tuesday();
    // One house left free.
    for (const id of freeHouses(w).slice(1)) w.state.property[id]!.holder = 'ah-huat';
    for (const [name, cents] of [['Ah Kow', 40], ['Raju', 70]] as const) {
      const r = who(w, name);
      r.homeId = 'rough';
      r.money = 500;
      accepted(offer(w, name, cents));
    }
    await evening(w);
    expect(who(w, 'Raju').homeId).toMatch(/^house-/);
    expect(who(w, 'Ah Kow').homeId).toBe('rough');
    expect(who(w, 'Ah Kow').recent.some((o) => /Mr Lim/.test(o.text) && /someone else/.test(o.text))).toBe(true);
  });

  it('a low offer: his own way is to wait a few days for better, then take the best he has', async () => {
    const w = tuesday();
    const kow = who(w, 'Ah Kow');
    kow.homeId = 'rough';
    kow.money = 500;
    accepted(offer(w, 'Ah Kow', 5));
    await evening(w);
    expect(kow.homeId).toBe('rough');
    for (let d = 0; d < WAIT_DAYS; d++) {
      w.state.t = sgt(10, 0, 2 + d);
      await evening(w);
    }
    expect(kow.homeId).toMatch(/^house-/);
    expect(w.state.property[kow.homeId]!.rent).toBe(5);
  });

  it('his head may accept, counter or wait; only what was offered can be accepted', async () => {
    const w = tuesday();
    const kow = who(w, 'Ah Kow');
    kow.homeId = 'rough';
    kow.money = 500;
    accepted(offer(w, 'Ah Kow', 30));
    await evening(w, { plan: async () => null, decide: async () => ({ answer: 'counter', cents: 45, words: 'Make it forty-five cents and it is yours.' }) });
    expect(kow.homeId).toBe('rough');
    expect(kow.recent.some((o) => /forty-five/.test(o.text))).toBe(true);
    accepted(offer(w, 'Ah Kow', 45));
    w.state.t = sgt(10, 0, 2);
    await evening(w, { plan: async () => null, decide: async (b) => ({ answer: 'accept', offer: b.offers[0]!.n }) });
    expect(w.state.property[kow.homeId]?.rent).toBe(45);
  });

  it('buying: his own place, or a free one, at a price he accepts; then never taken', async () => {
    const w = tuesday();
    const tan = who(w, 'Mdm Tan');
    tan.money = 100_000;
    accepted(offer(w, 'Mdm Tan', 3000, 'my house', 'buy'));
    await evening(w, { plan: async () => null, decide: async (b) => ({ answer: 'accept', offer: b.offers[0]!.n }) });
    expect(w.state.property[tan.homeId]!.owned).toBe(true);
    expect(tan.money).toBe(100_000 - 3000);
    const fund = w.state.fund;
    expect(fund).toBeGreaterThanOrEqual(3000);
  });

  it('refused in-world: owing him, an offer of nothing, or for what is not free', () => {
    const w = tuesday();
    const fat = who(w, 'Fatimah');
    w.state.arrears[fat.id] = 50;
    fat.homeId = 'rough';
    expectInWorld(refused(offer(w, 'Fatimah', 50)));
    expectInWorld(refused(offer(w, 'Siti', 0)));
    expectInWorld(refused(offer(w, 'Siti', 50, 'the kopitiam')));
  });

  it('the old fixed prices are gone: no rent-to-own offered; a deal already running finishes on its terms', () => {
    const w = tuesday();
    const siti = put(w, 'Siti', 'village-head');
    const verbs = availableActions(w, siti).map((a) => a.verb);
    expect(verbs).not.toContain('rent to own');
    expect(verbs).not.toContain('rent house');
    expect(verbs).toContain('offer for place');
    const place = w.state.property[siti.homeId]!;
    place.rentToOwn = { paid: 990, of: 1000 };
    w.state.rentFrom = dayIndex(w.t) - 1;
    siti.money = 1000;
    rentRound(w);
    expect(place.owned).toBe(true);
    void FUND_ID;
  });
});

describe('his head held to what he can do', () => {
  it('an offer he never had, or a counter of nothing, and he goes his own way; at most three thoughts an evening', async () => {
    const w = tuesday();
    for (const name of ['Ah Kow', 'Raju', 'Siti', 'Rahim']) {
      const r = who(w, name);
      r.homeId = 'rough';
      r.money = 500;
      accepted(offer(w, name, 5));
    }
    let calls = 0;
    await evening(w, { plan: async () => null, decide: async () => { calls++; return calls === 1 ? { answer: 'accept', offer: 12345 } : { answer: 'counter', cents: -4 }; } });
    expect(calls).toBeLessThanOrEqual(3);
    // His own way with offers so low on a house only just free: he waits, and nobody is told anything odd.
    expect(who(w, 'Ah Kow').homeId).toBe('rough');
    for (const name of ['Ah Kow', 'Raju', 'Siti', 'Rahim']) for (const o of who(w, name).recent) expectInWorld(o.text);
    expect(w.state.placeOffers.length).toBe(4);
  });
});

describe('review fixes', () => {
  const lim = (decide: MrLimHead['decide']): MrLimHead => ({ plan: async () => null, decide });

  it('a counter is for one kind: a rent counter is not quoted to someone offering to buy', async () => {
    const w = tuesday();
    for (const [name, cents, side] of [['Ah Kow', 10, 'rent'], ['Raju', 500, 'buy']] as const) {
      const r = who(w, name);
      r.homeId = 'rough';
      r.money = 1000;
      accepted(offer(w, name, cents, 'house', side));
    }
    await evening(w, lim(async () => ({ answer: 'counter', cents: 40, kind: 'rent' })));
    expect(who(w, 'Ah Kow').recent.some((o) => /40¢ a week/.test(o.text))).toBe(true);
    expect(who(w, 'Raju').recent.some((o) => /40¢/.test(o.text))).toBe(false);
    expect(w.state.placeOffers.map((o) => o.who)).toEqual([who(w, 'Raju').id]);
  });

  it('his own way never sells a house for a song, however long it stands free', async () => {
    const w = tuesday();
    const raju = who(w, 'Raju');
    raju.homeId = 'rough';
    raju.money = 1000;
    accepted(offer(w, 'Raju', 40, 'house', 'buy'));
    for (let d = 0; d <= WAIT_DAYS + 1; d++) {
      w.state.t = sgt(10, 0, 1 + d);
      await evening(w);
    }
    expect(raju.homeId).toBe('rough');
  });

  it('buying week by week already, no offer to buy: the deal finishes on its terms', () => {
    const w = tuesday();
    w.state.property[who(w, 'Siti').homeId]!.rentToOwn = { paid: 100, of: 3300 };
    who(w, 'Siti').money = 5000;
    expectInWorld(refused(offer(w, 'Siti', 2000, 'my house', 'buy'), /week by week/));
  });

  it('a stall is named as people say it', () => {
    const w = tuesday();
    who(w, 'Mdm Tan').money = 100_000;
    const reply = accepted(offer(w, 'Mdm Tan', 3000, 'my shop', 'buy')).reply!;
    expect(reply).not.toMatch(/your the|the the/);
  });

  it('"a house for my family", from someone holding nothing, is an offer for a free house', () => {
    const w = tuesday();
    const mei = who(w, 'Mei Ling');
    mei.money = 500;
    mei.born = who(w, 'Mdm Tan').born;
    accepted(offer(w, 'Mei Ling', 50, 'a house for my family'));
    expect(w.state.placeOffers[0]!.placeId).toBeNull();
  });

  it('owing him rent by the evening, an offer to buy is not taken (no debt wiped)', async () => {
    const w = tuesday();
    const tan = who(w, 'Mdm Tan');
    tan.money = 100_000;
    accepted(offer(w, 'Mdm Tan', 3000, 'my house', 'buy'));
    w.state.property[tan.homeId]!.owing = 50;
    await evening(w);
    expect(w.state.property[tan.homeId]!.owned).toBe(false);
    expect(w.state.property[tan.homeId]!.owing).toBe(50);
    expect(tan.recent.some((o) => /owe him rent/.test(o.text))).toBe(true);
  });

  it('he answers once an evening, even across a restart', async () => {
    const w = tuesday();
    const kow = who(w, 'Ah Kow');
    kow.homeId = 'rough';
    kow.money = 500;
    accepted(offer(w, 'Ah Kow', 5));
    let calls = 0;
    const head = lim(async () => { calls++; return { answer: 'wait' }; });
    await evening(w, head);
    w.mrLim = { ...w.mrLim, day: -1 };
    await mrLimDecides(w, head, 0);
    expect(calls).toBe(1);
    // Offered after his answers, it waits for tomorrow's.
    expect(accepted(offer(w, 'Ah Kow', 6)).reply).toMatch(/tomorrow evening/);
  });

  it('offers are numbered for him; his words go only with what he decides', async () => {
    const w = tuesday();
    const kow = who(w, 'Ah Kow');
    kow.homeId = 'rough';
    kow.money = 500;
    accepted(offer(w, 'Ah Kow', 50));
    const seenBy: number[] = [];
    await evening(w, lim(async (b) => { seenBy.push(...b.offers.map((o) => o.n)); return { answer: 'accept', offer: 7, words: 'Offer seven it is.' }; }));
    expect(seenBy).toEqual([1]);
    // His answer named no offer he had: his own way (fifty cents will do), and not his words.
    expect(kow.homeId).toMatch(/^house-/);
    expect(kow.recent.some((o) => /seven/.test(o.text))).toBe(false);
  });

  it('a household turned out together comes home together, whoever makes the offer, and takes one house', async () => {
    const w = tuesday();
    const fat = who(w, 'Fatimah');
    const home = fat.homeId;
    // Turned out: Fatimah held the house; Aminah and Hassan with her.
    for (const name of ['Fatimah', 'Aminah', 'Hassan']) {
      const r = who(w, name);
      r.homeId = 'rough';
      w.state.evictedWith[r.id] = fat.id;
    }
    Object.assign(w.state.property[home]!, { holder: null, freeSince: 0 });
    fat.money = 500;
    const aminah = who(w, 'Aminah');
    aminah.money = 500;
    aminah.born = fat.born;
    accepted(offer(w, 'Aminah', 50));
    accepted(offer(w, 'Fatimah', 50));
    const free = freeHouses(w).length;
    await evening(w);
    for (const name of ['Fatimah', 'Aminah', 'Hassan']) expect(who(w, name).homeId).toMatch(/^house-/);
    expect(new Set(['Fatimah', 'Aminah', 'Hassan'].map((n) => who(w, n).homeId)).size).toBe(1);
    expect(freeHouses(w).length).toBe(free - 1);
  });

  it('his note says how many stand free through the day', () => {
    const w = newWorld(6, 0);
    while (w.t < sgt(9, 0)) advance(w);
    const before = freeHouses(w).length;
    const home = who(w, 'Siti').homeId;
    Object.assign(w.state.property[home]!, { holder: null, freeSince: dayIndex(w.t) });
    advance(w);
    const notes = w.state.notes.filter((n) => n.authorId === MR_LIM_ID && /^To let/.test(n.text));
    expect(notes.length).toBe(1);
    expect(notes[0]!.text).toMatch(new RegExp(`${before + 1} houses`));
  });
});

describe('the upgrade (save v26)', () => {
  it('no offers yet; every free place free from today', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 25)!;
    const world = { t: 1000 * 1440, property: { 'house-1': { holder: 'a' }, 'house-4': { holder: null } } };
    const up = step.save!({ world, brains: {} }).world as Record<string, unknown>;
    expect(up.placeOffers).toEqual([]);
    expect(up.property).toEqual({ 'house-1': { holder: 'a', freeSince: null }, 'house-4': { holder: null, freeSince: 1000 } });
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});
