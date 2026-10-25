import { describe, expect, it } from 'vitest';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { feedLine } from '../src/feed/feed.ts';
import { ACTIONS } from '../src/sim/actions/index.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { weekdayAt } from '../src/sim/calendar.ts';
import { MAP_W, PLACE_BY_ID } from '../src/sim/map.ts';
import { skipQuietly } from '../src/sim/skip.ts';
import { FUND_ID, VILLAGE_HEAD, VILLAGE_HEAD_ID } from '../src/village/village.ts';
import { HOUSE_RENT, STALL_DEPOSIT, STALL_RENT, leaseOf, mondayAfter, rentRound } from '../src/village/lets.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';
import type { World } from '../src/sim/state.ts';

const DOOR = 'village-head-house';
const atDoor = (w: World, name: string) => put(w, name, DOOR);
const purses = (w: World) => w.state.residents.reduce((s, r) => s + r.money, 0);

describe("the village head's house", () => {
  it('stands at the top of the kampung, on a widened map, and everyone knows it and him', () => {
    expect(MAP_W).toBe(44);
    const house = PLACE_BY_ID.get(DOOR)!;
    expect(house.name).toBe("the village head's house");
    const w = newWorld(9, 0, 1, true, false);
    for (const r of w.state.residents) {
      expect(r.knownPlaces, r.name).toContain(DOOR);
      expect(w.knowsPerson(r, VILLAGE_HEAD_ID), r.name).toBe(true);
    }
    accepted(act(w, put(w, 'Siti', 'well').id, { verb: 'walk_to', where: 'Mr Lim' }));
  });

  it('at his door, in the day, he answers; at night the house is dark', () => {
    const w = newWorld(9);
    const siti = atDoor(w, 'Siti');
    const text = describePerception(perceive(w, siti));
    expect(text).toMatch(/Mr Lim/);
    expectInWorld(text);
    accepted(act(w, siti.id, { verb: 'knock', text: 'Good morning, Mr Lim.' }));
    expect(siti.recent.at(-1)!.text).toMatch(/^Mr Lim/);
    const late = newWorld(21);
    const s2 = atDoor(late, 'Siti');
    expect(describePerception(perceive(late, s2))).toMatch(/dark|out/);
    refused(act(late, s2.id, { verb: 'knock', text: 'Hello?' }), /Nobody answers|dark/);
  });
});

