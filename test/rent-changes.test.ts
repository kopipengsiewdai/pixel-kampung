import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { HOUSE_RENT, householdsMinute, ROUGH } from '../src/sim/households.ts';
import { mrLimReviews, type MrLimHead, type ReviewBrief } from '../src/sim/mr-lim.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { type World } from '../src/sim/state.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** Monday evening (day 0 of the test world, or a week on), rent already started. */
function monday(week = 0): World {
  const w = newWorld(9, 0);
  w.state.rentFrom = dayIndex(w.t);
  w.state.lastRoundDay = dayIndex(w.t);
  w.state.t = sgt(17, 0, week * 7);
  return w;
}
/** A head that changes the named tenants' rents (by name), and counts its calls. */
function head(changes: Record<string, number>, words = 'Times are hard, and the roofs want mending.') {
  const briefs: ReviewBrief[] = [];
  const h: MrLimHead & { briefs: ReviewBrief[] } = {
    briefs,
    plan: async () => null,
    review: async (b) => {
      briefs.push(b);
      return { changes: Object.entries(changes).map(([name, rent]) => ({ house: b.lets.find((l) => l.name === name)?.n ?? 99, rent })), words };
    },
  };
  return h;
}
/** The next Monday's round (a week on from day `from`'s Monday). */
const roundOn = (w: World, day: number) => { w.state.t = sgt(9, 0, day); householdsMinute(w); };

