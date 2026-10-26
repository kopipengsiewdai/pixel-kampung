/**
 * Where the watch page's pictures come from: the live town as it runs, or a
 * recorded trial played back. Either way the page gets a hello (layout, the
 * current frame, recent feed) and then updates, merged so a slow page or a
 * fast clock never floods it.
 */
import { VERSION } from '../version.ts';
import { basename } from 'node:path';
import { feedLine, keepFeed, type FeedLine } from '../feed/feed.ts';
import type { GameEvent, LedgerEntry } from '../sim/events.ts';
import type { Point } from '../sim/map.ts';
import { createWorld } from '../sim/seed.ts';
import { World } from '../sim/state.ts';
import { MINUTES_PER_DAY } from '../sim/time.ts';
import { shortStamp } from '../sim/calendar.ts';
import type { TownOptions } from '../town.ts';
import { ReplayPlayer } from './player.ts';
import type { ReplayReader } from './replay.ts';
import type { Card, Frame, Hello, Layout, MoneyView, PlaceCard, ReplayState, TalkView, Update, Wiki } from './types.ts';
import { FrameBuilder, TALK_DAYS, TALK_LINES, cardOf, layoutOf, placeCardOf, talkOf, type CardExtras } from './view.ts';
import { ECONOMY_DAYS, ECONOMY_EVENTS, moneyOf, wikiOf } from './wiki.ts';

export const FEED_KEPT = 200;
export const ROUTE_KEPT = 64;

export interface ReplayCommand { speed?: number; paused?: boolean; t?: number }

export interface WatchSource {
  readonly mode: 'live' | 'replay';
  hello(): Hello;
  card(id: string): Card | null;
  /** What the owner sees on clicking a place: who's there and what's inside. */
  placeCard(id: string): PlaceCard | null;
  /** A resident's conversations, for the card's Talk tab; null for nobody. */
  talk(id: string): TalkView | null;
  /** The Kampung wiki: people, places, how it works, the economy, what's new. */
  wiki(): Wiki;
  /** A resident's or a shop's money, by kind and entry; null for neither. */
  money(id: string): MoneyView | null;
  subscribe(fn: (u: Update) => void): () => void;
  /** Replay mode only. */
  control?(cmd: ReplayCommand): ReplayState;
  state?(): ReplayState;
  /** Called every 100 ms by the server (replays move their clock on here). */
  tick?(): void;
  close(): void;
}

/** The shops in a frame, named as on the map. */
function shopsOf(frame: Frame, layout: Layout): { id: string; ownerId: string; name: string }[] {
  return frame.shops.map((s) => ({ id: s.id, ownerId: s.ownerId, name: layout.places.find((p) => p.id === s.id)?.name ?? s.name }));
}

function joinRoutes(a: Point[], b: Point[]): Point[] {
  const out = a.map((p) => ({ ...p }));
  for (const p of b) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push({ ...p });
  }
  return out.slice(-ROUTE_KEPT);
}

/** One update standing for a then b: b's frame, both routes joined, both feeds. */
export function mergeUpdates(a: Update, b: Update): Update {
  const before = new Map(a.frame.residents.map((r) => [r.id, r.route]));
  const frame: Frame = {
    ...b.frame,
    residents: b.frame.residents.map((r) => ({ ...r, route: b.snap ? r.route : joinRoutes(before.get(r.id) ?? [], r.route) })),
  };
  const out: Update = { frame, feed: keepFeed(b.resetFeed ? b.feed : [...a.feed, ...b.feed], FEED_KEPT) };
  if (a.snap || b.snap) out.snap = true;
  if (a.resetFeed || b.resetFeed) out.resetFeed = true;
  const ms = b.msPerMinute ?? a.msPerMinute;
  if (ms !== undefined) out.msPerMinute = ms;
  const replay = b.replay ?? a.replay;
  if (replay) out.replay = replay;
  return out;
}

/** Holds updates and hands them on merged, at most every `everyMs` (0: at once). */
export class Hub {
  private listeners = new Set<(u: Update) => void>();
  private pending: Update | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failed = false;
  private readonly everyMs: number;

  constructor(everyMs: number) {
    this.everyMs = everyMs;
  }

