import { describe, expect, it } from 'vitest';
import { auditLedger } from '../src/sim/audit.ts';
import { FakeModel } from '../src/mind/fake-model.ts';
import { CostLog } from '../src/mind/cost-log.ts';
import type { ModelClient, ThinkRequest } from '../src/mind/model.ts';
import { ModelOsmanHead } from '../src/mind/osman-head.ts';
import type { LedgerEntry } from '../src/sim/events.ts';
import {
  BRINGS, bounds, creditCap, CREDIT_FLOOR, DEBT_MINUTES, GOODS_SHARE, HAGGLES_PER_VISIT, LOAD, osmanThinks, priceFor, REGULAR_DAYS, room, scheduleFor,
  settleAnswer, SUPPLY, supplyFor, TAKES, UNWORLDLY, type OsmanHead,
} from '../src/sim/osman.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex, minuteOfDay } from '../src/sim/time.ts';
import { weekdayAt } from '../src/sim/calendar.ts';
import { accepted, act, newWorld, put, refused, sgt } from './helpers.ts';

/** A Monday morning, run on until Pak Osman's lorry is in. */
function lorryMorning(seed = 1, dayOffset = 0): World {
  const w = newWorld(6, 0, seed);
  if (dayOffset) w.state.t = sgt(6, 0, dayOffset);
  while (!w.state.osman.visit && minuteOfDay(w.t) < 8 * 60) advance(w);
  expect(w.state.osman.visit).not.toBeNull();
  return w;
}

const at = { t: 0, realMs: 0 };
/** His scripted answers, minute by minute. */
const thinks = (w: World, head: OsmanHead | null = null) => osmanThinks(w, head, at.realMs);
const regular = (w: World, id: string) => { w.state.osman.accounts[id] = { owes: 0, since: null, days: REGULAR_DAYS, lastDay: null, cheated: false }; };

describe('Pak Osman: his comings and goings', () => {
  it('comes about 06:30 every day, Sundays too, and stays until about noon', () => {
    const w = newWorld(6, 0);
    const today = dayIndex(w.t);
    for (let d = 0; d < 21; d++) {
      const s = scheduleFor(w, today + d);
      expect(s!.arrives).toBeGreaterThanOrEqual(6 * 60 + 20);
      expect(s!.arrives).toBeLessThanOrEqual(6 * 60 + 40);
      expect(s!.leaves).toBeGreaterThanOrEqual(11 * 60 + 40);
      expect(s!.leaves).toBeLessThanOrEqual(12 * 60 + 20);
    }
  });

  it('arrives with his horn, and drives off at his time', () => {
    const w = newWorld(6, 0);
    const s = scheduleFor(w, dayIndex(w.t))!;
    const types: { type: string; mod: number }[] = [];
    while (minuteOfDay(w.t) < 13 * 60) {
      advance(w);
      for (const e of w.takeEvents()) if (e.type === 'lorry_arrived' || e.type === 'lorry_left') types.push({ type: e.type, mod: minuteOfDay(e.t) });
    }
    expect(types).toEqual([{ type: 'lorry_arrived', mod: s.arrives }, { type: 'lorry_left', mod: s.leaves }]);
  });

  it('comes on a Sunday too', () => {
    const w = newWorld(6, 0);
    w.state.t = sgt(6, 0, 6);
    expect(weekdayAt(w.state, w.t)).toBe('Sunday');
    while (minuteOfDay(w.t) < 9 * 60) advance(w);
    expect(w.state.osman.lastDay).toBe(dayIndex(w.t));
    expect(w.state.lorryHere).toBe(true);
  });
});

