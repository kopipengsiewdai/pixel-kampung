import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/sim/events.ts';
import { tidyThoughts } from '../src/watch/view.ts';
import { moneyOf } from '../src/watch/wiki.ts';
import { sgt } from './helpers.ts';

const DAY = 1440;
const now = sgt(12, 0, 3);
const cal = { calendar: { firstDay: Math.floor((sgt(0, 0) + 8 * 60) / DAY) } };
let seq = 0;
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: ++seq, ...body }) as unknown as GameEvent;
const people = [
  { id: 'tan', name: 'Mdm Tan' }, { id: 'siti', name: 'Siti' }, { id: 'raju', name: 'Raju' },
];
const shops = [{ id: 'provision-shop', ownerId: 'tan', name: 'the provision shop' }];
const events = [
  ev(now - 2 * DAY, { type: 'lorry_order', who: 'tan', shop: 'provision-shop', item: 'rice', qty: 5, cents: 100 }),
  ev(now - DAY, { type: 'debt_agreed', who: 'siti', from: 'tan', kind: 'lend', cents: 200 }),
  ev(now - 90, { type: 'bought', who: 'siti', from: 'tan', shop: 'provision-shop', item: 'rice', qty: 1, cents: 30 }),
  ev(now - 80, { type: 'sold', who: 'raju', to: 'tan', shop: 'provision-shop', item: 'fish', qty: 2, cents: 36 }),
  ev(now - 70, { type: 'wages_paid', who: 'tan', to: 'siti', cents: 120, stillOwed: 0 }),
  ev(now - 60, { type: 'gave', who: 'siti', to: 'raju', item: null, qty: 0, cents: 10 }),
  ev(now - 50, { type: 'repaid', who: 'siti', to: 'tan', cents: 50, stillOwed: 150 }),
  ev(now - 40, { type: 'lorry_sale', who: 'raju', item: 'fish', qty: 1, cents: 15 }),
  ev(now - 30, { type: 'traded', who: 'raju', with: 'siti', give: { items: {}, cents: 5 }, want: { items: { fish: 1 }, cents: 0 } }),
  ev(now - 20, { type: 'debt_agreed', who: 'raju', from: 'siti', kind: 'iou', cents: 500 }),
];

describe("a resident's money, by kind, with every entry", () => {
  const siti = moneyOf('siti', events, { t: now, people, shops }, cal)!;

  it('totals in and out by kind, today and over the last week', () => {
    const row = (label: string) => siti.kinds.find((k) => k.label === label)!;
    expect(row('Purchases')).toMatchObject({ todayOut: 30, weekOut: 30, todayIn: 0 });
    expect(row('Wages')).toMatchObject({ todayIn: 120, weekIn: 120 });
    expect(row('Gifts')).toMatchObject({ todayOut: 10 });
    expect(row('Loans')).toMatchObject({ todayIn: 0, weekIn: 200 });
    expect(row('Repayments')).toMatchObject({ todayOut: 50 });
    expect(row('Trades')).toMatchObject({ todayOut: 5 });
    // Kinds with nothing in them aren't listed.
    expect(siti.kinds.some((k) => k.label === 'Lorry')).toBe(false);
  });

  it('lists the entries, newest first: when, with whom, what, how much', () => {
    expect(siti.entries[0]).toMatchObject({ kind: 'Trades', with: 'Raju', cents: -5 });
    expect(siti.entries.find((e) => e.kind === 'Purchases')).toMatchObject({ with: 'Mdm Tan', what: 'a bag of rice', cents: -30, stamp: expect.stringMatching(/^Thu \d\d:\d\d$/) });
    expect(siti.entries.find((e) => e.kind === 'Loans')).toMatchObject({ with: 'Mdm Tan', what: 'borrowed', cents: 200 });
    // An IOU moves no money.
    expect(siti.entries.some((e) => e.what === 'IOU')).toBe(false);
  });

  it("someone selling to the lorry and to a shop, as they'd see it", () => {
    const raju = moneyOf('raju', events, { t: now, people, shops }, cal)!;
    expect(raju.kinds.find((k) => k.label === 'Sales')).toMatchObject({ todayIn: 36 });
    expect(raju.kinds.find((k) => k.label === 'Lorry')).toMatchObject({ todayIn: 15 });
    expect(raju.kinds.find((k) => k.label === 'Gifts')).toMatchObject({ todayIn: 10 });
    expect(raju.entries.find((e) => e.kind === 'Lorry')).toMatchObject({ with: 'the lorry', what: 'a fish', cents: 15 });
  });

  it("a shop's money: its sales, what it buys in, its lorry orders and the wages its owner pays", () => {
    const shop = moneyOf('provision-shop', events, { t: now, people, shops }, cal)!;
    expect(shop.name).toBe('the provision shop');
    const row = (label: string) => shop.kinds.find((k) => k.label === label)!;
    expect(row('Sales')).toMatchObject({ todayIn: 30 });
    expect(row('Purchases')).toMatchObject({ todayOut: 36 });
    expect(row('Lorry')).toMatchObject({ todayOut: 0, weekOut: 100 });
    expect(row('Wages')).toMatchObject({ todayOut: 120 });
    // Mdm Tan's own loans and repayments are hers, not the shop's.
    expect(shop.kinds.some((k) => k.label === 'Loans' || k.label === 'Repayments')).toBe(false);
  });

  it('nobody, or no such shop, is null', () => {
    expect(moneyOf('nobody', events, { t: now, people, shops }, cal)).toBeNull();
  });
});

describe('thoughts on the card', () => {
  const th = (text: string, t = 1) => ({ t, stamp: 'Mon 07:00', kind: 'thought', text });

  it("loses the model's own labels and asterisks", () => {
    expect(tidyThoughts([th('*Ah Kow thinks:* The *coffee* powder is dry.')]).map((x) => x.text)).toEqual(['The coffee powder is dry.']);
  });

  it('folds near-identical thoughts into the newest, with how many times', () => {
    const tidy = tidyThoughts([
      th('The coffee powder is dry, I cannot drink it.', 1),
      th('Rain coming soon, better go home.', 2),
      th('The coffee powder is dry; I cannot drink it like this.', 3),
      th('Ah, the coffee powder is dry. I cannot drink it.', 4),
    ]);
    expect(tidy.map((x) => [x.text, x.times ?? 1])).toEqual([
      ['Rain coming soon, better go home.', 1],
      ['Ah, the coffee powder is dry. I cannot drink it.', 3],
    ]);
  });
});
