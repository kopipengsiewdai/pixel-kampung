/**
 * Trials record what the watch page needs to play them back: a frame a
 * minute (gzipped JSON), every event, and a little meta, in the trial's own
 * SQLite file under KAMPUNG_HOME/trials/, next to the residents' memories.
 * The reader opens that file read-only, even while the trial is still going.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { feedLine, keepFeed, type FeedLine } from '../feed/feed.ts';
import type { MemoryKind } from '../mind/memory.ts';
import type { GameEvent } from '../sim/events.ts';
import { createWorld } from '../sim/seed.ts';
import { World } from '../sim/state.ts';
import { shortStamp, type Calendar } from '../sim/calendar.ts';
import { dayIndex } from '../sim/time.ts';
import type { TownOptions } from '../town.ts';
import type { Frame, Thought } from './types.ts';
import { FrameBuilder, type CardExtras } from './view.ts';

export class ReplayRecorder {
  private db: DatabaseSync;
  private pending: GameEvent[] = [];
  private named = false;

  constructor(path: string, meta: { seed: number; label: string }) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS replay_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS replay_frames (t INTEGER PRIMARY KEY, data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS replay_events (seq INTEGER PRIMARY KEY, t INTEGER NOT NULL, data TEXT NOT NULL);
    `);
    const put = this.db.prepare('INSERT OR REPLACE INTO replay_meta (key, value) VALUES (?, ?)');
    put.run('version', '1');
    put.run('seed', String(meta.seed));
    put.run('label', meta.label);
  }

  event(e: GameEvent): void {
    this.pending.push(e);
  }

  /** Saves a frame with the events since the last one, in one transaction. */
  frame(f: Frame): void {
    const events = this.pending;
    this.pending = [];
    this.db.exec('BEGIN');
    try {
      if (!this.named) {
        this.named = true;
        const names = Object.fromEntries(f.residents.map((r) => [r.id, r.name]));
        this.db.prepare('INSERT OR REPLACE INTO replay_meta (key, value) VALUES (?, ?)').run('names', JSON.stringify(names));
      }
      this.db.prepare('INSERT OR REPLACE INTO replay_frames (t, data) VALUES (?, ?)').run(f.t, gzipSync(JSON.stringify(f)));
      const put = this.db.prepare('INSERT OR REPLACE INTO replay_events (seq, t, data) VALUES (?, ?, ?)');
      for (const e of events) put.run(e.seq, e.t, JSON.stringify(e));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  close(): void {
    this.db.close();
  }
}

/** Town hooks that record into `recorder`. */
export function recordTown(recorder: ReplayRecorder): Pick<TownOptions, 'onEvent' | 'onTick'> {
  const frames = new FrameBuilder();
  return {
    onEvent: (e) => recorder.event(e),
    onTick: (w) => recorder.frame(frames.build(w)),
  };
}

export interface ReplayInfo {
  label: string;
  start: number;
  end: number;
  /** False for a trial recorded before movements were saved. */
  hasFrames: boolean;
  hasMemories: boolean;
  names: Record<string, string>;
}

const THOUGHT_KINDS: MemoryKind[] = ['thought', 'reflection'];
const PLAN_PREFIX = /^My plan for today:\s*/;
const SHOWN = 6;
/** Trials start from the default cast; ids and names don't depend on the seed. */
const CAST_NAMES: Record<string, string> = Object.fromEntries(createWorld(0, 0).residents.map((r) => [r.id, r.name]));

function hasTable(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

interface MemoryRow { id: number; resident: string; t: number; kind: string; text: string }

function thought(m: { t: number; kind: string; text: string }, cal: { calendar: Calendar }): Thought {
  return { t: m.t, stamp: shortStamp(cal, m.t), kind: m.kind, text: m.kind === 'plan' ? m.text.replace(PLAN_PREFIX, '') : m.text };
}

/**
 * What a resident's mind has been up to, from a memory stream, up to minute t:
 * today's plan, the last few thoughts, and what they noticed lately.
 */
export function extrasFrom(
  latest: (resident: string, kinds: readonly string[], upTo: number, n: number) => { t: number; kind: string; text: string }[],
  id: string,
  t: number,
  cal: { calendar: Calendar },
): CardExtras {
  const plan = latest(id, ['plan'], t, 1)[0];
  const thoughts = latest(id, THOUGHT_KINDS, t, SHOWN).reverse().map((m) => thought(m, cal));
  const noticed = latest(id, ['noticed'], t, SHOWN).reverse().map((m) => thought(m, cal));
  const todays = plan && dayIndex(plan.t) === dayIndex(t) ? thought(plan, cal) : null;
  const hasMind = thoughts.length > 0 || plan !== undefined;
  return {
    plan: todays,
    thoughts,
    noticed,
    mindNote: hasMind ? null : 'No thoughts recorded: this resident ran on the free fake brain.',
  };
}

export class ReplayReader {
  readonly path: string;
  private db: DatabaseSync;
  private frames: boolean;
  private memories: boolean;
  private names: Record<string, string>;
  private label: string;
  private fallback: Frame | null = null;

  constructor(path: string) {
    this.path = path;
    this.db = new DatabaseSync(path, { readOnly: true });
    this.frames = hasTable(this.db, 'replay_frames') && this.db.prepare('SELECT 1 FROM replay_frames LIMIT 1').get() !== undefined;
    this.memories = hasTable(this.db, 'memories');
    const meta = hasTable(this.db, 'replay_meta')
      ? Object.fromEntries((this.db.prepare('SELECT key, value FROM replay_meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]))
      : {};
    this.names = meta.names ? JSON.parse(meta.names) as Record<string, string> : CAST_NAMES;
    this.label = meta.label ?? 'a trial';
  }

  info(): ReplayInfo {
    // Opened before the trial's first frame landed? Look again.
    if (!this.frames && hasTable(this.db, 'replay_frames')) {
      this.frames = this.db.prepare('SELECT 1 FROM replay_frames LIMIT 1').get() !== undefined;
      if (this.frames) this.fallback = null;
    }
    let start = 0;
    let end = 0;
    if (this.frames) {
      const row = this.db.prepare('SELECT MIN(t) AS lo, MAX(t) AS hi FROM replay_frames').get() as { lo: number; hi: number };
      start = row.lo;
      end = row.hi;
    } else if (this.memories) {
      const row = this.db.prepare('SELECT MIN(t) AS lo, MAX(t) AS hi FROM memories').get() as { lo: number | null; hi: number | null };
      start = (row.lo ?? 1) - 1;
      end = row.hi ?? start;
    }
    return { label: this.label, start, end, hasFrames: this.frames, hasMemories: this.memories, names: { ...this.names } };
  }

  private decode(row: { data: Uint8Array } | undefined): Frame | null {
    return row ? JSON.parse(gunzipSync(row.data).toString('utf8')) as Frame : null;
  }

  /** The frame at minute t (the nearest recorded one at or before it, else the first). */
  frameAt(t: number): Frame {
    if (!this.frames) return this.thoughtsOnlyFrame(t);
    const at = this.decode(this.db.prepare('SELECT data FROM replay_frames WHERE t <= ? ORDER BY t DESC LIMIT 1').get(t) as { data: Uint8Array } | undefined);
    return at ?? this.decode(this.db.prepare('SELECT data FROM replay_frames ORDER BY t LIMIT 1').get() as { data: Uint8Array })!;
  }

  /** Every recorded frame after t0, up to and including t1. */
  framesBetween(t0: number, t1: number): Frame[] {
    if (!this.frames) return [this.thoughtsOnlyFrame(t1)];
    const rows = this.db.prepare('SELECT data FROM replay_frames WHERE t > ? AND t <= ? ORDER BY t').all(t0, t1) as { data: Uint8Array }[];
    return rows.map((r) => this.decode(r)!);
  }

  private name = (id: string): string => this.names[id] ?? id;

  /** Feed lines after t0, up to and including t1, in order. */
  feedBetween(t0: number, t1: number): FeedLine[] {
    if (!this.frames) return this.memoryFeed('WHERE t > ? AND t <= ? ORDER BY t, id', [t0, t1]);
    const rows = this.db.prepare('SELECT data FROM replay_events WHERE t > ? AND t <= ? ORDER BY seq').all(t0, t1) as { data: string }[];
    return rows.map((r) => feedLine(JSON.parse(r.data) as GameEvent, this.name)).filter((l): l is FeedLine => l !== null);
  }

  /** The last n feed lines at or before t, and enough key moments before them to fill n (keepFeed). */
  feedUpTo(t: number, n: number): FeedLine[] {
    let out: FeedLine[] = [];
    // Events outnumber feed lines (arrivals, wakings), and lines outnumber key moments: read back in growing windows.
    for (let span = 120; out.length < n || out.filter((l) => l.key).length < n; span *= 4) {
      out = keepFeed(this.feedBetween(t - span, t), n);
      if (t - span < this.info().start) break;
    }
    return out;
  }

  /** The last n lines a resident said or had said to them, at or before t, newest first. */
  saidBy(id: string, t: number, n: number): GameEvent[] {
    if (!this.frames) return [];
    const rows = this.db.prepare(
      "SELECT data FROM replay_events WHERE t <= ? AND json_extract(data, '$.type') = 'said' AND (json_extract(data, '$.who') = ? OR json_extract(data, '$.to') = ?) ORDER BY seq DESC LIMIT ?",
    ).all(t, id, id, n) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as GameEvent);
  }

  nameOf(id: string): string {
    return this.name(id);
  }

  /** The trial's calendar: a trial is a new town, so its 1 January is the day it started. */
  calendar(): { calendar: Calendar } {
    return { calendar: { firstDay: dayIndex(this.info().start) } };
  }

  extras(id: string, t: number): CardExtras {
    if (!this.memories) return { plan: null, thoughts: [], noticed: [], mindNote: 'This trial kept no thoughts.' };
    return extrasFrom((resident, kinds, upTo, n) => this.db
      .prepare(`SELECT id, resident, t, kind, text FROM memories WHERE resident = ? AND t <= ? AND kind IN (${kinds.map(() => '?').join(',')}) ORDER BY t DESC, id DESC LIMIT ?`)
      .all(resident, upTo, ...kinds, n) as unknown as MemoryRow[], id, t, this.calendar());
  }

  private memoryFeed(where: string, args: number[]): FeedLine[] {
    if (!this.memories) return [];
    const rows = this.db.prepare(`SELECT id, resident, t, kind, text FROM memories ${where.replace('WHERE', "WHERE kind IN ('plan', 'thought', 'reflection') AND")}`)
      .all(...args) as unknown as MemoryRow[];
    return rows.map((m) => {
      const who = this.name(m.resident);
      const text = m.kind === 'plan' ? `${who} plans: "${m.text.replace(PLAN_PREFIX, '')}"`
        : m.kind === 'reflection' ? `${who} looks back on the day: "${m.text}"`
          : `${who} thinks: "${m.text}"`;
      return { t: m.t, seq: m.id, text, notable: m.kind === 'reflection', key: m.kind === 'reflection' };
    });
  }

  /** A trial from before movements were saved: everyone as they started, at home. */
  private thoughtsOnlyFrame(t: number): Frame {
    if (!this.fallback) {
      const w = new World(createWorld(42, this.info().start));
      const f = new FrameBuilder().build(w);
      for (const r of f.residents) r.doing = 'not recorded in this trial (shown as the town started)';
      this.fallback = f;
    }
    // The trial's own calendar, from its first day, so the date moves on as it plays.
    const w = new World({ ...createWorld(42, t), calendar: createWorld(42, this.info().start).calendar });
    const clock = new FrameBuilder().build(w);
    return { ...this.fallback, t, stamp: clock.stamp, clock: clock.clock, minuteOfDay: clock.minuteOfDay, lorryHere: false };
  }

  close(): void {
    this.db.close();
  }
}
