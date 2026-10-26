import type { Brain } from './brain/brain.ts';
import { FakeBrain } from './brain/fake-brain.ts';
import { act, verbOf, type Intent } from './sim/actions/index.ts';
import { isStaffed } from './sim/actions/everyone.ts';
import { kinOf } from './seed/cast.ts';
import { DEFAULT_DIALS, type Dials } from './sim/dials.ts';
import type { EventBody, GameEvent, LedgerEntry } from './sim/events.ts';
import { ITEMS, type ItemId } from './sim/items.ts';
import { PLACE_BY_ID, PLACES } from './sim/map.ts';
import { HUNGRY_FROM, perceive, type Perception } from './sim/perception.ts';
import { createWorld } from './sim/seed.ts';
import { MAX_REPLAY_MINUTES, skipQuietly } from './sim/skip.ts';
import { World, type Resident, type WorldState } from './sim/state.ts';
import { advance } from './sim/tick.ts';
import { osmanThinks, type OsmanHead } from './sim/osman.ts';
import { isNight, minuteOfDay, realMsAt } from './sim/time.ts';
import type { SqliteStore } from './store/sqlite-store.ts';
import { SCHEMA_VERSION } from './store/upgrades.ts';

/** A refused resident may try something else this many times in the same minute. */
export const TRIES_PER_THOUGHT = 3;
/**
 * With nothing happening, a resident thinks again after this many game
 * minutes (about 2 real minutes). On the kampung clock residents think about half as
 * often per game hour as they did at real time, to stay within the same real
 * budget (owner: "4x clock, think less"). With a game day every five real
 * hours, the same real budget stretches over a sixth more game time, so
 * residents short of thinking money think about a sixth less per game hour
 * (owner: accepted).
 */
export const QUIET_THINK_MINUTES = 10;
/** After something they did goes through, the next thought comes this many game minutes later (being spoken to still wakes them the next minute). */
export const AFTER_ACTION_MINUTES = 2;
/**
 * Doing the very same thing again within this many minutes of last doing it
 * doesn't bring the next thought on (a resident could otherwise loop on it,
 * every minute, and never get round to anyone waiting on them).
 */
export const REPEAT_MINUTES = QUIET_THINK_MINUTES;
export const REPEAT_NUDGE = "You've just done that.";
/** Pottering about with nothing done for this many quiet thoughts running, a resident is reminded of places they could go. */
export const POTTERS_BEFORE_NUDGE = 3;

/**
 * Pottering about again. Once nothing has been done for POTTERS_BEFORE_NUDGE
 * quiet thoughts, they're reminded, in-world, of places they could go. Read
 * from when they last did something (saved), so a restart changes nothing.
 */
function pottered(w: World, r: Resident, p: Perception): void {
  // Busy (walking, fishing, on shift, asleep) or minding their own shop: waiting is what they're doing.
  if (r.activity) return;
  const own = w.shopOf(r.id);
  if (own && p.placeId === own.id) return;
  // Hungry, with nothing in hand to eat: where food is sold comes first, at once.
  if (r.hunger >= HUNGRY_FROM && !Object.keys(r.items).some((i) => ITEMS[i as ItemId].food && (r.items[i as ItemId] ?? 0) > 0)) {
    const food = w.state.shops.filter((s) => s.id !== p.placeId && r.knownPlaces.includes(s.id) && isStaffed(w, s)
      && (Object.entries(s.sellPrices) as [ItemId, number][]).some(([i, price]) => ITEMS[i].food && (s.stock[i] ?? 0) > 0 && price <= r.money))
      .map((s) => w.placeName(PLACE_BY_ID.get(s.id)!));
    if (food.length) {
      const list = food.length === 1 ? food[0]! : `${food.slice(0, -1).join(', ')} or ${food.at(-1)}`;
      r.reply = { ok: true, text: `You're hungry. You could get something to eat at ${list}.` };
      return;
    }
    // Nobody serving: family in another house, then the sea.
    const kin = kinOf(r.id).find((k) => w.state.residents.some((o) => o.id === k.id && o.homeId !== r.homeId) && w.knowsPerson(r, k.id));
    // Kin and the sea in turn, one quiet thought each: an aunt may be as hungry as you.
    const jetty = p.placeId !== 'jetty' && r.knownPlaces.includes('jetty');
    if (kin && (!jetty || Math.floor(w.t / QUIET_THINK_MINUTES) % 2 === 0)) {
      r.reply = { ok: true, text: `You're hungry. You could ask your ${kin.word} ${w.resident(kin.id).name} for something to eat.` };
      return;
    }
    if (jetty) {
      r.reply = { ok: true, text: "You're hungry. You could catch a fish at the jetty." };
      return;
    }
  }
  if (r.lastDone && w.t - r.lastDone.t < POTTERS_BEFORE_NUDGE * QUIET_THINK_MINUTES) return;
  // Places they know with something to do there first (the jetty, the farm plot), then one more, turning with the time.
  const known = PLACES.filter((pl) => pl.kind !== 'house' && pl.id !== p.placeId && r.knownPlaces.includes(pl.id));
  const work = known.filter((pl) => NUDGE_FIRST.includes(pl.id));
  const rest = known.filter((pl) => !NUDGE_FIRST.includes(pl.id));
  const places = [...work, ...(rest.length ? [rest[Math.floor(w.t / QUIET_THINK_MINUTES) % rest.length]!] : [])].map((pl) => pl.name);
  const list = places.length <= 1 ? places.join('') : `${places.slice(0, -1).join(', ')} or ${places.at(-1)}`;
  r.reply = { ok: true, text: places.length ? `There's nothing more to do here. You could walk to ${list}.` : "There's nothing more to do here. You could set off north, south, east or west." };
}

