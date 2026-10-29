import { describe, expect, it } from 'vitest';
import { boxRow, spendLines, type DayFacts } from '../src/news/box.ts';
import type { GameEvent, LedgerEntry } from '../src/sim/events.ts';
import { FUND_ID, LORRY_ID, TEACHER_ID, TRAVELLERS_ID } from '../src/sim/state.ts';

// docs/design/news.md "Behind the scenes": plain figures from the save, no AI, a mark where a figure crosses a line.
const residents = [{ id: 'siti', name: 'Siti' }, { id: 'raju', name: 'Raju' }, { id: 'muthu', name: 'Muthu' }];
let seq = 0;
const ev = (e: Record<string, unknown>): GameEvent => ({ seq: ++seq, t: 100, ...e }) as unknown as GameEvent;
const pay = (from: string, to: string, cents: number): LedgerEntry => ({ seq: ++seq, t: 100, from, to, cents, reason: 'x' });
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({ day: 20770, events: [], ledger: [], did: [], end: null, ...over });

describe('the behind-the-scenes box, one kampung day', () => {
  it('meals per resident, and who ate fewer than 2 (marked)', () => {
    const row = boxRow(facts({ events: [
      ev({ type: 'ate', who: 'siti', item: 'bubur' }), ev({ type: 'ate', who: 'siti', item: 'fish' }), ev({ type: 'ate', who: 'siti', item: 'kopi' }),
      ev({ type: 'ate', who: 'raju', item: 'fish' }), ev({ type: 'ate', who: 'raju', item: 'fish' }), ev({ type: 'ate', who: 'muthu', item: 'bread' }),
    ] }), residents);
    expect(row.meals).toBe(6);
    expect(row.perResident).toBeCloseTo(2);
    expect(row.under2).toEqual(['Muthu 1']);
    expect(row.warn).toContain('meals');
  });

  it('hunger at 1000 at the end of the day, who fell ill and who got well', () => {
    const row = boxRow(facts({
      events: [ev({ type: 'fell_ill', who: 'raju' }), ev({ type: 'got_well', who: 'siti' })],
      end: { day: 20770, hunger1000: ['muthu'], noMoney: ['raju'], fund: 1234 },
    }), residents);
    expect(row.hunger1000).toEqual(['Muthu']);
    expect(row.fellIll).toEqual(['Raju']);
    expect(row.gotWell).toEqual(['Siti']);
    expect(row.warn).toContain('hunger');
    expect(row.noMoney).toEqual(['Raju']);
    expect(row.fund).toBe(1234);
  });

  it('with no end-of-day record (before the paper began), those figures are unknown, not zero', () => {
    const row = boxRow(facts(), residents);
    expect(row.hunger1000).toBeNull();
    expect(row.noMoney).toBeNull();
    expect(row.fund).toBeNull();
  });

  it('the refusals said most often (top 5), marked at 10 or more of the same', () => {
    const did = [
      ...Array.from({ length: 12 }, () => ({ resident: 'raju', text: 'You have no water: each batch takes a bag of rice and a pail of water.' })),
      ...Array.from({ length: 3 }, () => ({ resident: 'muthu', text: "Ah Huat isn't nearby. You haven't seen Ah Huat lately. There's nobody here with you." })),
      { resident: 'siti', text: 'You set off for the well.' },
    ];
    const row = boxRow(facts({ did }), residents);
    expect(row.refusals[0]).toEqual({ who: 'Raju', text: 'You have no water: each batch takes a bag of rice and a pail of water.', n: 12 });
    expect(row.refusals[1]!.n).toBe(3);
    expect(row.refusals).toHaveLength(2);
    expect(row.warn).toContain('refusals');
  });

  it('talk circles, marked over 30', () => {
    expect(boxRow(facts({ events: Array.from({ length: 30 }, () => ev({ type: 'circles' })) }), residents).warn).not.toContain('circles');
    const row = boxRow(facts({ events: Array.from({ length: 31 }, () => ev({ type: 'circles' })) }), residents);
    expect(row.circles).toBe(31);
    expect(row.warn).toContain('circles');
  });

  it('money in and out across the edge of town: the lorry, travellers and the teacher, not the village fund', () => {
    const row = boxRow(facts({ ledger: [
      pay(TRAVELLERS_ID, 'ah-huat', 120), pay(LORRY_ID, 'rahim', 300), pay('siti', LORRY_ID, 420), pay('aminah', TEACHER_ID, 5),
      pay('raju', FUND_ID, 200), pay('siti', 'raju', 50),
    ] }), residents);
    expect(row.edgeIn).toBe(420);
    expect(row.edgeOut).toBe(425);
  });

  it('a quiet day is all zeros and no marks', () => {
    const row = boxRow(facts({ end: { day: 20770, hunger1000: [], noMoney: [], fund: 0 } }), []);
    expect(row.warn).toEqual([]);
  });
});

describe('the spend line', () => {
  it('each real day covered, against the cap, marked above it', () => {
    expect(spendLines([{ day: '2026-10-29', usd: 1.2, cap: 3.33 }, { day: '2026-10-30', usd: 3.5, cap: 3.2 }])).toEqual([
      { day: '2026-10-29', usd: 1.2, cap: 3.33, over: false },
      { day: '2026-10-30', usd: 3.5, cap: 3.2, over: true },
    ]);
  });
});