  subscribe(fn: (u: Update) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  publish(u: Update): void {
    this.pending = this.pending ? mergeUpdates(this.pending, u) : u;
    if (this.everyMs === 0) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), this.everyMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const u = this.pending;
    this.pending = null;
    if (!u) return;
    // flush() also runs from a timer, outside the town's guard: a listener fault must not escape.
    for (const fn of this.listeners) {
      try {
        fn(u);
      } catch (err) {
        if (!this.failed) console.error(`The watch page couldn't send an update (${err instanceof Error ? err.message : String(err)}).`);
        this.failed = true;
      }
    }
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}

export interface LiveOptions {
  label: string;
  /** Real milliseconds one game minute takes (12 500 for the live town: a game day every five real hours). */
  msPerMinute: number;
  /** What a resident's mind has been thinking (null when they run on the fake brain). */
  extras?: (id: string, t: number) => CardExtras | null;
  /** Merge window for updates to the page. */
  everyMs?: number;
  /** A resident's last n lines of talk since game minute t, from the saved events, newest first; without it, what the page has seen. */
  said?: (id: string, n: number, sinceT: number) => GameEvent[];
  /** Money changing hands since game minute t, from the saved events; without it, what the page has seen. */
  moneyEvents?: (sinceT: number) => GameEvent[];
  /** The last ledger check's line, if the town keeps one. */
  audit?: () => string | null;
  /** The money ledger from game minute t on, for money across the edge of town. */
  ledgerSince?: (sinceT: number) => LedgerEntry[];
  /** Today's thinking spend and the town's daily cap, if the town thinks for real. */
  spend?: () => { usd: number; cap: number } | null;
}

/** Lines of talk a live page keeps in hand when there's no save to read from. */
const SAID_KEPT = 2000;

const FAKE_BRAIN_NOTE = 'Runs on the free fake brain, so there are no thoughts to show.';

/**
 * The town as it runs. Hook it into the town with `hooks()`, then `attach`
 * the town's world once it exists.
 */
export class LiveSource implements WatchSource {
  readonly mode = 'live' as const;
  private readonly opts: LiveOptions;
  private readonly hub: Hub;
  private readonly frames = new FrameBuilder();
  private world: World | null = null;
  private layout: Layout | null = null;
  private frame: Frame | null = null;
  private feed: FeedLine[] = [];
  private fresh: FeedLine[] = [];
  private said: GameEvent[] = [];
  private money_: GameEvent[] = [];

  constructor(opts: LiveOptions) {
    this.opts = opts;
    this.hub = new Hub(opts.everyMs ?? 150);
  }

  /** Town hooks. They never throw: a fault in the page must not stop the town. */
  hooks(): Required<Pick<TownOptions, 'onEvent' | 'onTick'>> {
    return {
      onEvent: (e) => this.guard(() => this.onEvent(e)),
      onTick: (w) => this.guard(() => this.onTick(w)),
    };
  }

  private warned = false;

  private guard(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (!this.warned) console.error(`The watch page hit a problem and may lag (${err instanceof Error ? err.message : String(err)}). The town keeps running.`);
      this.warned = true;
    }
  }

  /** Sees a world for the first time (a resumed town, which hasn't ticked yet). */
  attach(w: World): void {
    if (this.world === w && this.frame) return;
    this.world = w;
    this.layout = layoutOf(w);
    this.frame = this.frames.build(w);
  }

  private lineOf(e: GameEvent): FeedLine | null {
    const w = this.world!;
    return feedLine(e, (id) => w.nameOf(id));
  }

  private onEvent(e: GameEvent): void {
    if (!this.world) return;
    const line = this.lineOf(e);
    if (line) this.fresh.push(line);
    if (ECONOMY_EVENTS.has(e.type) && !this.opts.moneyEvents) {
      this.money_.push(e);
      const since = e.t - ECONOMY_DAYS * MINUTES_PER_DAY;
      if (this.money_[0]!.t < since) this.money_ = this.money_.filter((x) => x.t >= since);
    }
    if (e.type === 'said' && !this.opts.said) {
      this.said.push(e);
      if (this.said.length > SAID_KEPT) this.said.splice(0, this.said.length - SAID_KEPT);
    }
  }

  /** Refills the feed from saved events after a restart (call after `attach`). */
  seed(events: readonly GameEvent[]): void {
    if (!this.world) return;
    const lines = events.map((e) => this.lineOf(e)).filter((l): l is FeedLine => l !== null);
    this.feed = keepFeed([...lines, ...this.feed], FEED_KEPT);
  }

  private onTick(w: World): void {
    if (this.world !== w) {
      this.attach(w);
      this.fresh = [];
      return;
    }
    this.frame = this.frames.build(w);
    const feed = this.fresh;
    this.fresh = [];
    this.feed = keepFeed([...this.feed, ...feed], FEED_KEPT);
    this.hub.publish({ frame: this.frame, feed });
  }

  hello(): Hello {
    if (!this.layout || !this.frame) throw new Error('the town is not attached yet');
    return {
      mode: 'live', label: this.opts.label, version: VERSION, msPerMinute: this.opts.msPerMinute,
      layout: this.layout, frame: this.frame, feed: [...this.feed], replay: null, notice: null,
      calendar: { ...this.world!.state.calendar },
    };
  }

