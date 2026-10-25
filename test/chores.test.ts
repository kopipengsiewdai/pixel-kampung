import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { FakeBrain } from '../src/brain/fake-brain.ts';
import { importanceOf } from '../src/mind/memory.ts';
import { catchFish } from '../src/sim/activities.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive, type Perception } from '../src/sim/perception.ts';
import { talkKey, type World } from '../src/sim/state.ts';
import { formatMoney } from '../src/sim/money.ts';
import { skipQuietly } from '../src/sim/skip.ts';
import { advance } from '../src/sim/tick.ts';
import { TRAVELLER_PAYS } from '../src/sim/travellers.ts';
import { dayIndex } from '../src/sim/time.ts';
import { settledBy } from '../src/sim/talk.ts';
import { AFTER_ACTION_MINUTES, QUIET_THINK_MINUTES, Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const offered = (p: Perception, verb: string) => p.actions.some((a) => a.verb === verb);
const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) advance(w); };

describe('looking around', () => {
  it("isn't offered any more, and a typed one doesn't bring the next thought on", async () => {
    const w = newWorld(9);
    expect(offered(perceive(w, put(w, 'Siti', 'well')), 'look around')).toBe(false);
    const brain: Brain = { decide: () => ({ verb: 'look_around' }), save: () => null, load: () => {} };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(9, 0) - 1;
    const town = Town.create(1, start, { brains: (r) => (r.name === 'Siti' ? brain : idle) });
    for (const r of town.world.state.residents) r.thinkAt = start + 100;
    who(town.world, 'Siti').thinkAt = start + 1;
    await town.runUntil(start + 1);
    expect(who(town.world, 'Siti').thinkAt).toBe(start + 1 + QUIET_THINK_MINUTES);
    expect(QUIET_THINK_MINUTES).toBeGreaterThan(AFTER_ACTION_MINUTES);
  });
});

describe('chores', () => {
  it('fetching water at the well takes 10 minutes and gives a pail, which is no good to drink as it is', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    expect(offered(perceive(w, siti), 'fetch water')).toBe(true);
    accepted(act(w, siti.id, { verb: 'fetch_water' }));
    expect(siti.activity).toMatchObject({ kind: 'chore', chore: 'fetch_water', until: w.t + 10 });
    refused(act(w, siti.id, { verb: 'say', text: 'hi' }), /fetching water/);
    run(w, 10);
    expect(siti.activity).toBeNull();
    expect(siti.items.water).toBe(1);
    refused(act(w, siti.id, { verb: 'eat', item: 'water' }), /boil it first/);
    refused(act(w, put(w, 'Raju', 'jetty').id, { verb: 'fetch_water' }), /well/);
  });

  it('mending nets at the jetty takes 30 minutes; the next 3 catches today bring one more fish', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'jetty');
    accepted(act(w, rahim.id, { verb: 'mend_nets' }));
    run(w, 30);
    expect(rahim.mended).toEqual({ day: dayIndex(w.t), left: 3 });
    const caught: number[] = [];
    for (let i = 0; i < 4; i++) {
      rahim.items = {};
      catchFish(w, rahim);
      caught.push(rahim.items.fish ?? 0);
    }
    expect(rahim.mended).toEqual({ day: dayIndex(w.t), left: 0 });
    expect(caught.slice(0, 3).every((n) => n >= 1)).toBe(true);
  });

  it('sweeping the shop takes 15 minutes, and travellers wait 12 minutes there today, not 8', () => {
    const w = newWorld(9);
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    accepted(act(w, tan.id, { verb: 'sweep' }));
    run(w, 15);
    expect(w.shop('provision-shop')!.sweptDay).toBe(dayIndex(w.t));
    refused(act(w, put(w, 'Siti', 'provision-shop').id, { verb: 'sweep' }), /not your shop|isn't yours/);
  });

  it('a worker on shift can sweep, and the shift carries on, the minutes counted', () => {
    const w = newWorld(9);
    const huat = who(w, 'Ah Huat');
    const siti = put(w, 'Siti', 'kopitiam');
    w.state.jobs.push({ id: 99, employerId: huat.id, workerId: siti.id, placeId: 'kopitiam', wage: 600, startHour: 9, hours: 1, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 99, until: w.t + 60, worked: 0 };
    accepted(act(w, siti.id, { verb: 'sweep' }));
    run(w, 15);
    expect(siti.activity).toMatchObject({ kind: 'working', worked: 15 });
    expect(w.shop('kopitiam')!.sweptDay).toBe(dayIndex(w.t));
  });

  it("sweeping past the shift's end doesn't count the extra minutes as worked", () => {
    const w = newWorld(9, 50);
    const huat = who(w, 'Ah Huat');
    const siti = put(w, 'Siti', 'kopitiam');
    w.state.jobs.push({ id: 99, employerId: huat.id, workerId: siti.id, placeId: 'kopitiam', wage: 600, startHour: 9, hours: 1, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 99, until: w.t + 10, worked: 50 };
    accepted(act(w, siti.id, { verb: 'sweep' }));
    run(w, 20);
    expect(siti.activity).toBeNull();
    expect(w.state.owed.find((o) => o.workerId === siti.id)?.cents).toBe(600);
  });

  it('a chore under way when the town rests overnight is cut short; a short pause finishes it', () => {
    const w = newWorld(22, 50);
    const siti = put(w, 'Siti', 'well');
    accepted(act(w, siti.id, { verb: 'fetch_water' }));
    skipQuietly(w, w.t + 8 * 60);
    expect(siti.items.water ?? 0).toBe(0);
    const w2 = newWorld(10, 0);
    const raju = put(w2, 'Raju', 'well');
    accepted(act(w2, raju.id, { verb: 'fetch_water' }));
    skipQuietly(w2, w2.t + 20);
    expect(raju.items.water).toBe(1);
  });

  it('being spoken to mid-chore is heard, and answered once it is done', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    put(w, 'Raju', 'well');
    accepted(act(w, siti.id, { verb: 'fetch_water' }));
    accepted(act(w, who(w, 'Raju').id, { verb: 'say', to: 'Siti', text: 'Pagi!' }));
    expect(siti.recent.at(-1)!.text).toContain('Pagi!');
    run(w, 10);
    expect(siti.thinkAt).toBeLessThanOrEqual(w.t);
  });
});