describe('Pak Osman: one lorry, shared', () => {
  it('town supply varies from day to day, within bounds, the same for the same town', () => {
    const w = newWorld(6, 0, 7);
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      const s = supplyFor(w, d);
      for (const g of BRINGS) {
        expect(s[g]).toBeGreaterThanOrEqual(SUPPLY[g][0]);
        expect(s[g]).toBeLessThanOrEqual(SUPPLY[g][1]);
      }
      seen.add(JSON.stringify(s));
      expect(supplyFor(w, d)).toEqual(s);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it("what he brings fills no more than his share of the lorry; when it's full, he's full", () => {
    const w = lorryMorning();
    const v = w.state.osman.visit!;
    const brought = Object.values(v.goods).reduce((n, k) => n + k!, 0);
    expect(brought).toBeLessThanOrEqual(LOAD * GOODS_SHARE);
    const rahim = put(w, 'Rahim', 'lorry-stop');
    const space = room(v);
    rahim.items = { fish: space + 5 };
    refused(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: space + 1 }), new RegExp(`only has room on the lorry for ${space} fish more`));
    accepted(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: space }));
    refused(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: 1 }), /lorry is full today/);
    // Selling what he brought makes room again.
    const tan = put(w, 'Mdm Tan', 'lorry-stop');
    tan.money = 10_000;
    accepted(act(w, tan.id, { verb: 'order_stock', item: 'rice', qty: 2 }));
    accepted(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: 2 }));
  });

  it("he buys only fish and vegetables, and doesn't sell what he buys", () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.items = { bread: 1 };
    refused(act(w, siti.id, { verb: 'sell', item: 'bread' }), /only buys fish and vegetables/);
    refused(act(w, siti.id, { verb: 'buy', item: 'fish' }), /doesn't bring fish from town/);
  });
});

