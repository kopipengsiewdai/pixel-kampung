import { describe, expect, it } from 'vitest';
import { feedLine, keepFeed, type FeedLine } from '../src/feed/feed.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { SqliteStore } from '../src/store/sqlite-store.ts';
import { Town } from '../src/town.ts';
import { startWatchServer } from '../src/watch/server.ts';
import { LiveSource } from '../src/watch/source.ts';
import { TALK_GAP, TALK_LINES, talkOf } from '../src/watch/view.ts';
import { sgt } from './helpers.ts';

let seq = 0;
const ev = (body: Record<string, unknown>, t = 1) => ({ t, seq: ++seq, ...body }) as unknown as GameEvent;
const names = (id: string) => ({ a: 'Siti', b: 'Mdm Tan', c: 'Raju' })[id] ?? id;
const key = (body: Record<string, unknown>) => feedLine(ev(body), names)?.key;

describe('the story feed: key moments', () => {
  it('sales, hires, wages, gifts, notes, first visits, the lorry and price changes are key moments', () => {
    const keys: Record<string, unknown>[] = [
      { type: 'bought', who: 'a', from: 'b', shop: 'provision-shop', item: 'rice', qty: 1, cents: 30 },
      { type: 'sold', who: 'b', to: 'a', shop: 'market-stall', item: 'fish', qty: 1, cents: 20 },
      { type: 'lorry_sale', who: 'a', item: 'fish', qty: 2, cents: 40 },
      { type: 'lorry_order', who: 'b', shop: 'provision-shop', item: 'rice', qty: 5, cents: 100 },
      { type: 'hired', who: 'a', by: 'b', shop: 'provision-shop', wage: 200 },
      { type: 'let_go', who: 'b', worker: 'a' },
      { type: 'quit', who: 'a', from: 'b' },
      { type: 'job_offered', who: 'b', to: 'a', wage: 200, startHour: 9, hours: 4 },
      { type: 'wages_paid', who: 'b', to: 'a', cents: 200, stillOwed: 0 },
      { type: 'gave', who: 'a', to: 'b', item: null, qty: 0, cents: 20 },
      { type: 'traded', who: 'a', with: 'b', give: { items: {}, cents: 10 }, want: { items: { fish: 1 }, cents: 0 } },
      { type: 'note_pinned', who: 'a', text: 'Looking for work.' },
      { type: 'found_place', who: 'a', place: 'jetty' },
      { type: 'lorry_arrived' },
      { type: 'price_set', who: 'b', shop: 'provision-shop', item: 'rice', side: 'sell', cents: 30, limit: null },
      { type: 'first_sale', who: 'b', shop: 'provision-shop' },
    ];
    for (const k of keys) expect(key(k), String(k.type)).toBe(true);
  });

  it('walking, plain chat, fishing casts, meals and the like are not', () => {
    const minor: Record<string, unknown>[] = [
      { type: 'walked', who: 'a', to: 'the jetty' },
      { type: 'went_with', who: 'a', with: 'b', to: 'the kopitiam' },
      { type: 'said', who: 'a', to: 'b', text: 'Hot today, lah.' },
      { type: 'said', who: 'a', to: null, text: 'Morning, everyone!' },
      { type: 'went_fishing', who: 'a' },
      { type: 'ate', who: 'a', item: 'kopi' },
      { type: 'shift_started', who: 'a', shop: 'kopitiam' },
      { type: 'lorry_left' },
      { type: 'morning' },
    ];
    for (const k of minor) expect(key(k), String(k.type)).toBe(false);
  });

  it('a line of talk counts when it claims a deal done in words, which may go unbacked', () => {
    expect(key({ type: 'said', who: 'a', to: 'b', text: "Here's your 30¢ for the kopi." })).toBe(true);
    expect(key({ type: 'said', who: 'b', to: 'a', text: "You're hired. Come at 8." })).toBe(true);
  });

  it('notable lines are always key moments', () => {
    expect(key({ type: 'harvested', who: 'a', qty: 5 })).toBe(true);
    expect(key({ type: 'fell_asleep', who: 'a', reason: 'collapse' })).toBe(true);
  });

  it('keeps the latest lines, and enough key moments from before them to fill the key view', () => {
    const line = (i: number, k: boolean): FeedLine => ({ t: i, seq: i, text: String(i), notable: false, key: k });
    // 300 lines, every tenth a key moment.
    const all = Array.from({ length: 300 }, (_, i) => line(i, i % 10 === 0));
    const kept = keepFeed(all, 50);
    expect(kept.slice(-50).map((l) => l.seq)).toEqual(all.slice(-50).map((l) => l.seq));
    expect(kept.filter((l) => l.key)).toHaveLength(30);
    expect(kept.filter((l) => l.key).map((l) => l.seq)).toEqual(all.filter((l) => l.key).map((l) => l.seq));
    expect(keepFeed(all, 20).filter((l) => l.key)).toHaveLength(20);
    // In order, nothing twice.
    expect(kept.map((l) => l.seq)).toEqual([...new Set(kept.map((l) => l.seq))].sort((x, y) => x - y));
  });
});