describe('letting a house', () => {
  it('anyone who can pay rents an empty house at his door: a week in hand, paid into the village fund', () => {
    const w = newWorld(9);
    const siti = atDoor(w, 'Siti');
    const before = siti.money;
    accepted(act(w, siti.id, { verb: 'rent_place', where: 'attap house 4' }));
    expect(siti.homeId).toBe('house-4');
    expect(siti.money).toBe(before - HOUSE_RENT);
    expect(w.state.fund).toEqual({ cents: HOUSE_RENT, depositsHeld: 0 });
    expect(w.takeLedger().at(-1)).toMatchObject({ from: siti.id, to: FUND_ID, cents: HOUSE_RENT });
    const lease = leaseOf(w, 'house-4')!;
    expect(lease.tenantId).toBe(siti.id);
    expect(lease.paidUntil).toBe(mondayAfter(w, dayIndex(w.t) + 4));
    expect(w.placeName(w.home(siti)!)).toBe("Siti's house");
  });

  it('refuses in plain words', () => {
    const w = newWorld(9);
    const siti = atDoor(w, 'Siti');
    refused(act(w, siti.id, { verb: 'rent_place', where: 'attap house 2' }), /isn't to let/);
    siti.money = 80;
    refused(act(w, siti.id, { verb: 'rent_place', where: 'attap house 4' }), /\$1\.50/);
    refused(act(w, put(w, 'Raju', 'well').id, { verb: 'rent_place', where: 'attap house 4' }), /his door|house/);
  });
});

describe('the Monday rent round', () => {
  function rented() {
    const w = newWorld(9);
    const siti = atDoor(w, 'Siti');
    accepted(act(w, siti.id, { verb: 'rent_place', where: 'attap house 4' }));
    const lease = leaseOf(w, 'house-4')!;
    return { w, siti, lease };
  }

  it('goes by the kampung week: on Monday morning he calls, and a tenant at home pays', () => {
    const { w, siti, lease } = rented();
    const monday = lease.paidUntil;
    w.state.t = monday * 1440 - 8 * 60 + 6 * 60 + 15; // Monday 06:15
    expect(weekdayAt(w.state, w.t)).toBe('Monday');
    put(w, 'Siti', 'house-4');
    const m = siti.money;
    rentRound(w, [lease]);
    expect(siti.money).toBe(m - HOUSE_RENT);
    expect(lease.paidUntil).toBe(monday + 7);
    expect(siti.recent.at(-1)!.text).toMatch(/Mr Lim came by for the rent/);
  });

  it('a missed week is owed; missed again by next Monday, he takes the house back (never a family home)', () => {
    const { w, siti, lease } = rented();
    w.state.t = lease.paidUntil * 1440 - 8 * 60 + 6 * 60 + 15;
    put(w, 'Siti', 'jetty'); // out
    rentRound(w, [lease]);
    expect(lease.owed).toBe(HOUSE_RENT);
    expect(siti.recent.at(-1)!.text).toMatch(/found you out/);
    expect(describePerception(perceive(w, siti))).toMatch(/You owe Mr Lim \$1\.50/);
    w.state.t += 7 * 1440;
    rentRound(w, [lease]);
    expect(leaseOf(w, 'house-4')).toBeNull();
    expect(siti.homeId).toBe(w.state.houses.find((h) => h.holderId === siti.id)?.id ?? null);
    expect(w.state.houses.find((h) => h.id === 'house-4')!.holderId).toBeNull();
  });

  it('can be paid at his door during the grace week, or ahead, up to four weeks', () => {
    const { w, siti, lease } = rented();
    w.state.t = lease.paidUntil * 1440 - 8 * 60 + 6 * 60 + 15;
    put(w, 'Siti', 'jetty');
    rentRound(w, [lease]);
    w.state.t += 3 * 60;
    atDoor(w, 'Siti');
    accepted(act(w, siti.id, { verb: 'pay_rent' }));
    expect(lease.owed).toBe(0);
    accepted(act(w, siti.id, { verb: 'pay_rent', qty: 3 }));
    refused(act(w, siti.id, { verb: 'pay_rent', qty: 2 }), /already paid/);
  });

  it('happens as he walks the kampung: he comes out on Monday morning and goes back in', () => {
    const { w, lease } = rented();
    w.state.t = lease.paidUntil * 1440 - 8 * 60 + 6 * 60 + 14;
    put(w, 'Siti', 'house-4');
    const body = w.state.villagers[VILLAGE_HEAD_ID]!;
    expect(body.indoors).toBe(true);
    advance(w);
    expect(body.indoors).toBe(false);
    for (let i = 0; i < 120 && lease.paidUntil * 1440 - 8 * 60 < w.t; i++) advance(w);
    expect(lease.paidUntil * 1440 - 8 * 60).toBeGreaterThan(w.t); // paid on the round
    for (let i = 0; i < 180; i++) advance(w);
    expect(body.indoors).toBe(true);
  });

  it('a round missed while the town was stopped is no rent owed', () => {
    const { w, lease } = rented();
    w.state.t = lease.paidUntil * 1440 - 8 * 60 + 6 * 60;
    skipQuietly(w, w.t + 3 * 60);
    expect(lease.owed).toBe(0);
    expect(w.state.villagers[VILLAGE_HEAD_ID]!.indoors).toBe(true);
  });
});

describe('a stall of your own', () => {
  function applied() {
    const w = newWorld(9);
    const raju = atDoor(w, 'Raju');
    raju.money = 5000;
    accepted(act(w, raju.id, { verb: 'rent_place', where: 'the corner stall' }));
    return { w, raju };
  }

  it('is asked for at his door; after three days he chooses the earliest who has no business, and they come to pay', () => {
    const { w, raju } = applied();
    const kow = atDoor(w, 'Ah Kow');
    kow.money = 5000;
    accepted(act(w, kow.id, { verb: 'rent_place', where: 'the corner stall' }));
    refused(act(w, atDoor(w, 'Rahim').id, { verb: 'rent_place', where: 'the corner stall' }), /business/);
    w.state.t += 4 * 1440;
    w.state.t = w.t - (w.t + 480) % 1440 + 9 * 60 - 1;
    advance(w);
    expect(raju.recent.some((o) => /corner stall is yours/.test(o.text))).toBe(true);
    atDoor(w, 'Raju');
    w.state.t += 60;
    accepted(act(w, raju.id, { verb: 'rent_place', where: 'the corner stall' }));
    expect(raju.role).toBe('owner');
    expect(w.shopOf(raju.id)!.id).toBe('stall-2');
    expect(raju.money).toBe(5000 - STALL_DEPOSIT - STALL_RENT);
    expect(w.state.fund).toEqual({ cents: STALL_DEPOSIT + STALL_RENT, depositsHeld: STALL_DEPOSIT });
    put(w, 'Raju', 'stall-2');
    raju.items = { fish: 3 };
    accepted(act(w, raju.id, { verb: 'set_price', item: 'fish', price: 35 }));
  });

  it('handed back, the deposit comes back from the fund', () => {
    const { w, raju } = applied();
    w.state.t += 4 * 1440;
    w.state.t = w.t - (w.t + 480) % 1440 + 9 * 60 - 1;
    advance(w);
    atDoor(w, 'Raju');
    w.state.t += 60;
    accepted(act(w, raju.id, { verb: 'rent_place', where: 'the corner stall' }));
    const m = raju.money;
    accepted(act(w, raju.id, { verb: 'hand_back', where: 'the corner stall' }));
    expect(raju.money).toBe(m + STALL_DEPOSIT);
    expect(raju.role).toBe('seeker');
    expect(w.state.fund.depositsHeld).toBe(0);
  });
});

describe('money stays countable', () => {
  it('purses plus the fund change only through the lorry and the village head\'s own purse; nothing is ever paid into his purse', () => {
    const w = newWorld(9);
    const total = () => purses(w) + w.state.fund.cents;
    const before = total();
    const siti = atDoor(w, 'Siti');
    accepted(act(w, siti.id, { verb: 'rent_place', where: 'attap house 4' }));
    accepted(act(w, siti.id, { verb: 'pay_rent', qty: 2 }));
    const ledger = w.takeLedger();
    expect(total()).toBe(before);
    expect(ledger.some((l) => l.to === VILLAGE_HEAD_ID)).toBe(false);
    expect(() => w.transfer(siti.id, VILLAGE_HEAD_ID, 10, 'a gift')).toThrow();
    expect(() => w.transfer(FUND_ID, siti.id, 1_000_000, 'too much')).toThrow();
  });
});

describe('his notices', () => {
  it('at 10:00 he walks to the board and pins what he has to let, in plain words and no rules', () => {
    const w = newWorld(9, 58);
    for (let i = 0; i < 60; i++) advance(w);
    const notices = w.state.villageNotices;
    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0]!.text).toMatch(/To let/);
    expect(notices[0]!.text).toMatch(/Lim, village head/);
    expectInWorld(notices[0]!.text);
    const siti = put(w, 'Siti', 'notice-board');
    const res = accepted(act(w, siti.id, { verb: 'read_notice_board' }));
    expect(res.reply).toMatch(/To let/);
    expect(siti.knownPlaces).toContain('stall-2');
  });

  it('every new action and line reads in plain words', () => {
    for (const v of ['knock', 'rent_place', 'pay_rent', 'hand_back']) {
      expect(ACTIONS[v], v).toBeDefined();
      expectInWorld(ACTIONS[v]!.says);
    }
    expect(VILLAGE_HEAD.name).toBe('Mr Lim');
  });

  it('the feed tells of lettings and rent, highlighted where it matters', () => {
    const w = newWorld(9);
    accepted(act(w, atDoor(w, 'Siti').id, { verb: 'rent_place', where: 'attap house 4' }));
    const line = feedLine(w.takeEvents().find((e) => e.type === 'let')!, (id) => w.nameOf(id))!;
    expect(line.text).toBe('Siti rents attap house 4 from the village head.');
    expect(line.notable).toBe(true);
  });
});

