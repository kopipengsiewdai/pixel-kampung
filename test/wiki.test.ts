import { describe, expect, it } from 'vitest';
import { LORRY_ARRIVES } from '../src/sim/tick.ts';
import { LORRY_BUYS, LORRY_SELLS, RECIPES } from '../src/sim/items.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { World } from '../src/sim/state.ts';
import { createWorld } from '../src/sim/seed.ts';
import { SqliteStore } from '../src/store/sqlite-store.ts';
import { Town } from '../src/town.ts';
import { startWatchServer } from '../src/watch/server.ts';
import { LiveSource } from '../src/watch/source.ts';
import { FrameBuilder, layoutOf } from '../src/watch/view.ts';
import { ECONOMY_DAYS, economyOf, howItWorks, newsOf, peopleOf, placesOf } from '../src/watch/wiki.ts';
import { sgt } from './helpers.ts';

const DAY = 1440;
const today = sgt(12, 0, 3);
const cal = { calendar: { firstDay: Math.floor((sgt(0, 0) + 8 * 60) / DAY) } };
let seq = 0;
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: ++seq, ...body }) as unknown as GameEvent;

const residents = [
  { id: 'tan', name: 'Mdm Tan', money: 5000, job: 'Runs the provision shop' },
  { id: 'siti', name: 'Siti', money: 300, job: 'Works at the provision shop for Mdm Tan, 9am to 1pm, $1.20 a shift' },
  { id: 'raju', name: 'Raju', money: 100, job: null },
];
const events = [
  // Yesterday: a sale in town, the lorry buys fish, an order off the lorry.
  ev(today - DAY, { type: 'bought', who: 'siti', from: 'tan', shop: 'provision-shop', item: 'rice', qty: 1, cents: 30 }),
  ev(today - DAY, { type: 'lorry_sale', who: 'raju', item: 'fish', qty: 2, cents: 30 }),
  ev(today - DAY, { type: 'lorry_order', who: 'tan', shop: 'provision-shop', item: 'rice', qty: 5, cents: 100 }),
  // Today: two sales, wages, a gift, a trade with money in it.
  ev(today - 60, { type: 'bought', who: 'raju', from: 'tan', shop: 'provision-shop', item: 'bread', qty: 1, cents: 20 }),
  ev(today - 50, { type: 'sold', who: 'raju', to: 'tan', shop: 'provision-shop', item: 'fish', qty: 1, cents: 18 }),
  ev(today - 40, { type: 'wages_paid', who: 'tan', to: 'siti', cents: 120, stillOwed: 0 }),
  ev(today - 30, { type: 'gave', who: 'siti', to: 'raju', item: null, qty: 0, cents: 10 }),
  ev(today - 20, { type: 'traded', who: 'raju', with: 'siti', give: { items: {}, cents: 5 }, want: { items: { fish: 1 }, cents: 0 } }),
  ev(today - 10, { type: 'lorry_sale', who: 'siti', item: 'vegetables', qty: 3, cents: 30 }),
  // Long ago: out of the window.
  ev(today - 30 * DAY, { type: 'bought', who: 'siti', from: 'tan', shop: 'provision-shop', item: 'rice', qty: 1, cents: 999 }),
];
const eco = economyOf(events, { t: today, residents }, cal, { audit: 'ledger OK', spend: { usd: 1.2, cap: 3.33 } });
const day = (n: number) => eco.days.at(-1 - n)!;

