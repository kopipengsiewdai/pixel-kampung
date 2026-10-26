import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dayCap, MONTHLY_CAP, TOWN_DAILY_CAP } from '../src/mind/budget.ts';
import { CostLog } from '../src/mind/cost-log.ts';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'kampung-cap-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** Noon in Singapore on a day of October 2026. */
const noon = (day: number) => Date.UTC(2026, 9, day, 4, 0, 0);
const spend = (costs: CostLog, realMs: number, usd: number) =>
  costs.add({ t: 0, realMs, resident: 'x', kind: 'act', model: 'm', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: usd });

describe("the town's cap keeps a month within US$100", () => {
  it('a 31-day month where every day spends its whole cap comes to US$100 at most', () => {
    const costs = new CostLog(tmp());
    let total = 0;
    for (let d = 1; d <= 31; d++) {
      const cap = dayCap(costs, noon(d));
      expect(cap).toBeLessThanOrEqual(TOWN_DAILY_CAP);
      spend(costs, noon(d), cap);
      total += cap;
    }
    expect(total).toBeLessThanOrEqual(MONTHLY_CAP + 1e-9);
    expect(total).toBeGreaterThan(MONTHLY_CAP - 1);
  });

  it('a month starts at its fair share; a costly start lowers what is left; a spent month gives nothing', () => {
    const costs = new CostLog(tmp());
    expect(dayCap(costs, noon(1))).toBeCloseTo(MONTHLY_CAP / 31, 9);
    spend(costs, noon(1), 70);
    // US$30 left over 30 days: a dollar a day.
    expect(dayCap(costs, noon(2))).toBeCloseTo(1, 6);
    spend(costs, noon(2), 40);
    expect(dayCap(costs, noon(3))).toBe(0);
  });

  it('a new month starts afresh, and the cap holds all day whatever is spent today', () => {
    const costs = new CostLog(tmp());
    spend(costs, noon(30), 99);
    const nov1 = Date.UTC(2026, 10, 1, 4);
    expect(dayCap(costs, nov1)).toBe(TOWN_DAILY_CAP);
    spend(costs, nov1, 2);
    expect(dayCap(costs, nov1)).toBe(TOWN_DAILY_CAP);
  });
});