describe('meeting him about the kampung', () => {
  it('out on his round he is seen nearby, can be walked to and spoken to, and answers in a few set words', () => {
    const w = newWorld(9);
    const body = w.state.villagers[VILLAGE_HEAD_ID]!;
    const siti = put(w, 'Siti', 'well');
    expect(perceive(w, siti).people.some((p) => p.name === 'Mr Lim')).toBe(false);
    refused(act(w, siti.id, { verb: 'say', to: 'Mr Lim', text: 'Good morning!' }), /isn't nearby/);
    body.indoors = false;
    body.pos = { ...siti.pos };
    const seen = perceive(w, siti).people.find((p) => p.name === 'Mr Lim');
    expect(seen).toBeDefined();
    expectInWorld(seen!.doing);
    accepted(act(w, siti.id, { verb: 'say', to: 'Mr Lim', text: 'Good morning!' }));
    expect(siti.recent.at(-1)!.text).toMatch(/^Mr Lim nods/);
    // In sight, walking to him goes to him; out of sight, to his door.
    body.pos = { x: siti.pos.x + 5, y: siti.pos.y };
    accepted(act(w, siti.id, { verb: 'walk_to', where: 'Mr Lim' }));
    expect(siti.activity).toMatchObject({ dest: null });
    siti.activity = null;
    body.pos = { x: 0, y: 29 };
    accepted(act(w, siti.id, { verb: 'walk_to', where: 'the village head' }));
    expect(siti.activity).toMatchObject({ dest: DOOR });
    siti.activity = null;
    const said = w.takeEvents().find((e) => e.type === 'said')!;
    expect(feedLine(said, (id) => w.nameOf(id))!.text).toMatch(/Mr Lim/);
  });

  it('at his door, his lodgers see what they owe and when the rent is paid to', () => {
    const w = newWorld(9);
    const siti = atDoor(w, 'Siti');
    expect(describePerception(perceive(w, siti))).toMatch(/Mr Lim is in/);
    accepted(act(w, siti.id, { verb: 'rent_place', where: 'attap house 4' }));
    const text = describePerception(perceive(w, siti));
    expect(text).toMatch(/Your rent for Siti's house is paid up to Monday \d+ January/);
    expectInWorld(text);
  });
});

describe('v5 → v6: the living town gets its village head', () => {
  it('everyone knows his house; he is home, the fund is empty, nothing is let, both stalls are open to ask for; nobody moves or loses a cent', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadSql, fixtureSql, peek } = await import('./saves.ts');
    const { SqliteStore } = await import('../src/store/sqlite-store.ts');
    const { Town } = await import('../src/town.ts');
    const dir = mkdtempSync(join(tmpdir(), 'kampung-vh-'));
    try {
      const path = join(dir, 'kampung.db');
      loadSql(fixtureSql(5), path);
      const v5 = JSON.parse(peek<{ world: string }>(path, 'SELECT world FROM snapshot').world);
      const store = new SqliteStore(path);
      const town = Town.resume({ store })!;
      const w = town.world;
      for (const r of w.state.residents) {
        const old = v5.residents.find((x: { id: string }) => x.id === r.id);
        expect(r.money, r.name).toBe(old.money);
        expect(r.pos, r.name).toEqual(old.pos);
        expect(r.homeId, r.name).toBe(old.homeId);
        expect(r.knownPlaces, r.name).toContain(DOOR);
      }
      expect(w.state.villagers[VILLAGE_HEAD_ID]).toEqual({ pos: PLACE_BY_ID.get(DOOR)!.spot, indoors: true, duty: null, path: [] });
      expect(w.state.fund).toEqual({ cents: 0, depositsHeld: 0 });
      expect(w.state.leases).toEqual([]);
      expect(w.state.stallCalls.map((c) => c.placeId)).toEqual(['stall-1', 'stall-2']);
      expect(w.state.stallCalls.every((c) => c.opened === dayIndex(v5.t))).toBe(true);
      expect(w.state.news).toEqual([]);
      await town.runUntil(town.t + 30);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('changes nothing when run twice', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const { loadSql, fixtureSql, peek } = await import('./saves.ts');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const step = UPGRADES.find((u) => u.from === 5)!;
    const dir = mkdtempSync(join(tmpdir(), 'kampung-step-'));
    try {
      const path = join(dir, 'k.db');
      loadSql(fixtureSql(5), path);
      const row = peek<{ world: string; brains: string }>(path, 'SELECT world, brains FROM snapshot');
      const once = step.save!({ world: JSON.parse(row.world), brains: JSON.parse(row.brains) });
      expect(step.save!(structuredClone(once))).toEqual(once);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a new stall-holder', () => {
  it('is told in their own thoughts that they now run it', async () => {
    const { Mind } = await import('../src/mind/mind.ts');
    const { MemoryStore } = await import('../src/mind/memory.ts');
    const { FakeModel } = await import('../src/mind/fake-model.ts');
    const { CostLog } = await import('../src/mind/cost-log.ts');
    const { CARDS } = await import('../src/seed/cards.ts');
    const { takeStall } = await import('../src/village/lets.ts');
    const w = newWorld(9);
    const raju = who(w, 'Raju');
    const mind = new Mind({ client: new FakeModel(1), memory: new MemoryStore(':memory:'), costs: new CostLog(null), cards: CARDS });
    mind.keepSent = true;
    const brain = mind.brainFor(raju.id, raju.name, 'seeker', null, w.t);
    const ctx = { t: w.t, realMs: 0, residentId: raju.id, emit: () => {} };
    await brain.decide(perceive(w, raju), ctx);
    expect(mind.sent.at(-1)!.system).toMatch(/don't have work/);
    raju.money = 5000;
    takeStall(w, raju, 'stall-2');
    await brain.decide(perceive(w, raju), { ...ctx, t: w.t + 1 });
    expect(mind.sent.at(-1)!.system).toMatch(/You own the corner stall/);
  });
});

describe('on the watch page', () => {
  it('each frame says where he is, whether he is out, and what he is about', async () => {
    const { FrameBuilder } = await import('../src/watch/view.ts');
    const w = newWorld(9);
    const fb = new FrameBuilder();
    expect(fb.build(w).villagers).toEqual([expect.objectContaining({ id: VILLAGE_HEAD_ID, name: 'Mr Lim', out: false })]);
    const body = w.state.villagers[VILLAGE_HEAD_ID]!;
    body.indoors = false;
    body.duty = { kind: 'notice', stops: [{ ...PLACE_BY_ID.get('notice-board')!.spot }], day: dayIndex(w.t) };
    body.path = [{ x: 40, y: 4 }, { x: 39, y: 4 }];
    fb.build(w);
    advance(w);
    const v = fb.build(w).villagers![0]!;
    expect(v.out).toBe(true);
    expect(v.doing).toMatch(/notice board/);
    expect(v.route.at(-1)).toEqual({ x: v.x, y: v.y });
    expect(v.route.length).toBeGreaterThan(1);
  });
});

describe('review fixes', () => {
  function rentedHouse() {
    const w = newWorld(9);
    const siti = atDoor(w, 'Siti');
    accepted(act(w, siti.id, { verb: 'rent_place', where: 'attap house 4' }));
    return { w, siti, lease: leaseOf(w, 'house-4')! };
  }
  const roundAt = (w: World, day: number) => { w.state.t = day * 1440 - 8 * 60 + 6 * 60 + 15; };

  it('someone who gave up a stall can still pay the wages they owe, and is reminded', () => {
    const w = newWorld(9);
    const siti = atDoor(w, 'Siti');
    siti.money = 5000;
    w.state.stallCalls.find((c) => c.placeId === 'stall-1')!.offeredTo = siti.id;
    w.state.stallCalls.find((c) => c.placeId === 'stall-1')!.offerUntil = dayIndex(w.t) + 2;
    accepted(act(w, siti.id, { verb: 'rent_place', where: 'the stall under the tree' }));
    w.state.owed.push({ employerId: siti.id, workerId: who(w, 'Raju').id, cents: 200 });
    accepted(act(w, siti.id, { verb: 'hand_back', where: 'the stall under the tree' }));
    expect(describePerception(perceive(w, siti))).toMatch(/You owe wages: Raju \$2\.00/);
    put(w, 'Raju', DOOR);
    expect(perceive(w, siti).actions.some((a) => a.verb === 'pay wages')).toBe(true);
    accepted(act(w, siti.id, { verb: 'pay_wages', to: 'Raju' }));
  });

  it('a grace week lost to downtime never leads to the place being taken back', () => {
    const { w, siti, lease } = rentedHouse();
    const first = lease.paidUntil;
    roundAt(w, first);
    put(w, 'Siti', 'jetty');
    rentRound(w, [lease]);
    expect(lease.owed).toBe(HOUSE_RENT);
    // The town is stopped from that morning until just before the next round.
    skipQuietly(w, (first + 7) * 1440 - 8 * 60 + 5 * 60);
    roundAt(w, first + 7);
    put(w, 'Siti', 'jetty');
    rentRound(w, [lease]);
    expect(leaseOf(w, 'house-4')).not.toBeNull();
    expect(lease.owed).toBe(2 * HOUSE_RENT);
    expect(siti.homeId).toBe('house-4');
    // A week missed again, with door hours to pay in, is the end of it.
    roundAt(w, first + 14);
    rentRound(w, [lease]);
    expect(leaseOf(w, 'house-4')).toBeNull();
  });

  it('paying after a stopped spell starts from today, so nobody pays for weeks gone by', () => {
    const { w, siti, lease } = rentedHouse();
    skipQuietly(w, (lease.paidUntil + 14) * 1440 - 8 * 60 + 9 * 60);
    atDoor(w, 'Siti');
    accepted(act(w, siti.id, { verb: 'pay_rent' }));
    expect(lease.paidUntil).toBeGreaterThan(dayIndex(w.t));
    expect(lease.paidUntil - dayIndex(w.t)).toBeLessThanOrEqual(7);
  });

  it('a home offered in a house that goes back to Mr Lim can no longer be taken up', () => {
    const { w, siti } = rentedHouse();
    put(w, 'Siti', 'house-4');
    put(w, 'Raju', 'house-4');
    accepted(act(w, siti.id, { verb: 'take_in', to: 'Raju' }));
    atDoor(w, 'Siti');
    accepted(act(w, siti.id, { verb: 'hand_back', where: "Siti's house" }));
    refused(act(w, who(w, 'Raju').id, { verb: 'move_in', from: 'Siti' }), /hasn't offered/);
  });

  it("rent can't be paid more than four weeks ahead, even with a week owed", () => {
    const { w, siti, lease } = rentedHouse();
    roundAt(w, lease.paidUntil);
    put(w, 'Siti', 'jetty');
    rentRound(w, [lease]);
    w.state.t += 3 * 60;
    atDoor(w, 'Siti');
    siti.money = 100_000;
    refused(act(w, siti.id, { verb: 'pay_rent', qty: 30 }), /won't take more ahead/);
  });

  it('someone who rents a second house can take people into the one they live in', () => {
    const w = newWorld(9);
    const huat = atDoor(w, 'Ah Huat');
    accepted(act(w, huat.id, { verb: 'rent_place', where: 'attap house 4' }));
    put(w, 'Ah Huat', 'house-4');
    put(w, 'Raju', 'house-4');
    accepted(act(w, huat.id, { verb: 'take_in', to: 'Raju' }));
    accepted(act(w, who(w, 'Raju').id, { verb: 'move_in', from: 'Ah Huat' }));
    accepted(act(w, huat.id, { verb: 'tell_to_leave', to: 'Raju' }));
  });

  it('taking one stall withdraws the other offer, so it passes on', () => {
    const w = newWorld(9);
    const raju = atDoor(w, 'Raju');
    raju.money = 5000;
    for (const c of w.state.stallCalls) { c.applicants = [raju.id, who(w, 'Siti').id]; c.offeredTo = raju.id; c.offerUntil = dayIndex(w.t) + 2; }
    accepted(act(w, raju.id, { verb: 'rent_place', where: 'the corner stall' }));
    const other = w.state.stallCalls.find((c) => c.placeId === 'stall-1')!;
    expect(other.offeredTo).toBeNull();
    expect(other.applicants).not.toContain(raju.id);
  });

  it("his door's actions are only offered while he's answering", () => {
    const w = newWorld(20);
    const siti = atDoor(w, 'Siti');
    expect(perceive(w, siti).actions.some((a) => ['knock', 'rent place'].includes(a.verb))).toBe(false);
  });
});
