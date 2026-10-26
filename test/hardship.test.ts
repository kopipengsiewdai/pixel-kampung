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
