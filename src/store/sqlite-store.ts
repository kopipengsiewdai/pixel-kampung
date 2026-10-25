import { closeSync, existsSync, fsyncSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GameEvent, LedgerEntry } from '../sim/events.ts';
import type { WorldState } from '../sim/state.ts';
import { SCHEMA_VERSION, UPGRADES, type SaveData, type Upgrade } from './upgrades.ts';

export { SCHEMA_VERSION };

export interface Saved {
  world: WorldState;
  brains: Record<string, unknown>;
}

export interface StoreOptions {
  /** Hears what happens when an older save is upgraded. */
  log?: (line: string) => void;
  /** The upgrade steps (tests only; the code's own are UPGRADES). */
  upgrades?: readonly Upgrade[];
}

/** The save was written by newer code than this: starting would risk overwriting it. */
export class SaveTooNewError extends Error {
  readonly found: number;
  readonly known: number;

  constructor(path: string, found: number, known: number) {
    super(
      `The town in ${path} was saved by a newer Pixel Kampung (save v${found}; this code knows up to v${known}).\n`
      + 'Not starting, so nothing in it is overwritten. Run the newer code again; going back to an older\n'
      + "save's backup (kampung.db.bak-v...) is a reset, and only the owner decides that.",
    );
    this.name = 'SaveTooNewError';
    this.found = found;
    this.known = known;
  }
}

/**
 * One SQLite file under KAMPUNG_HOME: the latest world snapshot, the brains'
 * saved state, the append-only event log and the money ledger (and, for a
 * thinking town, the residents' memories). Every save is one transaction, so
 * a crash leaves the last whole minute on disk.
 *
 * Opening an older save upgrades it first (backed up beside it, then every
 * step in one transaction); a save from newer code is refused untouched.
 */
export class SqliteStore {
  private db: DatabaseSync;