describe("a sitting tenant's rent changes only with a week's notice and their agreement (households-build.md \"Housing market\" Q4)", () => {
  it('his own way, he never changes a rent', async () => {
    const w = monday();
    const before = JSON.stringify(w.state.property);
    await mrLimReviews(w, null, 0);
    expect(JSON.stringify(w.state.property)).toBe(before);
  });

  it('his head looks over the houses he lets once a week, on Monday evening, and gives notice of a new rent', async () => {
    const w = monday();
    const kow = who(w, 'Ah Kow');
    const h = head({ 'Ah Kow': 80 });
    await mrLimReviews(w, h, 0);
    expect(h.briefs).toHaveLength(1);
    expect(h.briefs[0]!.lets.find((l) => l.name === 'Ah Kow')).toMatchObject({ rent: HOUSE_RENT });
    const place = w.state.property[kow.homeId]!;
    expect(place.rent).toBe(HOUSE_RENT);
    expect(place.notice).toEqual({ rent: 80, from: dayIndex(w.t) + 7, agreed: false });
    // Once a week: again tonight (a restart), or Tuesday, and he doesn't look again.
    await mrLimReviews(w, h, 0);
    w.state.t = sgt(17, 0, 1);
    await mrLimReviews(w, h, 0);
    expect(h.briefs).toHaveLength(1);
    // The tenant hears, in the kampung's own words, and sees it wherever they are.
    const heard = kow.recent.at(-1)?.text ?? '';
    expectInWorld(heard);
    expect(heard).toMatch(/80¢ a week/);
    expect(heard).toMatch(/Times are hard/);
    expect(seen(w, 'Ah Kow')).toMatch(/notice/);
    expect(seen(w, 'Ah Kow')).toMatch(/80¢ a week/);
  });

  it('agreed at his door: from the Monday a week on, the new rent is what the round takes', async () => {
    const w = monday();
    const kow = who(w, 'Ah Kow');
    kow.money = 1000;
    await mrLimReviews(w, head({ 'Ah Kow': 80 }), 0);
    // Tuesday morning, at his door.
    w.state.t = sgt(10, 0, 1);
    put(w, 'Ah Kow', 'village-head');
    expect(availableActions(w, kow).map((a) => a.verb)).toContain('agree to rent');
    expectInWorld(accepted(act(w, kow.id, { verb: 'agree_to_rent' })).reply!);
    expect(availableActions(w, kow).map((a) => a.verb)).not.toContain('agree to rent');
    roundOn(w, 7);
    const place = w.state.property[kow.homeId]!;
    expect(place).toMatchObject({ holder: kow.id, rent: 80, notice: null });
    expect(kow.money).toBe(1000 - 80);
  });

  it("not agreed by then: the household leaves the house that Monday, owing nothing new, and it stands free", async () => {
    const w = monday();
    const kow = who(w, 'Ah Kow');
    const houseId = kow.homeId;
    const family = w.state.residents.filter((r) => r.homeId === houseId);
    kow.money = 1000;
    await mrLimReviews(w, head({ 'Ah Kow': 80 }), 0);
    roundOn(w, 7);
    for (const r of family) expect(r.homeId).toBe(ROUGH);
    expect(kow.money).toBe(1000);
    expect(w.state.arrears[kow.id] ?? 0).toBe(0);
    expect(w.state.property[houseId]).toMatchObject({ holder: null, notice: null, freeSince: dayIndex(w.t), rent: HOUSE_RENT });
    const heard = kow.recent.at(-1)?.text ?? '';
    expectInWorld(heard);
    expect(heard).toMatch(/new rent/);
    // They can offer for a house again, all together.
    expect(w.state.evictedWith[kow.id]).toBe(kow.id);
  });

  it('a lower rent needs no agreeing to', async () => {
    const w = monday();
    const kow = who(w, 'Ah Kow');
    kow.money = 1000;
    await mrLimReviews(w, head({ 'Ah Kow': 30 }), 0);
    expect(w.state.property[kow.homeId]!.notice).toMatchObject({ rent: 30, agreed: true });
    expect(kow.recent.at(-1)?.text).toMatch(/30¢ a week/);
    roundOn(w, 7);
    expect(w.state.property[kow.homeId]).toMatchObject({ holder: kow.id, rent: 30, notice: null });
    expect(kow.money).toBe(1000 - 30);
  });

  it("his head is held to what he can do: only houses he lets, a rent of a cent or more, a change from what it is", async () => {
    const w = monday();
    const tan = who(w, 'Mdm Tan');
    const siti = who(w, 'Siti');
    w.state.property[tan.homeId]!.owned = true;
    w.state.property[siti.homeId]!.rentToOwn = { paid: 0, of: 3300 };
    const h: MrLimHead & { briefs: ReviewBrief[] } = { briefs: [], plan: async () => null, review: async (b) => { h.briefs.push(b); return { changes: [{ house: 0, rent: 90 }, { house: 1, rent: 0 }, { house: 2, rent: HOUSE_RENT }, { house: 3, rent: 'lots' }, { house: 4.5, rent: 70 }, 'x'] }; } };
    await mrLimReviews(w, h, 0);
    const names = h.briefs[0]!.lets.filter((l) => l.place === 'a house').map((l) => l.name);
    expect(names).not.toContain('Mdm Tan');
    expect(names).not.toContain('Siti');
    expect(Object.values(w.state.property).filter((p) => p.notice)).toEqual([]);
    // A head that answers nothing, or fails, changes nothing.
    const w2 = monday();
    await mrLimReviews(w2, { plan: async () => null, review: async () => null }, 0);
    expect(Object.values(w2.state.property).filter((p) => p.notice)).toEqual([]);
  });

  it('a house let go for rent owing, or bought, before the Monday: the notice goes with it', async () => {
    const w = monday();
    const kow = who(w, 'Ah Kow');
    const place = w.state.property[kow.homeId]!;
    await mrLimReviews(w, head({ 'Ah Kow': 80 }), 0);
    // He buys it at his door that week.
    w.state.t = sgt(10, 0, 1);
    put(w, 'Ah Kow', 'village-head');
    kow.money = 100_000;
    accepted(act(w, kow.id, { verb: 'offer_for_place', item: 'my house', money: 5000, side: 'buy' }));
    w.state.t = sgt(17, 0, 1);
    const { mrLimDecides } = await import('../src/sim/mr-lim.ts');
    await mrLimDecides(w, null, 0);
    expect(place).toMatchObject({ owned: true, notice: null });
    // Nothing to agree to now.
    w.state.t = sgt(10, 0, 2);
    refused(act(w, kow.id, { verb: 'agree_to_rent' }), /./);
  });
});

