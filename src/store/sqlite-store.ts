import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GameEvent, LedgerEntry } from '../sim/events.ts';
import type { WorldState } from '../sim/state.ts';

export const SCHEMA_VERSION = 1;

export interface Saved {
  world: WorldState;
  brains: Record<string, unknown>;
}

/**
 * One SQLite file under KAMPUNG_HOME: the latest world snapshot, the brains'
 * saved state, the append-only event log and the money ledger. Every save is
 * one transaction, so a crash leaves the last whole minute on disk.
 */
export class SqliteStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        t INTEGER NOT NULL,
        world TEXT NOT NULL,
        brains TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY,
        t INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger (
        seq INTEGER PRIMARY KEY,
        t INTEGER NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        cents INTEGER NOT NULL,
        reason TEXT NOT NULL
      );
    `);
    this.db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema', String(SCHEMA_VERSION));
  }

  load(): Saved | null {
    const row = this.db.prepare('SELECT world, brains FROM snapshot WHERE id = 1').get() as
      { world: string; brains: string } | undefined;
    if (!row) return null;
    return { world: JSON.parse(row.world) as WorldState, brains: JSON.parse(row.brains) as Record<string, unknown> };
  }

  save(saved: Saved, events: readonly GameEvent[], ledger: readonly LedgerEntry[]): void {
    const putSnap = this.db.prepare(
      'INSERT INTO snapshot (id, t, world, brains) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET t = excluded.t, world = excluded.world, brains = excluded.brains',
    );
    const putEvent = this.db.prepare('INSERT INTO events (seq, t, type, data) VALUES (?, ?, ?, ?)');
    const putLedger = this.db.prepare('INSERT INTO ledger (seq, t, from_id, to_id, cents, reason) VALUES (?, ?, ?, ?, ?, ?)');
    this.db.exec('BEGIN');
    try {
      putSnap.run(saved.world.t, JSON.stringify(saved.world), JSON.stringify(saved.brains));
      for (const e of events) putEvent.run(e.seq, e.t, e.type, JSON.stringify(e));
      for (const l of ledger) putLedger.run(l.seq, l.t, l.from, l.to, l.cents, l.reason);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  events(afterSeq = 0, limit = 1_000_000): GameEvent[] {
    const rows = this.db.prepare('SELECT data FROM events WHERE seq > ? ORDER BY seq LIMIT ?').all(afterSeq, limit) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as GameEvent);
  }

  ledger(): LedgerEntry[] {
    const rows = this.db.prepare('SELECT seq, t, from_id, to_id, cents, reason FROM ledger ORDER BY seq').all() as
      { seq: number; t: number; from_id: string; to_id: string; cents: number; reason: string }[];
    return rows.map((r) => ({ seq: r.seq, t: r.t, from: r.from_id, to: r.to_id, cents: r.cents, reason: r.reason }));
  }

  close(): void {
    this.db.close();
  }
}
