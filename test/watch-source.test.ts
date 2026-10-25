import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CostLog } from '../src/mind/cost-log.ts';
import { FakeModel } from '../src/mind/fake-model.ts';
import { MemoryStore } from '../src/mind/memory.ts';
import { Mind } from '../src/mind/mind.ts';
import { mindBrains } from '../src/mind/setup.ts';
import { CARDS } from '../src/seed/cards.ts';
import { SqliteStore } from '../src/store/sqlite-store.ts';
import { Town, fakeBrains } from '../src/town.ts';
import { ReplayReader, ReplayRecorder, extrasFrom, recordTown } from '../src/watch/replay.ts';
import { Hub, LiveSource, ReplaySource, THOUGHTS_ONLY_NOTICE } from '../src/watch/source.ts';
import type { Update } from '../src/watch/types.ts';
import { sgt } from './helpers.ts';

const START = sgt(6, 0) - 1;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'kampung-source-'));
  dirs.push(d);
  return d;
}

describe('the live source', () => {
  it('says hello with the layout, frame and feed, then pushes an update a minute', async () => {
    const live = new LiveSource({ label: 'Fake town at 60×', msPerMinute: 1000, everyMs: 0 });
    const town = Town.create(42, START, live.hooks());
    const got: Update[] = [];
    live.subscribe((u) => got.push(u));
    await town.runUntil(START + 30);
    expect(got).toHaveLength(30);
    expect(got[29]!.frame.t).toBe(START + 30);
    const hello = live.hello();
    expect(hello).toMatchObject({ mode: 'live', label: 'Fake town at 60×', msPerMinute: 1000, replay: null });
    expect(hello.layout.places.length).toBeGreaterThan(10);
    expect(hello.frame.t).toBe(START + 30);
    expect(hello.feed.some((l) => /Dawn/.test(l.text))).toBe(true);
    expect(got.flatMap((u) => u.feed)).toEqual(hello.feed);
    live.close();
  });

  it('keeps the story feed across a restart, from the saved events', async () => {
    const path = join(tmp(), 'kampung.db');
    const store = new SqliteStore(path);
    const before = new LiveSource({ label: 'Live town', msPerMinute: 60_000, everyMs: 0 });
    const town = Town.create(42, START, { store, ...before.hooks() });
    await town.runUntil(START + 60);
    const feedBefore = before.hello().feed;
    expect(feedBefore.length).toBeGreaterThan(5);
    before.close();
    store.close(); // the town stops

    const store2 = new SqliteStore(path);
    const after = new LiveSource({ label: 'Live town', msPerMinute: 60_000, everyMs: 0 });
    const resumed = Town.resume({ store: store2, ...after.hooks() })!;
    after.attach(resumed.world);
    after.seed(store2.recentEvents(2000));
    expect(after.hello().feed).toEqual(feedBefore);
    after.close();
    store2.close();
  });

  it("shows a fake-brain resident's card with what they noticed and no thoughts", async () => {
    const live = new LiveSource({ label: 'Live town', msPerMinute: 60_000, everyMs: 0 });
    const town = Town.create(42, START, live.hooks());
    await town.runUntil(START + 120);
    const card = live.card('siti')!;
    expect(card.name).toBe('Siti');
    expect(card.thoughts).toEqual([]);
    expect(card.mindNote).toMatch(/fake brain/);
    expect(card.noticed.length).toBeGreaterThan(0);
    expect(live.card('nobody')).toBeNull();
  });

  it("shows a mind's plan and thoughts on the card (fake model, $0)", async () => {
    const memory = new MemoryStore(':memory:');
    const mind = new Mind({ client: new FakeModel(1), memory, costs: new CostLog(null), cards: CARDS, townCap: Infinity });
    const live = new LiveSource({
      label: 'x', msPerMinute: 1000, everyMs: 0,
      extras: (id, t) => extrasFrom((r, k, up, n) => memory.latest(r, k, up, n), id, t),
    });
    const town = Town.create(42, START, { brains: mindBrains(mind, fakeBrains), observer: mind.observe, ...live.hooks() });
    await town.runUntil(START + 120);
    const card = live.card('siti')!;
    expect(card.plan?.text).toMatch(/Today/);
    expect(card.thoughts.length).toBeGreaterThan(0);
    expect(card.mindNote).toBeNull();
    memory.close();
  });

  it('picks up a resumed town that has not ticked yet', () => {
    const live = new LiveSource({ label: 'x', msPerMinute: 1000, everyMs: 0 });
    const town = Town.create(42, START);
    live.attach(town.world);
    expect(live.hello().frame.t).toBe(START);
  });
});

