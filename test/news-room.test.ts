import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CostLog } from '../src/mind/cost-log.ts';
import type { ModelClient, ThinkRequest, ThinkResponse } from '../src/mind/model.ts';
import { FIRST_ISSUE_DAYS, MAX_ISSUE_DAYS, Newsroom, type NewsDesk } from '../src/news/newsroom.ts';
import type { GameEvent } from '../src/sim/events.ts';

// docs/design/news.md: one AI-written issue a real morning at about 07:00 SGT, facts only, covering the kampung days since the last.
const SGT = 8 * 3600_000;
/** Real ms at hh:mm SGT on 2026-10-dd. */
const at = (dd: number, hh: number, mm = 0) => Date.UTC(2026, 9, dd, hh, mm) - SGT;
const MIN_PER_DAY = 1440;
/** Game minute of hh:00 on kampung day d. */
const gt = (d: number, hh = 12) => d * MIN_PER_DAY - 480 + hh * 60;

let seq = 0;
const ev = (t: number, e: Record<string, unknown>): GameEvent => ({ seq: ++seq, t, ...e }) as unknown as GameEvent;

function desk(gameNow: number, events: GameEvent[] = []): NewsDesk {
  return {
    t: () => gameNow,
    calendar: { firstDay: 20700 },
    residents: () => [{ id: 'siti', name: 'Siti' }, { id: 'raju', name: 'Raju' }],
    names: (id) => ({ siti: 'Siti', raju: 'Raju' })[id] ?? id,
    facts: (day) => ({
      day,
      events: events.filter((e) => e.t >= day * MIN_PER_DAY - 480 && e.t < (day + 1) * MIN_PER_DAY - 480),
      ledger: [],
      did: [],
    }),
    ledgerCheck: () => 'ledger OK',
  };
}

/** A writer that answers with what it's given, and remembers what it was asked. */
function writer(answer: unknown) {
  const asked: ThinkRequest[] = [];
  const client: ModelClient = {
    async think(req): Promise<ThinkResponse> {
      asked.push(req);
      const usage = { input_tokens: 2000, output_tokens: 500 };
      return { model: 'claude-haiku-5-5', text: '', toolCall: { name: 'publish', input: answer }, usage, attempts: [{ model: 'claude-haiku-5-5', usage }], refused: false };
    },
  };
  return { client, asked };
}

const story = { headline: 'SITI AND RAJU WED', lead: 'Siti and Raju were married at the well on Tuesday.', reports: [{ headline: 'Lorry calls', text: 'The lorry came in at seven with rice.' }] };
const home = () => mkdtempSync(join(tmpdir(), 'kampung-news-'));