  card(id: string): Card | null {
    if (!this.frame || !this.world) return null;
    const t = this.frame.t;
    const r = this.world.state.residents.find((x) => x.id === id);
    const noticed = (r?.recent ?? []).slice(-6).map((o) => ({ t: o.t, stamp: shortStamp(this.world!.state, o.t), kind: 'noticed', text: o.text }));
    const mind = this.opts.extras?.(id, t) ?? null;
    const extras: CardExtras = mind
      ? { ...mind, noticed: mind.noticed.length ? mind.noticed : noticed }
      : { plan: null, thoughts: [], noticed, mindNote: FAKE_BRAIN_NOTE };
    const card = cardOf(this.frame, id, extras);
    if (!card) return null;
    const state = this.world.state;
    // The strongest feelings first.
    const bonds = Object.entries(state.bonds ?? {}).filter(([k]) => k.startsWith(`${id}>`))
      .map(([k, b]) => ({ name: state.residents.find((x) => x.id === k.slice(id.length + 1))?.name ?? k, trust: b.trust, fondness: b.fondness }))
      .sort((a, b) => Math.abs(b.trust) + Math.abs(b.fondness) - Math.abs(a.trust) - Math.abs(a.fondness));
    return { ...card, bonds };
  }

  placeCard(id: string): PlaceCard | null {
    return this.frame && this.layout ? placeCardOf(this.frame, this.layout, id) : null;
  }

  wiki(): Wiki {
    if (!this.frame || !this.layout || !this.world) throw new Error('the town is not attached yet');
    const since = this.frame.t - ECONOMY_DAYS * MINUTES_PER_DAY;
    const events = this.opts.moneyEvents ? this.opts.moneyEvents(since) : this.money_;
    return wikiOf(this.frame, this.layout, events, this.world.state, {
      audit: this.opts.audit?.() ?? null, spend: this.opts.spend?.() ?? null, debts: this.world.state.debts,
      ...(this.opts.ledgerSince ? { ledger: this.opts.ledgerSince(this.frame.t - ECONOMY_DAYS * MINUTES_PER_DAY) } : {}),
    });
  }

  money(id: string): MoneyView | null {
    if (!this.frame || !this.layout || !this.world) return null;
    const events = this.opts.moneyEvents ? this.opts.moneyEvents(this.frame.t - ECONOMY_DAYS * MINUTES_PER_DAY) : this.money_;
    return moneyOf(id, events, { t: this.frame.t, people: this.frame.residents, shops: shopsOf(this.frame, this.layout) }, this.world.state);
  }

  talk(id: string): TalkView | null {
    const w = this.world;
    const r = w?.state.residents.find((x) => x.id === id);
    if (!w || !r) return null;
    const events = this.opts.said ? this.opts.said(id, TALK_LINES, w.t - TALK_DAYS * MINUTES_PER_DAY) : this.said;
    const name = (x: string) => w.state.residents.find((o) => o.id === x)?.name ?? x;
    return { name: r.name, talks: talkOf(events, id, name, w.state) };
  }

  subscribe(fn: (u: Update) => void): () => void {
    return this.hub.subscribe(fn);
  }

  close(): void {
    this.hub.close();
  }
}

export interface ReplayOptions {
  speed?: number;
  now?: () => number;
  everyMs?: number;
  /** How often to look for new minutes in a trial that is still running. */
  growEveryMs?: number;
}

/** Jumps longer than this many minutes are drawn as a snap, not a walk. */
const MAX_WALKED_MINUTES = 120;

export const THOUGHTS_ONLY_NOTICE = 'This trial was recorded before movements were saved, so everyone is shown at home. The feed and cards show what they thought.';

/** A recorded trial, played back at a chosen speed. */
export class ReplaySource implements WatchSource {
  readonly mode = 'replay' as const;
  readonly reader: ReplayReader;
  private player: ReplayPlayer;
  private readonly hub: Hub;
  private readonly layout: Layout;
  private hasFrames: boolean;
  private readonly now: () => number;
  private readonly growEveryMs: number;
  private lastGrowCheck: number;

  constructor(reader: ReplayReader, opts: ReplayOptions = {}) {
    this.reader = reader;
    const info = reader.info();
    this.hasFrames = info.hasFrames;
    this.now = opts.now ?? Date.now;
    this.player = new ReplayPlayer(info, { now: this.now, speed: opts.speed ?? 60 });
    this.hub = new Hub(opts.everyMs ?? 150);
    this.layout = layoutOf(new World(createWorld(0, info.start)));
    this.growEveryMs = opts.growEveryMs ?? 2000;
    this.lastGrowCheck = this.now();
  }

  private msPerMinute(): number {
    return 60_000 / this.player.state().speed;
  }

  state(): ReplayState {
    const s = this.player.state();
    return { file: basename(this.reader.path), start: s.start, end: s.end, t: s.t, speed: s.speed, paused: s.paused, hasFrames: this.hasFrames };
  }