describe('the kopitiam needs water', () => {
  it('a batch of kopi or fish porridge takes a pail; vegetable rice does not', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const shop = w.shop('kopitiam')!;
    shop.stock = { coffee: 2, fish: 1, rice: 2, vegetables: 1 };
    refused(act(w, huat.id, { verb: 'cook', item: 'kopi' }), /short of water/);
    accepted(act(w, huat.id, { verb: 'cook', item: 'vegetable rice' }));
    run(w, 10);
    shop.stock.water = 1;
    accepted(act(w, huat.id, { verb: 'cook', item: 'kopi' }));
    expect(shop.stock.water ?? 0).toBe(0);
  });
});

describe('paid errands', () => {
  it('fetching water: asked, agreed, and paid when the pail is handed over', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'well');
    const siti = put(w, 'Siti', 'well');
    huat.money = 500;
    const events: GameEvent[] = [];
    accepted(act(w, huat.id, { verb: 'ask_errand', to: 'Siti', text: 'fetch water', money: '10¢' }));
    expect(siti.recent.at(-1)!.text).toBe('Ah Huat asks you to fetch water, for 10¢.');
    accepted(act(w, siti.id, { verb: 'agree', from: 'Ah Huat' }));
    expect(seen(w, 'Siti')).toContain("You're fetching water for Ah Huat, for 10¢.");
    accepted(act(w, siti.id, { verb: 'fetch_water' }));
    run(w, 10);
    events.push(...w.takeEvents());
    const before = siti.money;
    accepted(act(w, siti.id, { verb: 'give', to: 'Ah Huat', item: 'water' }));
    events.push(...w.takeEvents());
    expect(siti.money).toBe(before + 10);
    expect(siti.recent.some((o) => o.text === 'Ah Huat pays you 10¢ for the errand.')).toBe(true);
    expect(events.map((e) => e.type)).toContain('errand_done');
    expect(w.state.errands).toEqual([]);
  });

  it("taking something to someone: handed over on agreeing; the pay goes when it's delivered", () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'well');
    const raju = put(w, 'Raju', 'well');
    rahim.items = { fish: 2 };
    rahim.money = 300;
    accepted(act(w, rahim.id, { verb: 'ask_errand', to: 'Raju', text: 'take fish to Mdm Tan', money: '10¢' }));
    accepted(act(w, raju.id, { verb: 'agree', from: 'Rahim' }));
    expect(rahim.items.fish).toBe(1);
    expect(raju.items.fish).toBe(1);
    put(w, 'Mdm Tan', 'well');
    accepted(act(w, raju.id, { verb: 'give', to: 'Mdm Tan', item: 'fish' }));
    expect(raju.money).toBeGreaterThanOrEqual(10);
    expect(w.state.errands).toEqual([]);
  });

  it("when the asker can't pay, it becomes a debt", () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'well');
    const siti = put(w, 'Siti', 'well');
    huat.money = 0;
    accepted(act(w, huat.id, { verb: 'ask_errand', to: 'Siti', text: 'fetch water', money: '10¢' }));
    accepted(act(w, siti.id, { verb: 'agree', from: 'Ah Huat' }));
    siti.items = { water: 1 };
    accepted(act(w, siti.id, { verb: 'give', to: 'Ah Huat', item: 'water' }));
    expect(w.state.debts).toMatchObject([{ debtor: huat.id, creditor: siti.id, cents: 10, kind: 'iou' }]);
    expect(siti.recent.some((o) => o.text === "Ah Huat couldn't pay, so owes you 10¢.")).toBe(true);
  });

  it('lapses at the end of the day, and settles talk of a deal', () => {
    const ev = (body: Record<string, unknown>) => ({ t: 1, seq: 1, ...body }) as unknown as GameEvent;
    expect(settledBy(ev({ type: 'errand_asked', who: 'a', to: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'errand_taken', who: 'b', from: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'money' });
    expect(settledBy(ev({ type: 'errand_done', who: 'b', for: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'money' });
    const w = newWorld(22, 0);
    const huat = put(w, 'Ah Huat', 'well');
    const siti = put(w, 'Siti', 'well');
    huat.money = 500;
    accepted(act(w, huat.id, { verb: 'ask_errand', to: 'Siti', text: 'fetch water', money: '10¢' }));
    accepted(act(w, siti.id, { verb: 'agree', from: 'Ah Huat' }));
    run(w, 3 * 60);
    expect(w.state.errands).toEqual([]);
    expect(w.state.talk[talkKey(huat.id, siti.id)]).toBeUndefined();
  });

  it('a "take" errand not done by the day\'s end: the thing goes back to the asker, or is owed for', () => {
    const w = newWorld(21, 0);
    const rahim = put(w, 'Rahim', 'well');
    const raju = put(w, 'Raju', 'well');
    rahim.items = { fish: 2 };
    raju.items = {};
    accepted(act(w, rahim.id, { verb: 'ask_errand', to: 'Raju', text: 'take fish to Mdm Tan', money: '10¢' }));
    accepted(act(w, raju.id, { verb: 'agree', from: 'Rahim' }));
    run(w, 4 * 60);
    expect(w.state.errands).toEqual([]);
    expect([rahim.items.fish, raju.items.fish ?? 0]).toEqual([2, 0]);
    expect(raju.recent.some((o) => o.text === 'You give Rahim back the fish.')).toBe(true);
    expect(rahim.recent.some((o) => o.text === 'Raju gives you back the fish.')).toBe(true);
    // Eaten or sold meanwhile: it's owed for, at what it would fetch.
    const w2 = newWorld(21, 0);
    const rahim2 = put(w2, 'Rahim', 'well');
    const raju2 = put(w2, 'Raju', 'well');
    rahim2.items = { fish: 1 };
    accepted(act(w2, rahim2.id, { verb: 'ask_errand', to: 'Raju', text: 'take fish to Mdm Tan', money: '10¢' }));
    accepted(act(w2, raju2.id, { verb: 'agree', from: 'Rahim' }));
    raju2.items = {};
    run(w2, 4 * 60);
    expect(w2.state.debts).toMatchObject([{ debtor: raju2.id, creditor: rahim2.id, kind: 'iou', cents: TRAVELLER_PAYS.fish, what: 'for the fish' }]);
    expect(raju2.recent.some((o) => o.text === `You no longer have Rahim's fish, so you owe Rahim ${formatMoney(TRAVELLER_PAYS.fish!)}.`)).toBe(true);
  });

  it('a "take" errand handed back to the asker ends it, unpaid', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'well');
    const raju = put(w, 'Raju', 'well');
    rahim.items = { fish: 1 };
    rahim.money = 500;
    accepted(act(w, rahim.id, { verb: 'ask_errand', to: 'Raju', text: 'take fish to Mdm Tan', money: '10¢' }));
    accepted(act(w, raju.id, { verb: 'agree', from: 'Rahim' }));
    const money = raju.money;
    accepted(act(w, raju.id, { verb: 'give', to: 'Rahim', item: 'fish' }));
    expect(w.state.errands).toEqual([]);
    expect(raju.money).toBe(money);
    expect(rahim.recent.some((o) => o.text === "Raju hands back the fish: the errand's off.")).toBe(true);
  });

  it('with a loan and an errand both waiting, words choose: the loan, or the errand; otherwise they are asked', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'well');
    const siti = put(w, 'Siti', 'well');
    huat.money = 2000;
    huat.items = { fish: 1 };
    accepted(act(w, huat.id, { verb: 'lend', to: 'Siti', money: '$1' }));
    accepted(act(w, huat.id, { verb: 'ask_errand', to: 'Siti', text: 'take fish to Mdm Tan', money: '10¢' }));
    expect(refused(act(w, siti.id, { verb: 'agree', from: 'Ah Huat' }))).toMatch(/Which do you mean\? Say "the loan" or "the errand"\.$/);
    accepted(act(w, siti.id, { verb: 'agree', from: 'Ah Huat', text: "I'll take the loan" }));
    expect(w.state.debts).toHaveLength(1);
    expect(w.state.errands.every((e) => !e.taken)).toBe(true);
    accepted(act(w, siti.id, { verb: 'agree', from: 'Ah Huat', text: 'I can take the fish to Mdm Tan' }));
    expect(w.state.errands[0]!.taken).toBe(true);
  });

  it('refuses errands nobody could run', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'well');
    put(w, 'Siti', 'well');
    refused(act(w, huat.id, { verb: 'ask_errand', to: 'Siti', text: 'build me a house', money: '10¢' }), /fetch water|take/);
    refused(act(w, huat.id, { verb: 'ask_errand', to: 'Siti', text: 'fetch water' }), /how much/i);
  });
});

