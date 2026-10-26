import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { GRACE_EVERY_DAYS, LOAN_WEEKS, mrLimHelps, type MrLimHead } from '../src/sim/mr-lim.ts';
import { FUND_ID, MR_LIM_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

/** A Tuesday mid-morning: Mr Lim at his door. */
const atDoor = () => newWorld(10, 0, 1);
const ask = async (w: World, name: string, head: MrLimHead | null = null) => {
  const r = put(w, name, 'village-head');
  accepted(act(w, r.id, { verb: 'ask_mr_lim_for_help', text: 'I have nothing left, Mr Lim.' }));
  await mrLimHelps(w, head, 0);
  return r;
};

describe('hardship help at his door (village-characters.md power 8; households-build.md PR B)', () => {
  it('broke, a resident is lent a little: from the fund, or his own purse while the fund is short; owed back', async () => {
    const w = atDoor();
    w.state.t = sgt(10, 0, 1);
    const siti = who(w, 'Siti');
    siti.money = 0;
    w.takeLedger();
    await ask(w, 'Siti');
    expect(siti.money).toBeGreaterThan(0);
    expect(siti.money).toBeLessThanOrEqual(LOAN_WEEKS * w.state.property[siti.homeId]!.rent);
    expect(w.takeLedger().some((l) => (l.from === FUND_ID || l.from === MR_LIM_ID) && l.to === siti.id)).toBe(true);
    expect(w.state.loans.find((l) => l.who === siti.id)!.owed).toBe(siti.money);
    expect(siti.recent.some((o) => /Mr Lim/.test(o.text))).toBe(true);
    for (const o of siti.recent.filter((x) => /Mr Lim/.test(x.text))) expectInWorld(o.text);
  });

  it('not a second loan while one is owed', async () => {
    const w = atDoor();
    w.state.t = sgt(10, 0, 1);
    const siti = who(w, 'Siti');
    siti.money = 0;
    await ask(w, 'Siti');
    const first = siti.money;
    siti.money = 0;
    w.state.t = sgt(10, 0, 2);
    await ask(w, 'Siti');
    expect(siti.money).toBe(0);
    expect(w.state.loans.filter((l) => l.who === siti.id).length).toBe(1);
    expect(first).toBeGreaterThan(0);
  });

  it('owing rent, a holder may be given a week\'s grace, once in a while, and is not turned out meanwhile', async () => {
    const w = atDoor();
    const huat = who(w, 'Ah Huat');
    const house = w.state.property[huat.homeId]!;
    house.owing = 50;
    house.since = dayIndex(w.t) - 8;
    w.state.t = sgt(10, 0, 1);
    await ask(w, 'Ah Huat', { plan: async () => null, help: async () => ({ answer: 'grace' }) });
    expect(house.grace?.until).toBeGreaterThan(dayIndex(w.t));
    expect(GRACE_EVERY_DAYS).toBeGreaterThanOrEqual(28);
  });

  it('his head may say no, in his own words, within the kampung', async () => {
    const w = atDoor();
    w.state.t = sgt(10, 0, 1);
    const siti = who(w, 'Siti');
    siti.money = 0;
    const r = await ask(w, 'Siti', { plan: async () => null, help: async () => ({ answer: 'no', words: 'Not today. Come back when you have tried the odd jobs.' }) });
    expect(r.money).toBe(0);
    expect(r.recent.some((o) => /Not today/.test(o.text))).toBe(true);
  });

  it('only at his door while he is there; asked again the same day, he has already answered', () => {
    const w = newWorld(22, 0);
    const siti = put(w, 'Siti', 'village-head');
    expect(availableActions(w, siti).map((a) => a.verb)).not.toContain('ask mr lim for help');
    expectInWorld(refused(act(w, siti.id, { verb: 'ask_mr_lim_for_help' })));
    const w2 = atDoor();
    w2.state.t = sgt(10, 0, 1);
    const s2 = put(w2, 'Siti', 'village-head');
    expect(availableActions(w2, s2).map((a) => a.verb)).toContain('ask mr lim for help');
    void advance;
  });
});

describe('the upgrade (save v25)', () => {
  it('no loans; every place without grace', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 24)!;
    const world = { property: { 'house-1': { holder: 'a', rent: 50 } } };
    const up = step.save!({ world, brains: {} }).world as Record<string, unknown>;
    expect(up.loans).toEqual([]);
    expect(up.property).toEqual({ 'house-1': { holder: 'a', rent: 50, grace: null } });
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});

describe('review fixes', () => {
  it("a week's grace given on a Monday morning covers that day's round only", async () => {
    const { rentRound } = await import('../src/sim/households.ts');
    const w = atDoor();
    // The Monday a fortnight on, before the round.
    w.state.rentFrom = 0;
    const mon = sgt(8, 30, 7);
    w.state.t = mon;
    const huat = who(w, 'Ah Huat');
    const house = w.state.property[huat.homeId]!;
    house.owing = 50;
    house.since = dayIndex(mon) - 7;
    huat.money = 0;
    await ask(w, 'Ah Huat', { plan: async () => null, help: async () => ({ answer: 'grace' }) });
    w.state.t = sgt(9, 0, 7);
    rentRound(w);
    expect(huat.homeId).not.toBe('rough');
    w.state.t = sgt(9, 0, 14);
    rentRound(w);
    expect(huat.homeId).toBe('rough');
  });

  it('a loan can be paid back early at his door; repaid a week of their rent at a time at the rounds', async () => {
    const { rentRound } = await import('../src/sim/households.ts');
    const w = atDoor();
    w.state.t = sgt(10, 0, 1);
    const siti = who(w, 'Siti');
    siti.money = 0;
    await ask(w, 'Siti');
    const owed = w.state.loans[0]!.owed;
    siti.money = 30;
    accepted(act(w, siti.id, { verb: 'pay_rent', money: 30 }));
    expect(w.state.loans[0]!.owed).toBe(owed - 30);
    w.state.rentFrom = 0;
    siti.money = 1000;
    w.state.t = sgt(9, 0, 7);
    const fund = w.state.fund;
    rentRound(w);
    expect(w.state.fund - fund).toBeGreaterThanOrEqual(w.state.property[siti.homeId]!.rent);
  });

  it('a child is not one to ask Mr Lim for a loan', () => {
    const w = atDoor();
    w.state.t = sgt(10, 0, 1);
    const hassan = put(w, 'Hassan', 'village-head');
    expect(availableActions(w, hassan).map((a) => a.verb)).not.toContain('ask mr lim for help');
  });

  it('his words go with what he does: a head that picks what he cannot give is not quoted', async () => {
    const w = atDoor();
    w.state.t = sgt(10, 0, 1);
    const siti = who(w, 'Siti');
    siti.money = 0;
    await ask(w, 'Siti', { plan: async () => null, help: async () => ({ answer: 'grace', words: 'Take another week on the rent.' }) });
    expect(siti.recent.some((o) => /another week/.test(o.text))).toBe(false);
  });
});