describe('Pak Osman: prices', () => {
  it('his list stays within bounds: buying at 40–80% of the town price, selling at 110–160%', () => {
    for (let seed = 1; seed < 6; seed++) {
      for (let d = 0; d < 6; d++) {
        const w = lorryMorning(seed, d);
        const v = w.state.osman.visit!;
        for (const g of BRINGS) {
          const [lo, hi] = bounds('sells', g)!;
          expect(v.sells[g]).toBeGreaterThanOrEqual(lo);
          expect(v.sells[g]).toBeLessThanOrEqual(hi);
        }
        for (const g of TAKES) {
          const [lo, hi] = bounds('buys', g)!;
          expect(v.buys[g]).toBeGreaterThanOrEqual(lo);
          expect(v.buys[g]).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it("his head's prices are clamped to his bounds, and anything it doesn't name stays scripted", async () => {
    const w = lorryMorning();
    const before = { ...w.state.osman.visit!.sells };
    const head: OsmanHead = { price: async () => ({ sells: { rice: 1, coffee: 99_999, kerosene: 'thirty' }, buys: { fish: 1000 } }), haggle: async () => null, gossip: async () => null };
    await thinks(w, head);
    const v = w.state.osman.visit!;
    expect(v.sells.rice).toBe(bounds('sells', 'rice')![0]);
    expect(v.sells.coffee).toBe(bounds('sells', 'coffee')![1]);
    expect(v.sells.bread).toBe(before.bread);
    expect(v.sells.kerosene).toBe(before.kerosene);
    expect(v.buys.fish).toBe(bounds('buys', 'fish')![1]);
    expect(w.takeEvents().find((e) => e.type === 'lorry_priced')).toMatchObject({ by: 'ai' });
  });

  it('asks his head once a visit, and falls back to scripted prices when it fails or the town has spent its cap', async () => {
    let calls = 0;
    const failing: ModelClient = { think: async () => { calls++; throw new Error('overloaded'); } };
    const costs = new CostLog(null);
    const w = lorryMorning();
    const before = { ...w.state.osman.visit!.sells };
    await thinks(w, new ModelOsmanHead({ client: failing, costs }));
    await thinks(w, new ModelOsmanHead({ client: failing, costs }));
    expect(w.state.osman.visit!.sells).toEqual(before);
    expect(calls).toBe(2); // the prices once, the news once
    expect(costs.spentOn(costs.dayKey(0))).toBeGreaterThan(0);

    const spent = new CostLog(null);
    spent.add({ t: 0, realMs: 0, resident: 'x', kind: 'act', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: 5 });
    const w2 = lorryMorning();
    calls = 0;
    await thinks(w2, new ModelOsmanHead({ client: failing, costs: spent }));
    expect(calls).toBe(0);
    expect(w2.state.osman.visit!.gossip).toBeTruthy();
  });

  it('regulars pay a little less, and anyone who let a debt run pays more, still within bounds', () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    const raju = put(w, 'Raju', 'lorry-stop');
    const kow = put(w, 'Ah Kow', 'lorry-stop');
    advance(w);
    regular(w, siti.id);
    w.state.osman.accounts[raju.id]!.cheated = true;
    for (const g of BRINGS) {
      const plain = priceFor(w, kow, 'sells', g)!;
      expect(priceFor(w, siti, 'sells', g)!).toBeLessThanOrEqual(plain);
      expect(priceFor(w, raju, 'sells', g)!).toBeGreaterThanOrEqual(plain);
      expect(priceFor(w, raju, 'sells', g)!).toBeLessThanOrEqual(bounds('sells', g)![1]);
    }
    expect(priceFor(w, raju, 'sells', 'rice')!).toBeGreaterThan(priceFor(w, siti, 'sells', 'rice')!);
  });
});

describe('Pak Osman: haggling', () => {
  it('an offer below his price waits for his answer; close enough, he takes it', async () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.money = 1000;
    const price = priceFor(w, siti, 'sells', 'rice')!;
    const offer = Math.ceil(price * 0.95) * 2;
    const res = accepted(act(w, siti.id, { verb: 'buy', item: 'rice', qty: 2, money: offer }));
    expect(res.reply).toMatch(/You offer Pak Osman/);
    expect(siti.money).toBe(1000);
    await thinks(w);
    expect(siti.money).toBe(1000 - offer);
    expect(siti.items.rice).toBe(2);
    expect(siti.recent.at(-1)!.text).toMatch(/Pak Osman takes your/);
  });

  it('too far off, he counters with a price of his own for today, or refuses outright', async () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.money = 1000;
    const price = priceFor(w, siti, 'sells', 'coffee')!;
    accepted(act(w, siti.id, { verb: 'buy', item: 'coffee', money: Math.floor(price * 0.78) }));
    await thinks(w);
    const counter = w.state.osman.visit!.deals[siti.id]!['sells:coffee']!;
    expect(counter).toBeLessThan(price);
    expect(counter).toBeGreaterThanOrEqual(bounds('sells', 'coffee')![0]);
    expect(siti.recent.at(-1)!.text).toMatch(/he'll let you have them at/);
    expect(priceFor(w, siti, 'sells', 'coffee')).toBe(counter);
    accepted(act(w, siti.id, { verb: 'buy', item: 'coffee' }));
    expect(siti.money).toBe(1000 - counter);

    accepted(act(w, siti.id, { verb: 'buy', item: 'bread', money: 1 }));
    await thinks(w);
    expect(siti.recent.at(-1)!.text).toMatch(/shakes his head/);
  });

  it('selling to him, a resident may ask more than he pays', async () => {
    const w = lorryMorning();
    const rahim = put(w, 'Rahim', 'lorry-stop');
    rahim.items = { fish: 3 };
    const pays = priceFor(w, rahim, 'buys', 'fish')!;
    const before = rahim.money;
    accepted(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: 3, money: (pays + 1) * 3 }));
    await thinks(w);
    expect(rahim.money).toBe(before + (pays + 1) * 3);
  });

  it("after about ten haggles a visit, it's take it or leave it", async () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.money = 1000;
    for (let n = 0; n < HAGGLES_PER_VISIT; n++) {
      accepted(act(w, siti.id, { verb: 'buy', item: 'bread', money: 1 }));
      await thinks(w);
    }
    refused(act(w, siti.id, { verb: 'buy', item: 'bread', money: 1 }), /Take it or leave it/);
    expect(describePerception(perceive(w, siti))).toMatch(/done haggling/);
  });

  it('whatever his head answers, he never sells below his floor or pays above his ceiling', () => {
    const facts = { name: 'Siti', side: 'sells' as const, item: 'rice' as const, qty: 1, offered: 5, list: 22, floor: 18, ceiling: 25, regular: false, cheated: false };
    expect(settleAnswer(facts, { answer: 'accept' }).answer).toBe('refuse');
    expect(settleAnswer(facts, { answer: 'counter', each: 2 })).toMatchObject({ answer: 'counter', each: 18 });
    expect(settleAnswer(facts, { answer: 'counter', each: 500 }).answer).toBe('refuse');
    const buying = { ...facts, side: 'buys' as const, item: 'fish' as const, offered: 99, list: 15, floor: 10, ceiling: 20 };
    expect(settleAnswer(buying, { answer: 'accept' }).answer).toBe('refuse');
    expect(settleAnswer(buying, { answer: 'counter', each: 50 })).toMatchObject({ answer: 'counter', each: 20 });
  });
});