describe('helping neighbours', () => {
  it("waters a neighbour's dry beds, unpaid, and both remember it", () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    const fatimah = put(w, 'Fatimah', 'farm');
    const bed = w.state.beds[0]!;
    Object.assign(bed, { planterId: fatimah.id, plantedDay: dayIndex(w.t), wateredDays: 0, lastWateredDay: null });
    expect(offered(perceive(w, siti), 'help')).toBe(true);
    accepted(act(w, siti.id, { verb: 'help', to: 'Fatimah' }));
    expect(bed.lastWateredDay).toBe(dayIndex(w.t));
    expect(fatimah.recent.at(-1)!.text).toBe('Siti waters your beds for you.');
    expect(importanceOf('noticed', 'Siti waters your beds for you.')).toBe(6);
    refused(act(w, siti.id, { verb: 'help', to: 'Fatimah' }), /nothing to help with/);
  });
});

describe('fishing at the dawn tide', () => {
  it('comes up empty less often between 6 and 9 in the morning', () => {
    const empty = (hour: number) => {
      const w = newWorld(hour);
      // A novice: the tides' effect on today's odds.
      const r = put(w, 'Siti', 'jetty');
      let n = 0;
      for (let i = 0; i < 400; i++) {
        r.items = {};
        catchFish(w, r);
        if (!r.items.fish) n++;
      }
      return n / 400;
    };
    expect(empty(7)).toBeLessThan(0.22);
    expect(empty(14)).toBeGreaterThan(0.22);
  });
});