describe('Kampung News', () => {
  it('is due once a real day from 07:00 SGT, and not again that day', async () => {
    const dir = home();
    const { client } = writer(story);
    const room = new Newsroom({ dir, client, costs: new CostLog(null), desk: desk(gt(20770, 9)), now: () => at(29, 6, 59) });
    expect(room.due(at(29, 6, 59))).toBe(false);
    expect(room.due(at(29, 7, 0))).toBe(true);
    expect(await room.publishIfDue(at(29, 7, 1))).not.toBeNull();
    expect(room.due(at(29, 22, 0))).toBe(false);
    expect(room.due(at(30, 7, 0))).toBe(true);
  });

  it('the first issue covers the last five whole kampung days; the next, every day since', async () => {
    const dir = home();
    const { client } = writer(story);
    let gameNow = gt(20770, 9);
    const d = { ...desk(0), t: () => gameNow };
    const room = new Newsroom({ dir, client, costs: new CostLog(null), desk: d, now: () => at(29, 7) });
    const first = (await room.publishIfDue(at(29, 7)))!;
    expect(FIRST_ISSUE_DAYS).toBe(5);
    expect([first.fromDay, first.toDay]).toEqual([20765, 20769]);
    expect(first.box.rows.map((r) => r.day)).toEqual([20765, 20766, 20767, 20768, 20769]);
    gameNow = gt(20775, 9);
    const next = (await room.publishIfDue(at(30, 7)))!;
    expect([next.fromDay, next.toDay]).toEqual([20770, 20774]);
    expect(room.list().map((i) => i.n)).toEqual([2, 1]);
    expect(room.get(1)!.headline).toBe('SITI AND RAJU WED');
    // Kept as runtime output under KAMPUNG_HOME, one file an issue.
    expect(readdirSync(join(dir, 'news', 'issues')).sort()).toEqual(['1.json', '2.json']);
  });

  it('has a dateline in the kampung calendar, and the writer sees only the digest of what happened', async () => {
    const events = [ev(gt(20768, 10), { type: 'married', who: 'siti', to: 'raju' })];
    const { client, asked } = writer(story);
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9), events), now: () => at(29, 7) });
    const issue = (await room.publishIfDue(at(29, 7)))!;
    expect(issue.dateline).toMatch(/^Kampung, \w+day \d+ \w+, Year \d+$/);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.user).toMatch(/Raju and Siti are married|Siti and Raju are married/);
    expect(asked[0]!.system).toMatch(/only what is in the notes/i);
    expect(asked[0]!.system).toMatch(/1960s/);
  });

  it('the notes say who is family to whom, and fold the same line said again and again into one', async () => {
    const events = [1, 2, 3, 4].map((k) => ev(gt(20768, 11) + k, { type: 'lorry_haggled', who: 'siti', side: 'buys', item: 'rice', qty: 10, cents: 18, answer: 'refused', counter: null, by: 'script' }));
    const d = { ...desk(gt(20770, 9), events), residents: () => [{ id: 'mdm-tan', name: 'Mdm Tan' }, { id: 'mei-ling', name: 'Mei Ling' }, { id: 'siti', name: 'Siti', spouse: 'Raju' }] };
    const { client, asked } = writer(story);
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: d, now: () => at(29, 7) });
    await room.publishIfDue(at(29, 7));
    const user = asked[0]!.user;
    expect(user).toMatch(/Who's who/);
    expect(user).toMatch(/Mei Ling: Mdm Tan's niece/);
    expect(user).toMatch(/Siti: Mak Esah's daughter|Siti: .*married to Raju/);
    const lines = user.split('\n').filter((l) => /Pak Osman/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/\(4 times\)/);
  });

  it('is one cheap call, in the cost log as kampung-news', async () => {
    const costs = new CostLog(null);
    const { client, asked } = writer(story);
    const room = new Newsroom({ dir: home(), client, costs, desk: desk(gt(20770, 9)), now: () => at(29, 7) });
    await room.publishIfDue(at(29, 7));
    expect(asked[0]!.tier).toBe('routine');
    expect(asked[0]!.kind).toBe('news');
    expect(costs.spentOn('2026-10-29')).toBeGreaterThan(0);
  });

  it('with the day\'s cap spent, waits and is written later, never skipped', async () => {
    const { client, asked } = writer(story);
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9)), now: () => at(29, 7), townCap: 0 });
    expect(await room.publishIfDue(at(29, 7))).toBeNull();
    expect(asked).toHaveLength(0);
    expect(room.due(at(29, 8))).toBe(true);
    (room as unknown as { townCap: number }).townCap = 3;
    expect(await room.publishIfDue(at(29, 8))).not.toBeNull();
  });

  it('a failed call is charged at its estimate and not tried again for a while (never every second)', async () => {
    let calls = 0;
    const client: ModelClient = { async think() { calls++; throw new Error('overloaded'); } };
    const costs = new CostLog(null);
    const room = new Newsroom({ dir: home(), client, costs, desk: desk(gt(20770, 9)), now: () => at(29, 7) });
    expect(await room.publishIfDue(at(29, 7))).toBeNull();
    expect(await room.publishIfDue(at(29, 7, 5))).toBeNull();
    expect(calls).toBe(1);
    expect(costs.spentOn('2026-10-29')).toBeGreaterThan(0);
    await room.publishIfDue(at(29, 7, 11));
    expect(calls).toBe(2);
  });

  it('drops a report with a quote that isn\'t in the notes', async () => {
    const events = [ev(gt(20769, 9), { type: 'said', who: 'siti', to: 'raju', text: 'The lorry man wants forty cents for rice now, Raju.' })];
    const { client } = writer({ ...story, reports: [
      { headline: 'Rice dear', text: 'Siti told Raju: "The lorry man wants forty cents for rice now, Raju."' },
      { headline: 'Made up', text: 'Raju replied: "I shall sail to Johor tomorrow and never return."' },
    ] });
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9), events), now: () => at(29, 7) });
    const issue = (await room.publishIfDue(at(29, 7)))!;
    expect(issue.reports.map((r) => r.headline)).toEqual(['Rice dear']);
  });

  it('says when the town was down in the stretch it covers', async () => {
    const events = [ev(gt(20767, 3), { type: 'quiet_spell', minutes: 600 })];
    const { client, asked } = writer(story);
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9), events), now: () => at(29, 7) });
    const issue = (await room.publishIfDue(at(29, 7)))!;
    expect(issue.gap).toBe(true);
    expect(asked[0]!.user).toMatch(/quiet/i);
  });

  it('keeps the end of each kampung day for the box (hunger, money, the fund)', async () => {
    const dir = home();
    const { client } = writer(story);
    const room = new Newsroom({ dir, client, costs: new CostLog(null), desk: desk(gt(20770, 9)), now: () => at(29, 7) });
    room.recordDayEnd({ day: 20769, hunger1000: ['raju'], noMoney: [], fund: 500 });
    const issue = (await room.publishIfDue(at(29, 7)))!;
    expect(issue.box.rows.at(-1)!.hunger1000).toEqual(['Raju']);
    expect(issue.box.rows[0]!.hunger1000).toBeNull();
    expect(JSON.parse(readFileSync(join(dir, 'news', 'days.jsonl'), 'utf8').trim())).toEqual({ day: 20769, hunger1000: ['raju'], noMoney: [], fund: 500 });
    expect(issue.box.ledgerCheck).toBe('ledger OK');
  });
});