describe('Pak Osman: his book', () => {
  it('credit for regulars only, capped, and the slate paid off at the lorry', () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    const kow = put(w, 'Ah Kow', 'lorry-stop');
    siti.money = 0;
    refused(act(w, kow.id, { verb: 'buy', item: 'bread', later: true }), /only gives credit to people he knows well/);
    regular(w, siti.id);
    const res = accepted(act(w, siti.id, { verb: 'buy', item: 'bread', later: true }));
    expect(res.reply).toMatch(/writes .* against your name/);
    const owes = w.state.osman.accounts[siti.id]!.owes;
    expect(owes).toBeGreaterThan(0);
    w.state.osman.accounts[siti.id]!.owes = creditCap(w);
    refused(act(w, siti.id, { verb: 'buy', item: 'bread', later: true }), /won't let you owe him more than/);
    w.state.osman.accounts[siti.id]!.owes = owes;
    expect(describePerception(perceive(w, siti))).toContain(`You owe Pak Osman`);
    siti.money = 500;
    accepted(act(w, siti.id, { verb: 'pay_lorry_man' }));
    expect(w.state.osman.accounts[siti.id]!.owes).toBe(0);
    expect(siti.money).toBe(500 - owes);
  });

  it('the cap grows with the money in town, from a small floor', () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    regular(w, siti.id);
    for (const r of w.state.residents) r.money = 0;
    refused(act(w, siti.id, { verb: 'buy', item: 'rice', qty: 10, later: true }), new RegExp(`more than \\$${CREDIT_FLOOR / 100}`));
    for (const r of w.state.residents) r.money = 10_000;
    accepted(act(w, siti.id, { verb: 'buy', item: 'rice', qty: 10, later: true }));
  });

  it('a debt left past its week marks the debtor: no more credit, and dearer prices', () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    regular(w, siti.id);
    const plain = priceFor(w, siti, 'sells', 'rice')!;
    accepted(act(w, siti.id, { verb: 'buy', item: 'bread', later: true }));
    // Eight days on, the next morning he comes.
    const w8 = new World(structuredClone(w.state));
    w8.state.t += DEBT_MINUTES + 1440;
    w8.state.osman.visit = null;
    while (!w8.state.osman.visit) advance(w8);
    const s8 = put(w8, 'Siti', 'lorry-stop');
    expect(w8.state.osman.accounts[s8.id]!.cheated).toBe(true);
    refused(act(w8, s8.id, { verb: 'buy', item: 'bread', later: true }), /hasn't forgotten/);
    expect(priceFor(w8, s8, 'sells', 'rice')!).toBeGreaterThan(plain);
  });
});

describe('Pak Osman: orders for next time', () => {
  it('a deposit now; next time he brings what town could spare, and hands back the deposit for the rest', () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.money = 5000;
    const each = priceFor(w, siti, 'sells', 'coffee')!;
    accepted(act(w, siti.id, { verb: 'ask_to_bring', item: 'coffee', qty: 40, money: each * 40 }));
    expect(siti.money).toBe(5000 - each * 40);
    expect(describePerception(perceive(w, siti))).toMatch(/asked him to bring 40 tins of coffee powder next time/);
    // Next morning.
    while (w.state.osman.visit) advance(w);
    while (!w.state.osman.visit) advance(w);
    const order = w.state.osman.orders[0]!;
    expect(order.brought).toBeGreaterThan(0);
    expect(order.brought).toBeLessThanOrEqual(SUPPLY.coffee[1]);
    put(w, 'Siti', 'lorry-stop');
    advance(w);
    expect(describePerception(perceive(w, siti))).toMatch(/could only get \d+ of the 40 coffee/);
    accepted(act(w, siti.id, { verb: 'collect' }));
    expect(siti.items.coffee).toBe(order.brought);
    expect(siti.money).toBe(5000 - each * order.brought!);
    expect(w.state.osman.orders).toEqual([]);
  });

  it("nobody comes for it: he drives off with it, and the deposit comes back", () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.money = 500;
    accepted(act(w, siti.id, { verb: 'ask_to_bring', item: 'kerosene', qty: 2, money: 20 }));
    put(w, 'Siti', 'well');
    while (w.state.osman.visit) advance(w);
    while (!w.state.osman.visit) advance(w);
    while (w.state.osman.visit) advance(w);
    expect(siti.money).toBe(500);
    expect(w.state.osman.orders).toEqual([]);
    expect(siti.recent.some((o) => /drove off .* kerosene/.test(o.text))).toBe(true);
  });
});