describe('the fake brain does chores when it has nothing else to do', () => {
  it('mends its nets once a day before fishing', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    const verbs = new Set(Array.from({ length: 10 }, (_, i) => new FakeBrain(i + 1).decide(perceive(w, siti))?.verb));
    expect(verbs).toContain('mend_nets');
    siti.mended = { day: dayIndex(w.t), left: 3 };
    for (let i = 0; i < 10; i++) expect(new FakeBrain(i + 1).decide(perceive(w, siti))?.verb).not.toBe('mend_nets');
  });
});

describe('the upgrade: chores, errands, and water for the kopitiam', () => {
  it('nobody has mended nets, no shop is swept, no errands; the kopitiam gets 4 pails', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 10)!;
    const world = { shops: [{ id: 'kopitiam', stock: { kopi: 3 } }, { id: 'market-stall', stock: {} }], residents: [{ id: 'a' }] };
    const up = step.save!({ world, brains: {} }).world as { shops: Record<string, unknown>[]; residents: Record<string, unknown>[]; errands: unknown[] };
    expect(up.shops[0]).toMatchObject({ stock: { kopi: 3, water: 4 }, sweptDay: null });
    expect(up.shops[1]).toMatchObject({ stock: {}, sweptDay: null });
    expect(up.residents[0]).toMatchObject({ mended: null });
    expect(up.errands).toEqual([]);
  });
});

it('every new line reads in-world', () => {
  for (const l of ["You'd want to boil it first.", 'Ah Huat asks you to fetch water, for 10¢.', "You're fetching water for Ah Huat, for 10¢.", 'Ah Huat pays you 10¢ for the errand.', "Ah Huat couldn't pay, so owes you 10¢."]) expectInWorld(l);
});