describe('review fixes (rent changes)', () => {
  it('his head is held to at most double, or half, a rent in one go (a slip of the unit can\'t empty the town)', async () => {
    const w = monday();
    const kow = who(w, 'Ah Kow');
    const raju = who(w, 'Raju');
    await mrLimReviews(w, head({ 'Ah Kow': 5000, Raju: 1 }), 0);
    expect(w.state.property[kow.homeId]!.notice!.rent).toBe(HOUSE_RENT * 2);
    expect(w.state.property[raju.homeId]!.notice!.rent).toBe(HOUSE_RENT / 2);
  });

  it('the town down over the Monday: a new rent never agreed is settled before that week is charged', async () => {
    const w = monday();
    const kow = who(w, 'Ah Kow');
    kow.money = 1000;
    await mrLimReviews(w, head({ 'Ah Kow': 80 }), 0);
    // Wakes on the Tuesday before nine: the Monday round is caught up.
    w.state.t = sgt(8, 0, 8);
    householdsMinute(w);
    expect(kow.homeId).toBe(ROUGH);
    expect(kow.money).toBe(1000);
    expect(w.state.arrears[kow.id] ?? 0).toBe(0);
  });

  it('a quiet spell that swallows the notice week gives the tenant their week back', async () => {
    const { skipQuietly } = await import('../src/sim/skip.ts');
    const w = monday();
    const kow = who(w, 'Ah Kow');
    await mrLimReviews(w, head({ 'Ah Kow': 80 }), 0);
    const from = w.state.property[kow.homeId]!.notice!.from;
    skipQuietly(w, sgt(8, 0, 7));
    expect(w.state.property[kow.homeId]!.notice!.from).toBe(from + 7);
    // A short pause inside the week doesn't.
    const w2 = monday();
    await mrLimReviews(w2, head({ 'Ah Kow': 80 }), 0);
    skipQuietly(w2, w2.t + 30);
    expect(w2.state.property[who(w2, 'Ah Kow').homeId]!.notice!.from).toBe(from);
  });

  it('before rent has started, he leaves rents be', async () => {
    const w = monday();
    w.state.rentFrom = dayIndex(w.t) + 28;
    const h = head({ 'Ah Kow': 80 });
    await mrLimReviews(w, h, 0);
    expect(h.briefs).toHaveLength(0);
  });

  it('everyone at home hears of it; his words go only to those whose rent goes up', async () => {
    const w = monday();
    // A tenant with family at home.
    const [, home] = Object.entries(w.state.property).find(([id, p]) => id.startsWith('house-') && p.holder && w.state.residents.filter((r) => r.homeId === id).length > 1)!;
    const kow = w.resident(home.holder!);
    const raju = w.state.residents.find((r) => r.homeId !== kow.homeId && w.state.property[r.homeId]?.holder === r.id)!;
    const others = w.state.residents.filter((r) => r.homeId === kow.homeId && r.id !== kow.id);
    await mrLimReviews(w, head({ [kow.name]: 80, [raju.name]: 30 }), 0);
    for (const o of others) {
      expectInWorld(o.recent.at(-1)!.text);
      expect(o.recent.at(-1)!.text).toContain(kow.name);
      expect(seen(w, o.name)).toMatch(/80¢ a week/);
    }
    expect(kow.recent.at(-1)!.text).toMatch(/Times are hard/);
    expect(raju.recent.at(-1)!.text).not.toMatch(/Times are hard/);
  });
});

describe('the upgrade (save v27)', () => {
  it('no notices given yet, no review yet', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 26)!;
    const world = { t: 1000 * 1440, property: { 'house-1': { holder: 'a' }, 'house-4': { holder: null } } };
    const up = step.save!({ world, brains: {} }).world as Record<string, unknown>;
    expect(up.rentReviewDay).toBe(-1);
    expect(up.property).toEqual({ 'house-1': { holder: 'a', notice: null }, 'house-4': { holder: null, notice: null } });
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});

describe('his head on the model looks over the rents', () => {
  it('in his own terms, with the review tool', async () => {
    const { CostLog } = await import('../src/mind/cost-log.ts');
    const { ModelMrLimHead, REVIEW_TOOL } = await import('../src/mind/mrlim-head.ts');
    const asked: { user: string; tools: { name: string }[] }[] = [];
    const client = { think: async (req: { user: string; tools: { name: string }[] }) => { asked.push(req); return { model: 'm', text: '', toolCall: { name: 'review', input: { changes: [] } }, usage: { input_tokens: 50, output_tokens: 5 }, attempts: [{ model: 'm', usage: { input_tokens: 50, output_tokens: 5 } }], refused: false }; } };
    const head = new ModelMrLimHead({ client, costs: new CostLog(null) });
    const got = await head.review({ free: 2, offers: 1, lets: [{ n: 1, place: 'a house', name: 'Ah Kow', rent: 50, owing: 20 }] }, { t: 0, realMs: 0 });
    expect(got).toEqual({ changes: [] });
    expect(asked[0]!.tools[0]!.name).toBe(REVIEW_TOOL.name);
    expect(asked[0]!.user).toMatch(/1\. Ah Kow pays 50¢ a week for a house, and owes 20¢/);
    for (const line of asked[0]!.user.split('\n')) expectInWorld(line);
  });
});