  /** Moves playback on; call it often (the server does, every 100 ms). */
  tick(): void {
    if (this.now() - this.lastGrowCheck >= this.growEveryMs) {
      this.lastGrowCheck = this.now();
      if (this.grow()) {
        this.hub.publish(this.jump(this.player.state().t));
        return;
      }
    }
    const step = this.player.tick();
    if (!step) return;
    const { from, to } = step;
    if (to - from > MAX_WALKED_MINUTES || to < from) {
      this.hub.publish(this.jump(to));
      return;
    }
    let u: Update | null = null;
    for (const frame of this.reader.framesBetween(from, to)) {
      const next: Update = { frame, feed: [] };
      u = u ? mergeUpdates(u, next) : next;
    }
    if (!u) return;
    u.feed = keepFeed(this.reader.feedBetween(from, to), FEED_KEPT);
    u.replay = this.state();
    this.hub.publish(u);
  }

  /**
   * Follows a trial that is still being written. Returns true when its first
   * minute has only just landed: the player is then set up afresh on the real
   * range, since the one guessed at opening started at 0.
   */
  private grow(): boolean {
    const info = this.reader.info();
    const firstFrames = info.hasFrames && !this.hasFrames;
    this.hasFrames = info.hasFrames;
    if (!firstFrames) {
      this.player.extend(info.end);
      return false;
    }
    const was = this.player.state();
    this.player = new ReplayPlayer(info, { now: this.now, speed: was.speed });
    if (was.paused) this.player.pause();
    return true;
  }

  private jump(t: number): Update {
    return {
      frame: this.reader.frameAt(t), feed: this.reader.feedUpTo(t, FEED_KEPT),
      snap: true, resetFeed: true, replay: this.state(), msPerMinute: this.msPerMinute(),
    };
  }

  control(cmd: ReplayCommand): ReplayState {
    if (cmd.speed !== undefined) this.player.setSpeed(cmd.speed);
    if (cmd.t !== undefined) this.player.seek(cmd.t);
    if (cmd.paused === true) this.player.pause();
    if (cmd.paused === false) {
      // A trial still being written may have grown since we caught up with it: follow it on.
      this.grow();
      this.player.play();
    }
    const state = this.state();
    if (cmd.t !== undefined || cmd.paused === false) this.hub.publish(this.jump(state.t));
    else {
      // Same minute, new clock: everyone stays put (their last steps are already walked).
      const f = this.reader.frameAt(state.t);
      const frame = { ...f, residents: f.residents.map((r) => ({ ...r, route: [{ x: r.x, y: r.y }] })) };
      this.hub.publish({ frame, feed: [], replay: state, msPerMinute: this.msPerMinute() });
    }
    return state;
  }

  hello(): Hello {
    const t = this.player.state().t;
    const info = this.reader.info();
    return {
      mode: 'replay',
      label: `Replay of ${info.label === 'a trial' ? basename(this.reader.path) : `${info.label} (${basename(this.reader.path)})`}`,
      version: VERSION,
      msPerMinute: this.msPerMinute(),
      layout: this.layout,
      frame: this.reader.frameAt(t),
      feed: this.reader.feedUpTo(t, FEED_KEPT),
      replay: this.state(),
      notice: this.hasFrames ? null : THOUGHTS_ONLY_NOTICE,
      calendar: this.reader.calendar().calendar,
    };
  }

  card(id: string): Card | null {
    const t = this.player.state().t;
    return cardOf(this.reader.frameAt(t), id, this.reader.extras(id, t));
  }

  placeCard(id: string): PlaceCard | null {
    return placeCardOf(this.reader.frameAt(this.player.state().t), this.layout, id);
  }

  wiki(): Wiki {
    const t = this.player.state().t;
    return wikiOf(this.reader.frameAt(t), this.layout, this.reader.moneyEvents(t - ECONOMY_DAYS * MINUTES_PER_DAY, t), this.reader.calendar(), {});
  }

  money(id: string): MoneyView | null {
    const t = this.player.state().t;
    const frame = this.reader.frameAt(t);
    return moneyOf(id, this.reader.moneyEvents(t - ECONOMY_DAYS * MINUTES_PER_DAY, t), { t, people: frame.residents, shops: shopsOf(frame, this.layout) }, this.reader.calendar());
  }

  talk(id: string): TalkView | null {
    const t = this.player.state().t;
    const r = this.reader.frameAt(t).residents.find((x) => x.id === id);
    if (!r) return null;
    return { name: r.name, talks: talkOf(this.reader.saidBy(id, t, TALK_LINES), id, (x) => this.reader.nameOf(x), this.reader.calendar()) };
  }

  subscribe(fn: (u: Update) => void): () => void {
    return this.hub.subscribe(fn);
  }

  close(): void {
    this.hub.close();
    this.reader.close();
  }
}