  constructor(path: string, opts: StoreOptions = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const upgrades = opts.upgrades ?? UPGRADES;
    const current = upgrades.length + 1;
    // Looked at read-only first, so a save from newer code is left exactly as it is.
    const found = path === ':memory:' || !existsSync(path) ? null : peekVersions(path);
    if (found && Math.max(found.tables ?? 0, found.world ?? 0) > current) {
      throw new SaveTooNewError(path, Math.max(found.tables ?? 0, found.world ?? 0), current);
    }
    this.db = new DatabaseSync(path);
    try {
      if (found && ((found.tables !== null && found.tables < current) || (found.world !== null && found.world < current))) {
        upgrade(this.db, path, found, current, upgrades, opts.log ?? (() => {}));
      }
      // Today's tables, for a new file. An older save got its tables from the steps above.
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
      this.db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema', String(current));
    } catch (err) {
      this.db.close();
      throw err;
    }
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

  /** The last `limit` events, oldest first (the watch page's feed after a restart). */
  recentEvents(limit: number): GameEvent[] {
    const rows = this.db.prepare('SELECT data FROM events ORDER BY seq DESC LIMIT ?').all(limit) as { data: string }[];
    return rows.reverse().map((r) => JSON.parse(r.data) as GameEvent);
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

/**
 * A save's versions: its tables' (the meta table's `schema`) and its saved
 * world's. They only differ if code from before 0.9.0, which doesn't check,
 * went on saving the world into a file that had already been upgraded.
 */
interface Versions {
  tables: number | null;
  world: number | null;
  /** The saved minute, which tells two saves at the same versions apart. */
  t: number | null;
}

function readVersions(db: DatabaseSync): Versions {
  const has = (name: string) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
  const num = (raw: unknown, what: string) => {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 1) throw new Error(`The save's ${what} version (${String(raw)}) makes no sense; not starting.`);
    return v;
  };
  const meta = has('meta') ? db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | undefined : undefined;
  const snap = has('snapshot') ? db.prepare('SELECT t, world FROM snapshot WHERE id = 1').get() as { t: number; world: string } | undefined : undefined;
  return {
    tables: meta ? num(meta.value, 'file') : null,
    world: snap ? num((JSON.parse(snap.world) as { version?: unknown }).version, 'world') : null,
    t: snap ? snap.t : null,
  };
}

function openReadOnly(path: string): DatabaseSync {
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch (err) {
    throw new Error(`The save at ${path} couldn't be read without writing to it (${err instanceof Error ? err.message : String(err)}). Not starting, so nothing in it is touched.`);
  }
}

/** Reads the versions without writing anything (no checkpoint, no journal change), or refuses. */
function peekVersions(path: string): Versions {
  const db = openReadOnly(path);
  try {
    return readVersions(db);
  } finally {
    db.close();
  }
}

/**
 * What a save holds, in brief: its versions, the saved world and brains word
 * for word, and how many rows each other table has and its newest one. A
 * memory or event written within the same minute, or a different town that
 * happens to share the minute, makes it differ.
 */
function contentsOf(db: DatabaseSync): string {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  const parts: unknown[] = [readVersions(db)];
  for (const { name } of tables) {
    if (name === 'snapshot') parts.push(db.prepare('SELECT world, brains FROM snapshot WHERE id = 1').get() ?? null);
    else parts.push([name, db.prepare(`SELECT count(*) AS n, max(rowid) AS last FROM "${name}"`).get()]);
  }
  return JSON.stringify(parts);
}

/** Whether the file at p is a whole copy of this very save, as it stands now. */
function isBackupOf(p: string, contents: string): boolean {
  try {
    const db = openReadOnly(p);
    try {
      const ok = (db.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check === 'ok';
      return ok && contentsOf(db) === contents;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/**
 * Where the backup goes: kampung.db.bak-v1, then kampung.db.bak-v1.2, ...
 * A backup of this very save, left by an earlier try whose upgrade failed, is
 * reused rather than copied again (a town restarted after each failure would
 * otherwise pile up copies). Any other backup is never overwritten.
 */
function backupFor(path: string, from: number, contents: string): { path: string; reused: boolean } {
  const base = `${path}.bak-v${from}`;
  let p = base;
  for (let n = 2; existsSync(p); n++) {
    if (isBackupOf(p, contents)) return { path: p, reused: true };
    p = `${base}.${n}`;
  }
  return { path: p, reused: false };
}

/**
 * Backs the save up as it stands (a whole copy, never overwriting an older
 * backup), then runs every step up to `to` in one transaction: the world and
 * brains from the world's version, the tables from the file's. On any error
 * nothing changes and the save stays at its old version.
 */
function upgrade(db: DatabaseSync, path: string, found: Versions, to: number, steps: readonly Upgrade[], log: (line: string) => void): void {
  const from = Math.min(found.tables ?? to, found.world ?? to);
  const contents = contentsOf(db);
  const { path: backup, reused } = backupFor(path, from, contents);
  if (!reused) {
    db.prepare('VACUUM INTO ?').run(backup);
    // VACUUM INTO doesn't flush its copy: make sure it's on disk, and whole, before touching the save.
    const fd = openSync(backup, 'r+');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (!isBackupOf(backup, contents)) throw new Error(`The backup at ${backup} didn't come out right; nothing was changed. Not starting.`);
  }
  log(`Upgrading the saved town from v${from} to v${to}; the old save is backed up at ${backup}${reused ? ' (kept from an earlier try)' : ''}.`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const now = readVersions(db);
    if (now.tables !== found.tables || now.world !== found.world || now.t !== found.t) {
      throw new Error('The save changed while it was being upgraded: is another Pixel Kampung running on it? Nothing was changed. Stop the other one and start again.');
    }
    const row = db.prepare('SELECT world, brains FROM snapshot WHERE id = 1').get() as { world: string; brains: string } | undefined;
    let save: SaveData | null = row ? { world: JSON.parse(row.world), brains: JSON.parse(row.brains) } : null;
    for (let v = from; v < to; v++) {
      const step = steps.find((s) => s.from === v);
      if (!step) throw new Error(`No upgrade step from save v${v}; not starting.`);
      if (save && found.world !== null && v >= found.world) {
        if (step.save) save = step.save(structuredClone(save));
        save.world.version = v + 1;
      }
      if (found.tables !== null && v >= found.tables) step.tables?.(db);
      log(`  v${v} → v${v + 1}: ${step.why}`);
    }
    if (save) db.prepare('UPDATE snapshot SET world = ?, brains = ? WHERE id = 1').run(JSON.stringify(save.world), JSON.stringify(save.brains));
    if (found.tables !== null) db.prepare("UPDATE meta SET value = ? WHERE key = 'schema'").run(String(to));
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // SQLite already rolled back by itself (disk full, I/O error): the first error is the one that matters.
    }
    throw err;
  }
}