describe("a resident's talk, for the card", () => {
  const cal = { calendar: { firstDay: 0 } };
  const said = (t: number, who: string, to: string | null, text: string) => ev({ type: 'said', who, to, text }, t);

  it('groups their conversations, newest first: a new partner or a long gap starts a new one', () => {
    const events = [
      said(100, 'a', 'b', 'Morning, Mdm Tan.'),
      said(101, 'b', 'a', 'Morning, Siti.'),
      said(103, 'a', 'b', 'Any work going?'),
      said(105, 'a', 'c', 'Raju! Fish biting?'),
      said(106, 'c', 'a', 'Not today.'),
      said(106 + TALK_GAP + 1, 'c', 'a', 'Still nothing.'),
      said(200, 'b', 'c', 'Not about Siti at all.'),
      said(201, 'a', null, 'Hello, everyone!'),
    ];
    const talk = talkOf(events, 'a', names, cal);
    expect(talk.map((g) => g.with)).toEqual(['everyone nearby', 'Raju', 'Raju', 'Mdm Tan']);
    expect(talk[3]!.lines.map((l) => l.text)).toEqual(['Any work going?', 'Morning, Siti.', 'Morning, Mdm Tan.']);
    expect(talk[3]!.lines[1]).toMatchObject({ speaker: 'Mdm Tan', to: 'Siti', mine: false });
    expect(talk[3]!.lines[0]).toMatchObject({ speaker: 'Siti', to: 'Mdm Tan', mine: true, stamp: expect.stringMatching(/^Mon \d\d:\d\d$/) });
    expect(talk.flatMap((g) => g.lines).some((l) => l.text.includes('Not about Siti'))).toBe(false);
  });

  it('holds only the last lines', () => {
    const events = Array.from({ length: TALK_LINES + 20 }, (_, i) => said(i, 'a', 'b', `line ${i}`));
    const talk = talkOf(events, 'a', names, cal);
    expect(talk.flatMap((g) => g.lines)).toHaveLength(TALK_LINES);
    expect(talk[0]!.lines[0]!.text).toBe(`line ${TALK_LINES + 19}`);
  });
});

describe('the talk route', () => {
  it("gives a resident's conversations from the saved events, read-only, behind the same guards", async () => {
    const store = new SqliteStore(':memory:');
    const live = new LiveSource({ label: 'Live town', msPerMinute: 1000, everyMs: 0, said: (id, n) => store.saidBy(id, n) });
    const town = Town.create(42, sgt(9, 0), { store, ...live.hooks() });
    const [a, b] = town.world.state.residents;
    town.world.emit({ type: 'said', who: a!.id, to: b!.id, text: 'Selamat pagi!' });
    town.world.emit({ type: 'said', who: b!.id, to: a!.id, text: 'Pagi!' });
    await town.runUntil(town.t + 2);
    const server = await startWatchServer({ source: live, client: { html: '', js: '', css: '' }, assetsDir: '.', port: 0 });
    try {
      const res = await fetch(new URL(`/api/talk/${a!.id}`, server.url));
      expect(res.status).toBe(200);
      const talk = await res.json() as { name: string; talks: { with: string; lines: { text: string }[] }[] };
      expect(talk.name).toBe(a!.name);
      expect(talk.talks[0]).toMatchObject({ with: b!.name });
      expect(talk.talks[0]!.lines.map((l) => l.text)).toEqual(['Pagi!', 'Selamat pagi!']);
      expect((await fetch(new URL('/api/talk/nobody', server.url))).status).toBe(404);
      expect((await fetch(new URL(`/api/talk/${a!.id}`, server.url), { method: 'POST' })).status).not.toBe(200);
    } finally {
      await server.close();
      store.close();
    }
  });

  it('works from what the page has seen when no save is kept', async () => {
    const live = new LiveSource({ label: 'Live town', msPerMinute: 1000, everyMs: 0 });
    const town = Town.create(42, sgt(9, 0), live.hooks());
    const [a, b] = town.world.state.residents;
    town.world.emit({ type: 'said', who: a!.id, to: b!.id, text: 'Hello there.' });
    await town.runUntil(town.t + 1);
    expect(live.talk(a!.id)!.talks[0]!.lines[0]!.text).toBe('Hello there.');
    expect(live.talk('nobody')).toBeNull();
  });
});