describe('Pak Osman: news from town', () => {
  it('one line a visit, heard by those at the stop and anyone who comes later, never about how things work', async () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    await thinks(w);
    const line = w.state.osman.visit!.gossip!;
    expect(line).not.toMatch(UNWORLDLY);
    await thinks(w);
    expect(w.state.osman.visit!.gossip).toBe(line);
    expect(siti.recent.filter((o) => o.text.includes(line))).toHaveLength(1);
    const raju = put(w, 'Raju', 'lorry-stop');
    advance(w);
    expect(raju.recent.some((o) => o.text.includes(line))).toBe(true);
  });

  it("a line from his head that talks of the machinery is never passed on", async () => {
    const w = lorryMorning();
    const head: OsmanHead = { price: async () => null, haggle: async () => null, gossip: async () => 'The game engine is down.' };
    await thinks(w, head);
    expect(w.state.osman.visit!.gossip).not.toMatch(/engine/);
  });
});

describe('Pak Osman: money', () => {
  it('moves only through the ledger: conserved across a visit with sales, haggles, credit and deposits', async () => {
    const w = lorryMorning();
    w.takeLedger();
    const start = w.state.residents.reduce((n, r) => n + r.money, 0);
    const opening: LedgerEntry[] = w.state.residents.filter((r) => r.money > 0).map((r, i) => ({ seq: -i, t: w.t, from: 'kampung-opening', to: r.id, cents: r.money, reason: 'opening' }));
    const siti = put(w, 'Siti', 'lorry-stop');
    const rahim = put(w, 'Rahim', 'lorry-stop');
    const tan = put(w, 'Mdm Tan', 'lorry-stop');
    regular(w, siti.id);
    rahim.items = { fish: 4 };
    accepted(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: 2 }));
    accepted(act(w, rahim.id, { verb: 'sell', item: 'fish', qty: 2, money: 999 }));
    accepted(act(w, siti.id, { verb: 'buy', item: 'bread', later: true }));
    accepted(act(w, siti.id, { verb: 'buy', item: 'rice', qty: 2, money: 30 }));
    accepted(act(w, tan.id, { verb: 'ask_to_bring', item: 'rice', qty: 5, money: 40 }));
    accepted(act(w, tan.id, { verb: 'order_stock', item: 'coffee', qty: 1 }));
    await thinks(w);
    accepted(act(w, siti.id, { verb: 'pay_lorry_man', money: 5 }));
    while (w.state.osman.visit) { advance(w); await thinks(w); }
    while (!w.state.osman.visit) advance(w);
    put(w, 'Mdm Tan', 'lorry-stop');
    accepted(act(w, tan.id, { verb: 'collect' }));
    const ledger = w.takeLedger();
    const now = w.state.residents.reduce((n, r) => n + r.money, 0);
    const net = ledger.reduce((n, l) => n + (l.from === 'lorry' ? l.cents : 0) - (l.to === 'lorry' ? l.cents : 0), 0);
    expect(ledger.length).toBeGreaterThanOrEqual(5);
    expect(now).toBe(start + net);
    expect(ledger.every((l) => l.from === 'lorry' || l.to === 'lorry')).toBe(true);
    expect(auditLedger([...opening, ...ledger], w.state.residents).line).toBe('ledger OK');
  });
});

describe("Pak Osman's head: the cost of a visit (estimate)", () => {
  it('a pricing call, ten haggles and a line of news come to a fraction of a cent on the cheap model', async () => {
    const costs = new CostLog(null);
    const sent: ThinkRequest[] = [];
    const fake = new FakeModel(1);
    const client: ModelClient = { think: (req) => { sent.push(req); return fake.think(req); } };
    const head = new ModelOsmanHead({ client, costs });
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    siti.money = 5000;
    await osmanThinks(w, head, 0);
    for (let n = 0; n < 12; n++) {
      act(w, siti.id, { verb: 'buy', item: 'bread', money: 1 });
      await osmanThinks(w, head, 0);
    }
    expect(sent).toHaveLength(2 + HAGGLES_PER_VISIT);
    expect(sent.every((s) => s.residentId === 'pak-osman' && s.kind === 'trader' && s.tier === 'routine')).toBe(true);
    // His prompts are his own world: nothing about how any of it works.
    for (const s of sent) expect(`${s.system}\n${s.user}`).not.toMatch(UNWORLDLY);
    expect(costs.spentOn(costs.dayKey(0))).toBeLessThan(0.01);
  });
});