describe('the economy, day by day', () => {
  it('covers today and the days before it, oldest first, with their dates, never before the town began', () => {
    expect(eco.days).toHaveLength(4);
    expect(economyOf([], { t: today + 10 * DAY, residents }, cal, {}).days).toHaveLength(ECONOMY_DAYS);
    expect(day(0).label).toMatch(/^Thu 4 Jan/);
    expect(day(1).label).toMatch(/^Wed 3 Jan/);
  });

  it('GDP: sales in town and to the lorry, less what came in off it', () => {
    expect(day(1).gdp).toBe(30 + 30 - 100);
    expect(day(0).gdp).toBe(20 + 18 + 30);
  });

  it('value traded: every sale, in town and to and from the lorry', () => {
    expect(day(1).traded).toBe(30 + 30 + 100);
    expect(day(0).traded).toBe(20 + 18 + 30);
  });

  it('trades: how many sales', () => {
    expect(day(1).sales).toBe(3);
    expect(day(0).sales).toBe(3);
    expect(day(2).sales).toBe(0);
  });

  it('money in and out across the edge of town: the lorry pays in, orders go out', () => {
    expect(day(1)).toMatchObject({ moneyIn: 30, moneyOut: 100 });
    expect(day(0)).toMatchObject({ moneyIn: 30, moneyOut: 0 });
  });

  it("money in town: everyone's purses, today now and each earlier day at its end", () => {
    const now = 5000 + 300 + 100;
    expect(day(0).moneyEnd).toBe(now);
    // Today brought 30¢ in from the lorry, so yesterday ended 30¢ lower.
    expect(day(1).moneyEnd).toBe(now - 30);
    // Yesterday brought in 30¢ and sent out $1.00.
    expect(day(2).moneyEnd).toBe(now - 30 - 30 + 100);
  });

  it("income today per resident (sales, wages, gifts received), highest first", () => {
    expect(eco.income).toEqual([
      { name: 'Siti', cents: 120 + 30 },
      { name: 'Raju', cents: 18 + 10 + 5 },
      { name: 'Mdm Tan', cents: 20 },
    ]);
  });

  it('wealth per resident: their purse now, richest first', () => {
    expect(eco.wealth.map((w) => [w.name, w.cents])).toEqual([['Mdm Tan', 5000], ['Siti', 300], ['Raju', 100]]);
  });

  it('jobs: who works for whom', () => {
    expect(eco.jobs).toEqual([{ name: 'Siti', job: residents[1]!.job }]);
  });

  it("the ledger check's last result and today's thinking spend against the cap", () => {
    expect(eco.audit).toBe('ledger OK');
    expect(eco.spend).toEqual({ usd: 1.2, cap: 3.33 });
    const none = economyOf([], { t: today, residents }, cal, {});
    expect(none.audit).toBeNull();
    expect(none.spend).toBeNull();
    expect(none.debts).toBeNull();
  });

  it('debts: the total and who owes whom, once there are debts', () => {
    const withDebts = economyOf([], { t: today, residents }, cal, { debts: [{ debtor: 'raju', creditor: 'tan', cents: 50 }, { debtor: 'siti', creditor: 'tan', cents: 25 }] });
    expect(withDebts.debts).toEqual({ total: 75, list: [{ debtor: 'Raju', creditor: 'Mdm Tan', cents: 50 }, { debtor: 'Siti', creditor: 'Mdm Tan', cents: 25 }] });
  });
});

describe('the wiki', () => {
  const w = new World(createWorld(42, sgt(9, 0)));
  const frame = new FrameBuilder().build(w);
  const layout = layoutOf(w);

  it('people: who they are, from their card, with home, job, money and family and old friends', () => {
    const people = peopleOf(frame, layout);
    expect(people).toHaveLength(13);
    expect(people.find((p) => p.name === 'Hassan')).toMatchObject({ role: 'lives with family', age: 8, home: "Fatimah's house" });
    const huat = people.find((p) => p.name === 'Ah Huat')!;
    expect(huat).toMatchObject({ role: 'runs a shop', age: 54, home: "Ah Huat's house" });
    expect(huat.ties).toEqual(expect.arrayContaining([{ name: 'Ah Seng', how: 'son' }, { name: 'Rahim', how: 'friend' }]));
    expect(people.find((p) => p.name === 'Mei Ling')!.ties).toEqual([{ name: 'Mdm Tan', how: 'aunt' }]);
    expect(people.find((p) => p.name === 'Ah Kow')!.ties).toEqual([]);
    expect(people.find((p) => p.name === 'Siti')!.ties).toEqual([{ name: 'Mak Esah', how: 'mother' }, { name: 'Fatimah', how: 'known from before' }]);
    expect(people.find((p) => p.name === 'Fatimah')!.ties).toEqual([
      { name: 'Aminah', how: 'daughter' }, { name: 'Hassan', how: 'son' }, { name: 'Rahim', how: "late husband's brother" }, { name: 'Siti', how: 'friend' },
    ]);
    expect(people.find((p) => p.name === 'Hassan')!.ties).toEqual([{ name: 'Fatimah', how: 'mother' }, { name: 'Aminah', how: 'big sister' }, { name: 'Rahim', how: 'uncle' }]);
    expect(people.find((p) => p.name === 'Rahim')!.ties).toEqual([
      { name: 'Fatimah', how: "late brother's wife" }, { name: 'Aminah', how: 'niece' }, { name: 'Hassan', how: 'nephew' }, { name: 'Ah Huat', how: 'old friend' },
    ]);
    expect(people.find((p) => p.name === 'Mak Esah')!.ties).toEqual([{ name: 'Siti', how: 'daughter' }]);
  });

  it('places: each with what it is for, and whose it is', () => {
    const places = placesOf(frame, layout);
    expect(places.find((p) => p.id === 'kopitiam')).toMatchObject({ owner: 'Ah Huat', use: expect.stringMatching(/kopi/) });
    expect(places.find((p) => p.id === 'jetty')!.use).toMatch(/fish/i);
    expect(places.filter((p) => p.kind === 'house').every((p) => p.home !== null)).toBe(true);
  });

  it('how the kampung works: written from the rules as they are in the code', () => {
    const text = howItWorks().map((s) => `${s.title}\n${s.paras.join('\n')}`).join('\n');
    expect(text).toContain(`${String(Math.floor(LORRY_ARRIVES / 60)).padStart(2, '0')}:${String(LORRY_ARRIVES % 60).padStart(2, '0')}`);
    for (const [item, c] of Object.entries(LORRY_SELLS)) expect(text).toContain(`${item} ${c}¢`);
    for (const [item, c] of Object.entries(LORRY_BUYS)) expect(text).toContain(`${item} ${c}¢`);
    expect(text).toContain(`${RECIPES.kopi!.yields} kopi`);
    expect(text).toMatch(/five real hours/);
    expect(text).toMatch(/Monday, 1 January, Year 0/);
  });

  it("what's new: the changelog, newest first, as sections and lines", () => {
    const news = newsOf('# Changelog\n\nIntro.\n\n## 0.2.0 (2026-10-25): two\n\n- **Big:** thing.\n- Small.\n\n## 0.1.0\n\n- First.\n');
    expect(news).toEqual([
      { title: '0.2.0 (2026-10-25): two', lines: ['**Big:** thing.', 'Small.'] },
      { title: '0.1.0', lines: ['First.'] },
    ]);
  });
});

