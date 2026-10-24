import type { Brain } from './brain/brain.ts';
import { FakeBrain } from './brain/fake-brain.ts';
import { act } from './sim/actions/index.ts';
import type { EventBody, GameEvent, LedgerEntry } from './sim/events.ts';
import { perceive } from './sim/perception.ts';
import { createWorld } from './sim/seed.ts';
import { MAX_REPLAY_MINUTES, skipQuietly } from './sim/skip.ts';
import { World, type Resident, type WorldState } from './sim/state.ts';
import { advance } from './sim/tick.ts';
import { isNight, minuteOfDay } from './sim/time.ts';
import type { SqliteStore } from './store/sqlite-store.ts';

/** A refused resident may try something else this many times in the same minute. */
export const TRIES_PER_THOUGHT = 3;
/** With nothing happening, a resident thinks again after this many minutes. */
export const QUIET_THINK_MINUTES = 5;

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
}

/** The running kampung: world + brains + optional store, advanced a minute at a time. */
export class Town {
  readonly world: World;
  readonly brains: Map<string, Brain>;
  private store?: SqliteStore;
  private onEvent?: (e: GameEvent) => void;
  private onTick?: (world: World) => void;

  private constructor(state: WorldState, opts: TownOptions, savedBrains?: Record<string, unknown>) {
    this.world = new World(state);
    this.world.observer = opts.observer ?? null;
    this.store = opts.store;
    this.onEvent = opts.onEvent;
    this.onTick = opts.onTick;
    const make = opts.brains ?? fakeBrains;
    this.brains = new Map(state.residents.map((r, i) => [r.id, make(r, i, state.seed, state)]));
    if (savedBrains) for (const [id, b] of this.brains) if (savedBrains[id] !== undefined) b.load(savedBrains[id]);
  }

  /** A brand-new kampung whose first simulated minute is t + 1. */
  static create(seed: number, t: number, opts: TownOptions = {}): Town {
    const town = new Town(createWorld(seed, t), opts);
    town.flush();
    return town;
  }

  /** Picks up from the store's last save, or null if there's nothing saved. */
  static resume(opts: TownOptions & { store: SqliteStore }): Town | null {
    const saved = opts.store.load();
    return saved ? new Town(saved.world, opts, saved.brains) : null;
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
    const mod = minuteOfDay(w.t);
    if (mod >= EVENING_FROM) {
      for (const r of w.state.residents) {
        const brain = this.brains.get(r.id)!;
        if (brain.reflect && (r.activity?.kind === 'sleeping' || mod >= REFLECT_AT)) {
          await brain.reflect(perceive(w, r), { t: w.t, residentId: r.id, emit });
        }
      }
    }
    if (!isNight(w.t)) {
      for (const r of w.state.residents) {
        if ((r.activity && r.activity.kind !== 'working') || w.t < r.thinkAt) continue;
        const brain = this.brains.get(r.id)!;
        r.thinkAt = w.t + QUIET_THINK_MINUTES;
        for (let i = 0; i < TRIES_PER_THOUGHT; i++) {
          const intent = await brain.decide(perceive(w, r), { t: w.t, residentId: r.id, emit });
          r.reply = null;
          if (!intent) break;
          const res = act(w, r.id, intent);
          r.reply = res.reply ? { ok: res.ok, text: res.reply } : null;
          if (res.ok) {
            r.thinkAt = Math.min(r.thinkAt, w.t + 1);
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