/** Places a nudge names first: there's always something to do at them. */
const NUDGE_FIRST = ['jetty', 'farm'];

/** The refusals (from personNearby and say) that asking again this minute can't change. */
const NOT_NEARBY = / isn't nearby\. /;
const SAID_ALL = / have said all there is to say\.$/;
const NOBODY_MINDING = /^Nobody's minding /;

/** The person an action is aimed at, lower-cased, if any. */
function personOf(i: Intent): string | null {
  const v = i.to ?? i.from ?? i.who;
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
}

/** A value with every object's keys in order, all the way down. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  return v;
}

/** The same intent, written the same way whatever order its parts came in (nested parts too: what's given in a trade). */
function sameness(i: Intent): string {
  return JSON.stringify(canon(i));
}

export type BrainFactory = (resident: Resident, index: number, seed: number, state: WorldState) => Brain;

export const fakeBrains: BrainFactory = (_r, index, seed) => new FakeBrain((seed * 7919 + index * 104729 + 1) >>> 0);

/**
 * Residents look back on the day once each evening: as they lie down after
 * 20:00, or at 22:30 if still up (everyone heads home at 23:00).
 */
export const EVENING_FROM = 20 * 60;
export const REFLECT_AT = 22 * 60 + 30;

export interface TownOptions {
  brains?: BrainFactory;
  store?: SqliteStore;
  /** Called with every new event, in order. */
  onEvent?: (e: GameEvent) => void;
  /** Hears every observation residents take in (a mind keeps them as memories). */
  observer?: (residentId: string, t: number, text: string) => void;
  /** Called after each saved minute, once its events are out (the watch page takes a frame here). */
  onTick?: (world: World) => void;
  /** For a new town: the real moment its first minute (t) stands for (default: t as real minutes). */
  anchorMs?: number;
  /** The owner's dials (src/sim/dials.ts); any left out keep their defaults. */
  dials?: Partial<Dials>;
  /** Pak Osman's bounded head (src/mind/osman-head.ts); without one he trades by his scripted ways. */
  osman?: OsmanHead | null;
}

/** The running kampung: world + brains + optional store, advanced a minute at a time. */
export class Town {
  readonly world: World;
  readonly brains: Map<string, Brain>;
  private store?: SqliteStore;
  private onEvent?: (e: GameEvent) => void;
  private onTick?: (world: World) => void;
  private osman: OsmanHead | null;

  private constructor(state: WorldState, opts: TownOptions, savedBrains?: Record<string, unknown>) {
    this.world = new World(state);
    this.world.observer = opts.observer ?? null;
    this.world.dials = { ...DEFAULT_DIALS, ...opts.dials };
    this.store = opts.store;
    this.onEvent = opts.onEvent;
    this.onTick = opts.onTick;
    this.osman = opts.osman ?? null;
    const make = opts.brains ?? fakeBrains;
    this.brains = new Map(state.residents.map((r, i) => [r.id, make(r, i, state.seed, state)]));
    if (savedBrains) for (const [id, b] of this.brains) if (savedBrains[id] !== undefined) b.load(savedBrains[id]);
  }

  /** A brand-new kampung whose first simulated minute is t + 1. */
  static create(seed: number, t: number, opts: TownOptions = {}): Town {
    const town = new Town(createWorld(seed, t, { anchorMs: opts.anchorMs }), opts);
    town.world.openBalances();
    town.flush();
    return town;
  }