describe('Kampung News, after review', () => {
  it('an unusable answer counts: at most 3 paid tries a real day, then it waits for the next morning', async () => {
    const { client, asked } = writer({ nothing: true });
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9)), now: () => at(29, 7) });
    for (let m = 0; m < 120; m += 11) await room.publishIfDue(at(29, 7, m));
    expect(asked).toHaveLength(3);
    await room.publishIfDue(at(30, 7, 1));
    expect(asked).toHaveLength(4);
  });

  it('after a long stretch with no issue, covers the latest week and says how many days it leaves out', async () => {
    const { client, asked } = writer(story);
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9)), now: () => at(29, 7) });
    (room as unknown as { issues: unknown[] }).issues.push({ n: 1, toDay: 20740, publishedMs: at(20, 7) });
    const issue = (await room.publishIfDue(at(29, 7)))!;
    expect(MAX_ISSUE_DAYS).toBe(7);
    expect([issue.fromDay, issue.toDay]).toEqual([20763, 20769]);
    expect(issue.leftOut).toBe(22);
    expect(asked[0]!.user).toMatch(/22 earlier days/);
  });

  it('a made-up quote in the lead, even across sentences, means the lead goes; a report on record takes its place', async () => {
    const events = [ev(gt(20769, 9), { type: 'said', who: 'siti', to: 'raju', text: 'The lorry man wants forty cents for rice now, Raju.' })];
    const { client } = writer({ headline: 'RAJU TO SAIL', lead: 'Raju said: "I shall sail. I never return to the kampung."', reports: [
      { headline: 'Rice dear', text: 'Siti told Raju: ‘The lorry man wants forty cents for rice now, Raju.’' },
    ] });
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9), events), now: () => at(29, 7) });
    const issue = (await room.publishIfDue(at(29, 7)))!;
    expect(issue.headline).toBe('Rice dear');
    expect(issue.lead).toMatch(/forty cents/);
    expect(issue.reports).toHaveLength(0);
  });

  it('a quote with a curly apostrophe still matches the notes', async () => {
    const events = [ev(gt(20769, 9), { type: 'said', who: 'siti', to: 'raju', text: "Don't sell the fish so cheap, Raju." })];
    const { client } = writer({ ...story, reports: [{ headline: 'Advice', text: 'Siti said: “Don’t sell the fish so cheap, Raju.”' }] });
    const room = new Newsroom({ dir: home(), client, costs: new CostLog(null), desk: desk(gt(20770, 9), events), now: () => at(29, 7) });
    expect((await room.publishIfDue(at(29, 7)))!.reports).toHaveLength(1);
  });

  it('the cap going quiet is not the town being down; a spell that ended today still counts for the days it covered', async () => {
    const capped = [ev(gt(20768, 15), { type: 'kampung_quiet' })];
    const a = await new Newsroom({ dir: home(), client: writer(story).client, costs: new CostLog(null), desk: desk(gt(20770, 9), capped), now: () => at(29, 7) }).publishIfDue(at(29, 7));
    expect(a!.gap).toBe(false);
    const down = [ev(gt(20770, 2), { type: 'quiet_spell', minutes: 1440 })];
    const b = await new Newsroom({ dir: home(), client: writer(story).client, costs: new CostLog(null), desk: desk(gt(20770, 9), down), now: () => at(29, 7) }).publishIfDue(at(29, 7));
    expect(b!.gap).toBe(true);
  });

  it('the spend shows each whole real day since the last issue, and the month against its cap', async () => {
    const costs = new CostLog(null);
    costs.add({ t: 0, realMs: at(28, 12), resident: 'siti', kind: 'act', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: 1.5 });
    const room = new Newsroom({ dir: home(), client: writer(story).client, costs, desk: desk(gt(20770, 9)), now: () => at(28, 7) });
    (room as unknown as { issues: unknown[] }).issues.push({ n: 1, toDay: 20764, publishedMs: at(28, 7) });
    const issue = (await room.publishIfDue(at(29, 7)))!;
    expect(issue.box.spend.map((s) => s.day)).toEqual(['2026-10-28', '2026-10-29']);
    expect(issue.box.spend[0]!.usd).toBeCloseTo(1.5);
    expect(issue.box.month!.cap).toBe(100);
    expect(issue.box.month!.usd).toBeGreaterThanOrEqual(1.5);
  });
});
