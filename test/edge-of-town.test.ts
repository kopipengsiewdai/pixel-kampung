import { describe, expect, it } from 'vitest';
import { STAYS } from '../src/sim/osman.ts';
import { FUND_ID, LORRY_ID, OPENING_ID, TRAVELLERS_ID } from '../src/sim/state.ts';
import { economyOf } from '../src/watch/wiki.ts';

const cal = { calendar: { firstDay: 100 } };
const day = (d: number, h = 9) => d * 1440 - 8 * 60 + h * 60;

describe('Pak Osman stays the first half of the day', () => {
  it('from about half past six to about noon', () => {
    expect(STAYS).toBeGreaterThanOrEqual(5 * 60);
    expect(6 * 60 + 30 + STAYS).toBeLessThanOrEqual(12 * 60 + 15);
  });
});

describe('the economy page counts money across the edge of town from the ledger', () => {
  it('each outside party, what it paid in and took out; and money in and out each day', () => {
    const residents = [{ id: 'siti', name: 'Siti', money: 500, job: null }];
    const ledger = [
      { seq: 1, t: day(100, 1), from: OPENING_ID, to: 'siti', cents: 1000, reason: 'opening' },
      { seq: 2, t: day(100), from: 'siti', to: LORRY_ID, cents: 300, reason: 'bought bread off the lorry' },
      { seq: 3, t: day(100), from: LORRY_ID, to: 'siti', cents: 120, reason: 'sold fish to the lorry' },
      { seq: 4, t: day(100), from: 'siti', to: LORRY_ID, cents: 50, reason: 'lorry deposit' },
      { seq: 5, t: day(100, 11), from: LORRY_ID, to: 'siti', cents: 50, reason: 'lorry deposit back' },
      { seq: 6, t: day(100), from: TRAVELLERS_ID, to: 'siti', cents: 80, reason: 'a traveller' },
      { seq: 7, t: day(100), from: 'siti', to: FUND_ID, cents: 50, reason: 'rent' },
    ];
    const e = economyOf([], { t: day(100, 12), residents }, cal, { ledger });
    const today = e.days.at(-1)!;
    expect(today.moneyIn).toBe(120 + 50 + 80);
    expect(today.moneyOut).toBe(300 + 50 + 50);
    const lorry = e.edges.find((x) => x.id === LORRY_ID)!;
    expect(lorry).toMatchObject({ name: 'Pak Osman (the lorry)', paidIn: 170, tookOut: 350 });
    expect(e.edges.find((x) => x.id === FUND_ID)).toMatchObject({ tookOut: 50 });
    expect(e.edges.some((x) => x.id === OPENING_ID)).toBe(false);
    expect(e.fromLedger).toBe(true);
    expect(economyOf([], { t: day(100, 12), residents }, cal, {}).fromLedger).toBe(false);
  });
});