  /** Picks up from the store's last save (upgraded when the store opened), or null if there's nothing saved. */
  static resume(opts: TownOptions & { store: SqliteStore }): Town | null {
    const saved = opts.store.load();
    if (!saved) return null;
    if (saved.world.version !== SCHEMA_VERSION) throw new Error(`The saved town is at version ${saved.world.version}, not ${SCHEMA_VERSION}; it must be upgraded first.`);
    return new Town(saved.world, opts, saved.brains);
  }

  static fromSnapshot(state: WorldState, brains: Record<string, unknown>, opts: TownOptions = {}): Town {
    return new Town(structuredClone(state), opts, structuredClone(brains));
  }

  get t(): number {
    return this.world.t;
  }

  saveBrains(): Record<string, unknown> {
    return Object.fromEntries([...this.brains].map(([id, b]) => [id, b.save()]));
  }

  snapshot(): { world: WorldState; brains: Record<string, unknown> } {
    return { world: this.world.snapshot(), brains: this.saveBrains() };
  }

  /** Simulates the next minute: the world moves, then awake idle residents think and act. */
  async step(): Promise<void> {
    const w = this.world;
    advance(w);
    const emit = (e: EventBody) => { w.emit(e); };
    const realMs = realMsAt(w.state.clock, w.t);
    const mod = minuteOfDay(w.t);
    // The lorry man answers before anyone thinks: his prices, his news, and any offer from last minute.
    await osmanThinks(w, this.osman, realMs);
    if (mod >= EVENING_FROM) {
      for (const r of w.state.residents) {
        const brain = this.brains.get(r.id)!;
        if (brain.reflect && (r.activity?.kind === 'sleeping' || mod >= REFLECT_AT)) {
          await brain.reflect(perceive(w, r), { t: w.t, realMs, residentId: r.id, emit });
        }
      }
    }
    if (!isNight(w.t)) {
      for (const r of w.state.residents) {
        if ((r.activity && r.activity.kind !== 'working') || r.stove || w.t < r.thinkAt) continue;
        const brain = this.brains.get(r.id)!;
        r.thinkAt = w.t + QUIET_THINK_MINUTES;
        const absentBefore = !!r.reply && !r.reply.ok && NOT_NEARBY.test(r.reply.text);
        for (let i = 0; i < TRIES_PER_THOUGHT; i++) {
          const p = perceive(w, r);
          const intent = await brain.decide(p, { t: w.t, realMs, residentId: r.id, emit });
          r.reply = null;
          if (!intent) {
            if (i === 0) pottered(w, r, p);
            break;
          }
          const res = act(w, r.id, intent);
          r.reply = res.reply ? { ok: res.ok, text: res.reply } : null;
          if (!res.ok && personOf(intent) && NOT_NEARBY.test(res.reply ?? '')) {
            // Asking again this minute won't bring them back: think again shortly, with who is here in view
            // (at the quiet pace if they were already told last time).
            if (!absentBefore) r.thinkAt = Math.min(r.thinkAt, w.t + AFTER_ACTION_MINUTES);
            break;
          }
          // Two who have said all there is to say won't find more this minute either.
          if (!res.ok && (SAID_ALL.test(res.reply ?? '') || NOBODY_MINDING.test(res.reply ?? ''))) break;
          if (res.ok) {
            const what = sameness(intent);
            const before = r.lastDone;
            r.lastDone = { what, t: w.t };
            if (before?.what === what && w.t - before.t <= REPEAT_MINUTES) {
              // The same again: it goes through, but the next thought comes at the quiet pace.
              r.reply = { ok: true, text: r.reply ? `${r.reply.text} ${REPEAT_NUDGE}` : REPEAT_NUDGE };
            } else if (verbOf(intent) !== 'say' && verbOf(intent) !== 'look_around') {
              // A speaker waits for an answer: being spoken to wakes them (until the
              // chat has run long), so saying something never brings the next thought on.
              r.thinkAt = Math.min(r.thinkAt, w.t + AFTER_ACTION_MINUTES);
            }
            break;
          }
        }
      }
    }
    this.flush();
  }

  async runUntil(t: number): Promise<void> {
    while (this.world.t < t) await this.step();
  }

  /**
   * Brings the town up to `now` after it was stopped. A short gap is replayed;
   * a long one passes quietly in one jump, never replaying the missed hours.
   */
  async catchUp(now: number): Promise<void> {
    if (now - this.world.t > MAX_REPLAY_MINUTES) {
      skipQuietly(this.world, now - 1);
      this.flush();
    }
    await this.runUntil(now);
  }

  private flush(): void {
    const events = this.world.takeEvents();
    const ledger: LedgerEntry[] = this.world.takeLedger();
    if (this.store) this.store.save(this.snapshot(), events, ledger);
    if (this.onEvent) for (const e of events) this.onEvent(e);
    this.onTick?.(this.world);
  }
}