describe('reading the saved events for the wiki', () => {
  it('reads only the events since the window began, by the primary key, never the whole log', () => {
    const store = new SqliteStore(':memory:');
    const town = Town.create(42, sgt(9, 0), { store });
    const t0 = town.world.t;
    town.world.emit({ type: 'gave', who: 'siti', to: 'raju', item: null, qty: 0, cents: 5 });
    store.save(town.snapshot(), town.world.takeEvents(), []);
    town.world.state.t += 100;
    town.world.emit({ type: 'gave', who: 'raju', to: 'siti', item: null, qty: 0, cents: 7 });
    store.save(town.snapshot(), town.world.takeEvents(), []);
    expect(store.eventsSince(t0 + 50, ['gave']).map((e) => (e as { cents: number }).cents)).toEqual([7]);
    expect(store.eventsSince(t0 - 1, ['gave'])).toHaveLength(2);
    store.close();
  });
});

describe('the wiki route', () => {
  it('serves the whole wiki, read-only, behind the same guards', async () => {
    const live = new LiveSource({ label: 'Live town', msPerMinute: 1000, everyMs: 0, spend: () => ({ usd: 0.5, cap: 3.33 }), audit: () => 'ledger OK' });
    const town = Town.create(42, sgt(9, 0), live.hooks());
    await town.runUntil(town.t + 30);
    const server = await startWatchServer({ source: live, client: { html: '', js: '', css: '' }, assetsDir: '.', port: 0 });
    try {
      const res = await fetch(new URL('/api/wiki', server.url));
      expect(res.status).toBe(200);
      const wiki = await res.json() as { version: string; people: unknown[]; places: unknown[]; how: unknown[]; news: unknown[]; economy: { days: unknown[]; audit: string; spend: unknown } };
      expect(wiki.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(wiki.people).toHaveLength(13);
      expect(wiki.places.length).toBeGreaterThan(8);
      expect(wiki.how.length).toBeGreaterThan(4);
      expect(wiki.news.length).toBeGreaterThan(3);
      expect(wiki.economy.days).toHaveLength(1);
      expect(wiki.economy.audit).toBe('ledger OK');
      expect(wiki.economy.spend).toEqual({ usd: 0.5, cap: 3.33 });
      expect((await fetch(new URL('/api/wiki', server.url), { method: 'POST' })).status).not.toBe(200);
      const id = town.world.state.residents[0]!.id;
      const money = await (await fetch(new URL(`/api/money/${id}`, server.url))).json() as { name: string; kinds: unknown[]; entries: unknown[] };
      expect(money.name).toBe(town.world.state.residents[0]!.name);
      expect(Array.isArray(money.kinds) && Array.isArray(money.entries)).toBe(true);
      expect((await fetch(new URL('/api/money/kopitiam', server.url))).status).toBe(200);
      expect((await fetch(new URL('/api/money/nobody', server.url))).status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