async function trialFile(minutes: number): Promise<string> {
  const path = join(tmp(), 'trial-x.db');
  const rec = new ReplayRecorder(path, { seed: 42, label: 'fake trial' });
  const town = Town.create(42, START, recordTown(rec));
  await town.runUntil(START + minutes);
  rec.close();
  return path;
}

describe('the replay source', () => {
  it('plays a trial back at speed, joining routes and feed between ticks', async () => {
    let ms = 0;
    const src = new ReplaySource(new ReplayReader(await trialFile(180)), { speed: 60, now: () => ms, everyMs: 0 });
    const got: Update[] = [];
    src.subscribe((u) => got.push(u));
    const hello = src.hello();
    expect(hello.mode).toBe('replay');
    expect(hello.label).toMatch(/fake trial/);
    expect(hello.msPerMinute).toBe(1000);
    expect(hello.replay).toMatchObject({ start: START, end: START + 180, t: START, paused: false, hasFrames: true });
    expect(hello.notice).toBeNull();
    ms += 30_000; // 30 game minutes at 60×
    src.tick();
    expect(got).toHaveLength(1);
    expect(got[0]!.frame.t).toBe(START + 30);
    expect(got[0]!.feed.length).toBeGreaterThan(0);
    expect(got[0]!.replay!.t).toBe(START + 30);
    src.close();
  });

  it('seeks, pauses and changes speed on command', async () => {
    let ms = 0;
    const src = new ReplaySource(new ReplayReader(await trialFile(120)), { speed: 60, now: () => ms, everyMs: 0 });
    const got: Update[] = [];
    src.subscribe((u) => got.push(u));
    const s = src.control({ t: START + 100, paused: true });
    expect(s).toMatchObject({ t: START + 100, paused: true });
    expect(got.at(-1)).toMatchObject({ snap: true, resetFeed: true });
    expect(got.at(-1)!.frame.t).toBe(START + 100);
    ms += 60_000;
    src.tick();
    expect(src.state().t).toBe(START + 100);
    expect(src.control({ speed: 600 }).speed).toBe(600);
    expect(got.at(-1)!.msPerMinute).toBe(100);
    expect(() => src.control({ speed: -1 })).toThrow();
    const card = src.card('siti')!;
    expect(card.name).toBe('Siti');
    src.close();
  });

  it('says when a trial only kept thoughts', () => {
    const path = join(tmp(), 'trial-old.db');
    const mem = new MemoryStore(path);
    mem.add('siti', START + 61, 'thought', 'The sea is calm.');
    mem.close();
    const src = new ReplaySource(new ReplayReader(path), { now: () => 0, everyMs: 0 });
    expect(src.hello().notice).toBe(THOUGHTS_ONLY_NOTICE);
    expect(src.hello().replay!.hasFrames).toBe(false);
    src.close();
  });
});

describe('the watch page never trips the town', () => {
  it('swallows a fault in its own hooks', async () => {
    const live = new LiveSource({ label: 'x', msPerMinute: 1000, everyMs: 0 });
    const town = Town.create(42, START, live.hooks());
    live.subscribe(() => { throw new Error('page fault'); });
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errors.push(a); };
    try {
      await town.runUntil(START + 5);
    } finally {
      console.error = orig;
    }
    expect(town.t).toBe(START + 5);
    expect(errors).toHaveLength(1);
  });
  it('a throwing listener is contained when updates are merged on a timer, as in npm start', () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errors.push(a); };
    try {
      const hub = new Hub(150);
      const seen: Update[] = [];
      hub.subscribe(() => { throw new Error('page fault'); });
      hub.subscribe((u) => seen.push(u));
      hub.publish({} as Update);
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
      hub.publish({} as Update);
      vi.advanceTimersByTime(200);
      expect(seen).toHaveLength(2);
      expect(errors).toHaveLength(1);
    } finally {
      console.error = orig;
      vi.useRealTimers();
    }
  });
});

describe('replay controls', () => {
  it('keep everyone where they stand on pause or a speed change', async () => {
    const src = new ReplaySource(new ReplayReader(await trialFile(60)), { speed: 60, now: () => 0, everyMs: 0 });
    const got: Update[] = [];
    src.subscribe((u) => got.push(u));
    src.control({ t: START + 30 });
    src.control({ paused: true });
    src.control({ speed: 300 });
    for (const u of got.slice(1)) {
      expect(u.snap).toBeFalsy();
      for (const r of u.frame.residents) expect(r.route).toEqual([{ x: r.x, y: r.y }]);
    }
    src.close();
  });
});
