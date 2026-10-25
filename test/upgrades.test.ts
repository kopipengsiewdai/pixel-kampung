import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SIM_START } from '../src/cli/start.ts';
import { CostLog } from '../src/mind/cost-log.ts';
import { FakeModel } from '../src/mind/fake-model.ts';
import { MemoryStore } from '../src/mind/memory.ts';
import { Mind } from '../src/mind/mind.ts';
import { mindBrains } from '../src/mind/setup.ts';
import { CARDS } from '../src/seed/cards.ts';
import { createWorld } from '../src/sim/seed.ts';
import type { WorldState } from '../src/sim/state.ts';
import { SaveTooNewError, SqliteStore } from '../src/store/sqlite-store.ts';
import { SCHEMA_VERSION, UPGRADES, type SaveData, type Upgrade } from '../src/store/upgrades.ts';
import { Town, fakeBrains } from '../src/town.ts';
import { dumpSql, FIXTURE_DIR, fixtureShape, fixtureSql, fixtureUpgraded, freshTables, loadSql, misfits, peek, saveShape, tablesOf, upgradedHeader, upgradeOneStep } from './saves.ts';

const dirs: string[] = [];
function savePath(): string {
  const d = mkdtempSync(join(tmpdir(), 'kampung-upgrade-'));
  dirs.push(d);
  return join(d, 'kampung.db');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const VERSIONS = Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1);
const HOW = 'see docs/design/upgrades.md';

function schemaOf(path: string): number {
  return Number(peek<{ value: string }>(path, "SELECT value FROM meta WHERE key = 'schema'").value);
}

function savedOf(path: string): SaveData {
  const row = peek<{ world: string; brains: string }>(path, 'SELECT world, brains FROM snapshot WHERE id = 1');
  return { world: JSON.parse(row.world), brains: JSON.parse(row.brains) };
}

function step(from: number): Upgrade {
  return UPGRADES.find((u) => u.from === from)!;
}

function exec(path: string, sql: string): void {
  const db = new DatabaseSync(path);
  db.exec(sql);
  db.close();
}

const keys = (o: object) => Object.keys(o).sort();

describe('the upgrade registry', () => {
  it('runs in order, one version at a time, and sets the code\'s version', () => {
    expect(UPGRADES.map((u) => u.from)).toEqual(VERSIONS.slice(0, -1));
    expect(SCHEMA_VERSION).toBe(UPGRADES.length + 1);
    for (const u of UPGRADES) expect(u.why.length, `step ${u.from}`).toBeGreaterThan(10);
  });

  it('every version has a frozen fixture save and its recorded shape', () => {
    for (const v of VERSIONS) {
      expect(existsSync(fixtureSql(v)), `test/fixtures/saves/v${v}.sql is missing: ${HOW}`).toBe(true);
      expect(existsSync(fixtureShape(v)), `test/fixtures/saves/v${v}.shape.txt is missing: ${HOW}`).toBe(true);
      if (v < SCHEMA_VERSION) expect(existsSync(fixtureUpgraded(v)), `test/fixtures/saves/v${v}.upgraded.sql is missing: ${HOW}`).toBe(true);
    }
    const names = readdirSync(FIXTURE_DIR).filter((n) => /^v\d+\./.test(n));
    for (const n of names) expect(VERSIONS, `${n} is for a version the code doesn't have`).toContain(Number(/^v(\d+)/.exec(n)![1]));
  });

  it("what a save holds (world, brains, tables) hasn't changed without a new version and an upgrade step", () => {
    const recorded = readFileSync(fixtureShape(SCHEMA_VERSION), 'utf8');
    expect(saveShape(), `What gets saved changed but the save version is still ${SCHEMA_VERSION}. Add an upgrade step, then its fixtures: ${HOW}`).toBe(recorded);
  });

  it('every shipped step still does exactly what it did when it shipped', () => {
    for (const v of VERSIONS.slice(0, -1)) {
      const path = savePath();
      upgradeOneStep(v, path, UPGRADES);
      expect(dumpSql(path, upgradedHeader(v)), `the v${v} → v${v + 1} step changed after it shipped; fix mistakes with a new step: ${HOW}`)
        .toBe(readFileSync(fixtureUpgraded(v), 'utf8'));
    }
  });

  it('a fresh town is saved at the current version', () => {
    expect(createWorld(1, 0).version).toBe(SCHEMA_VERSION);
    const path = savePath();
    const store = new SqliteStore(path);
    Town.create(1, 100, { store });
    store.close();
    expect(schemaOf(path)).toBe(SCHEMA_VERSION);
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-'))).toEqual([]);
  });
});

describe.each(VERSIONS)('a town saved at v%i', (v) => {
  it('is upgraded to the current version, keeps its memories, and runs on', async () => {
    const path = savePath();
    loadSql(fixtureSql(v), path);
    const before = savedOf(path);
    const lines: string[] = [];
    const store = new SqliteStore(path, { log: (l) => lines.push(l) });
    expect(schemaOf(path)).toBe(SCHEMA_VERSION);

    const backup = `${path}.bak-v${v}`;
    if (v < SCHEMA_VERSION) {
      expect(existsSync(backup)).toBe(true);
      expect(schemaOf(backup)).toBe(v);
      expect(savedOf(backup)).toEqual(before);
      expect(peek<{ n: number }>(backup, 'SELECT count(*) AS n FROM memories').n).toBe(3);
      expect(lines.join('\n')).toContain(`v${v} to v${SCHEMA_VERSION}`);
      expect(lines.join('\n')).toContain(backup);
    } else {
      expect(existsSync(backup)).toBe(false);
      expect(savedOf(path)).toEqual(before);
      expect(lines).toEqual([]);
    }

    // Everything a fresh town saves, the upgraded one has too.
    const saved = store.load()!;
    const fresh = createWorld(1, saved.world.t);
    expect(saved.world.version).toBe(SCHEMA_VERSION);
    expect(keys(saved.world)).toEqual(keys(fresh));
    for (const r of saved.world.residents) expect(keys(r), r.id).toEqual(keys(fresh.residents[0]!));
    for (const s of saved.world.shops) expect(keys(s), s.id).toEqual(keys(fresh.shops[0]!));
    // ...at every depth, brains included, and its tables are the ones a fresh save gets.
    expect(misfits(saved)).toEqual([]);
    expect(tablesOf(path)).toEqual(freshTables());

    const town = Town.resume({ store })!;
    const t0 = town.t;
    await town.runUntil(t0 + 30);
    expect(town.t).toBe(t0 + 30);
    store.close();

    const memory = new MemoryStore(path);
    expect(['ah-huat', 'siti', 'raju'].map((id) => memory.all(id).length)).toEqual([1, 1, 1]);
    memory.close();
  });
});

describe('the guard itself', () => {
  it('names any value that does not fit today\'s saved types, at any depth, brains included', () => {
    const path = savePath();
    loadSql(fixtureSql(SCHEMA_VERSION), path);
    const save = savedOf(path);
    expect(misfits(save)).toEqual([]);
    const w = save.world as unknown as WorldState;
    delete (w.beds[2] as Partial<WorldState['beds'][number]>).wateredDays;
    (w.residents[1]!.recent as unknown[]).push({ t: 1, text: 'hi', talk: 'true' }); // a flag saved as text
    (w.talk as Record<string, unknown>)['a|b'] = { lines: 'two', lastT: 3 };
    (save.brains['siti'] as Record<string, unknown>).mood = 'cheerful';
    expect(misfits(save)).toEqual(expect.arrayContaining([
      'world.beds[2].wateredDays: missing',
      expect.stringMatching(/^world\.residents\[1\]\.recent\[\d+\]\.talk: /),
      expect.stringMatching(/^world\.talk\["a\|b"\]\.lines: /),
      expect.stringMatching(/^brains\.siti/),
    ]));
  });

  it("checks a thinking resident's saved mind too", async () => {
    const memory = new MemoryStore(':memory:');
    const mind = new Mind({ client: new FakeModel(4), memory, costs: new CostLog(null), cards: CARDS });
    const town = Town.create(4, SIM_START, { brains: mindBrains(mind, fakeBrains, ['siti']), observer: mind.observe });
    await town.runUntil(SIM_START + 120);
    const save = town.snapshot() as unknown as SaveData;
    const siti = save.brains['siti'] as Record<string, unknown>;
    expect(siti).toHaveProperty('budget'); // a mind's state, not the fake brain's
    expect(misfits(save)).toEqual([]);
    siti.planDay = 'Monday';
    (siti.budget as Record<string, unknown>).level = null;
    expect(misfits(save)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^brains\.siti\.planDay: /),
      expect.stringMatching(/^brains\.siti\.budget\.level: /),
    ]));
    memory.close();
  });

  it('notices a table left in an old shape', () => {
    const path = savePath();
    loadSql(fixtureSql(SCHEMA_VERSION), path);
    expect(tablesOf(path)).toEqual(freshTables());
    exec(path, 'ALTER TABLE memories RENAME COLUMN importance TO weight');
    expect(tablesOf(path)).not.toEqual(freshTables());
  });
});

describe('opening a save', () => {
  it('upgrades only once: a second start finds it current and writes no new backup', () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    new SqliteStore(path).close();
    const after = savedOf(path);
    const lines: string[] = [];
    new SqliteStore(path, { log: (l) => lines.push(l) }).close();
    expect(lines).toEqual([]);
    expect(savedOf(path)).toEqual(after);
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-'))).toEqual(['kampung.db.bak-v1']);
  });

  it('never overwrites an older backup', () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    loadSql(fixtureSql(1), `${path}.bak-v1`);
    // An earlier v1 town: a few minutes behind this one.
    exec(`${path}.bak-v1`, "INSERT INTO meta VALUES ('note', 'kept'); UPDATE snapshot SET t = t - 5");
    new SqliteStore(path).close();
    expect(peek<{ value: string }>(`${path}.bak-v1`, "SELECT value FROM meta WHERE key = 'note'").value).toBe('kept');
    expect(schemaOf(`${path}.bak-v1.2`)).toBe(1);
  });

  it('a step that fails on every restart leaves one backup, not one per try', () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    const broken: Upgrade[] = [...UPGRADES, { from: SCHEMA_VERSION, why: 'A step that always goes wrong.', save: () => { throw new Error('boom'); } }];
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) expect(() => new SqliteStore(path, { upgrades: broken, log: (l) => lines.push(l) })).toThrow(/boom/);
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-'))).toEqual(['kampung.db.bak-v1']);
    expect(lines.filter((l) => l.includes('backed up at')).length).toBe(3);
    // Once the step is fixed, the same backup stands for the old save.
    new SqliteStore(path).close();
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-'))).toEqual(['kampung.db.bak-v1']);
    expect(schemaOf(`${path}.bak-v1`)).toBe(1);
  });

  it('a backup is not reused once the save has changed, even within the same minute', () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    const broken: Upgrade[] = [...UPGRADES, { from: SCHEMA_VERSION, why: 'A step that always goes wrong.', save: () => { throw new Error('boom'); } }];
    expect(() => new SqliteStore(path, { upgrades: broken })).toThrow(/boom/);
    // A memory was written in the same minute, before the snapshot was saved again.
    exec(path, "INSERT INTO memories (resident, t, kind, text, importance) VALUES ('siti', 1, 'thought', 'Rain soon.', 4)");
    expect(() => new SqliteStore(path, { upgrades: broken })).toThrow(/boom/);
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-')).sort()).toEqual(['kampung.db.bak-v1', 'kampung.db.bak-v1.2']);
    expect(peek<{ n: number }>(`${path}.bak-v1.2`, 'SELECT count(*) AS n FROM memories').n).toBe(4);
  });

  it('a backup of a different town at the same minute is not reused', () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    loadSql(fixtureSql(1), `${path}.bak-v1`);
    exec(`${path}.bak-v1`, "UPDATE snapshot SET world = json_set(world, '$.seed', 99)");
    new SqliteStore(path).close();
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-')).sort()).toEqual(['kampung.db.bak-v1', 'kampung.db.bak-v1.2']);
  });

  it("a backup is only reused if it's of this very save: same versions, same minute", () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    loadSql(fixtureSql(1), `${path}.bak-v1`);
    exec(`${path}.bak-v1`, `UPDATE meta SET value = '${SCHEMA_VERSION}' WHERE key = 'schema'`);
    new SqliteStore(path).close();
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-')).sort()).toEqual(['kampung.db.bak-v1', 'kampung.db.bak-v1.2']);
    expect(schemaOf(`${path}.bak-v1.2`)).toBe(1);
  });

  it("a save whose version can't be read without writing to it is refused with a plain message", () => {
    const path = savePath();
    mkdirSync(path); // something that isn't a save file sits where the save should be
    expect(() => new SqliteStore(path)).toThrow(/couldn't be read without writing to it/);
  });

  it('refuses a save from newer code (a rollback) and leaves it exactly as it was', () => {
    const path = savePath();
    loadSql(fixtureSql(SCHEMA_VERSION), path);
    exec(path, `UPDATE meta SET value = '${SCHEMA_VERSION + 1}' WHERE key = 'schema'`);
    const bytes = readFileSync(path);
    let err: unknown;
    try {
      new SqliteStore(path);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SaveTooNewError);
    const msg = (err as Error).message;
    expect(msg).toContain(`v${SCHEMA_VERSION + 1}`);
    expect(msg).toContain(`v${SCHEMA_VERSION}`);
    expect(msg).toContain(path);
    expect(readFileSync(path).equals(bytes)).toBe(true);
    expect(schemaOf(path)).toBe(SCHEMA_VERSION + 1);
    expect(readdirSync(join(path, '..')).filter((n) => n.includes('.bak-'))).toEqual([]);
  });

  it('a step that fails leaves the save untouched at its old version, with the backup made', () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    const before = savedOf(path);
    const broken: Upgrade[] = [
      ...UPGRADES,
      { from: SCHEMA_VERSION, why: 'A step that goes wrong halfway.', tables: (db) => { db.exec('DELETE FROM memories'); }, save: () => { throw new Error('boom'); } },
    ];
    expect(() => new SqliteStore(path, { upgrades: broken })).toThrow(/boom/);
    expect(schemaOf(path)).toBe(1);
    expect(savedOf(path)).toEqual(before);
    expect(peek<{ n: number }>(path, 'SELECT count(*) AS n FROM memories').n).toBe(3);
    expect(existsSync(`${path}.bak-v1`)).toBe(true);
  });

  it('runs table steps in the same file, so memories can be upgraded too', () => {
    const path = savePath();
    loadSql(fixtureSql(SCHEMA_VERSION), path);
    const extra: Upgrade[] = [
      ...UPGRADES,
      { from: SCHEMA_VERSION, why: 'Memories note where they happened.', tables: (db) => { db.exec("ALTER TABLE memories ADD COLUMN place TEXT NOT NULL DEFAULT ''"); } },
    ];
    new SqliteStore(path, { upgrades: extra }).close();
    expect(schemaOf(path)).toBe(SCHEMA_VERSION + 1);
    expect(savedOf(path).world.version).toBe(SCHEMA_VERSION + 1);
    expect(peek<{ place: string }>(path, 'SELECT place FROM memories LIMIT 1').place).toBe('');
  });

  it('steps see the save as it was: today\'s tables are only made after them', () => {
    const path = savePath();
    loadSql(fixtureSql(SCHEMA_VERSION), path);
    exec(path, 'DROP TABLE ledger'); // as if the ledger came in with the next version
    const next: Upgrade[] = [
      ...UPGRADES,
      { from: SCHEMA_VERSION, why: 'Money movements are written down.', tables: (db) => { db.exec('CREATE TABLE ledger (seq INTEGER PRIMARY KEY, t INTEGER NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL, cents INTEGER NOT NULL, reason TEXT NOT NULL)'); } },
    ];
    new SqliteStore(path, { upgrades: next }).close();
    expect(schemaOf(path)).toBe(SCHEMA_VERSION + 1);
  });

  it('refuses a newer save left mid-write (WAL) without touching any of its files', async () => {
    const path = savePath();
    loadSql(fixtureSql(SCHEMA_VERSION), path);
    // Newer code saved and was killed before its log was folded into the file.
    const script = `const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(process.argv[1]);
      db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; UPDATE meta SET value = '${SCHEMA_VERSION + 1}' WHERE key = 'schema'");
      process.kill(process.pid, 'SIGKILL');`;
    await new Promise((resolve) => spawn(process.execPath, ['-e', script, path]).on('close', resolve));
    // The save and its unfolded log stay byte for byte. (-shm is SQLite's index of the log, rebuilt by any reader after a crash; it holds no data.)
    const files = () => readdirSync(join(path, '..')).filter((n) => !n.endsWith('-shm')).sort().map((n) => [n, readFileSync(join(path, '..', n)).toString('base64')]);
    expect(existsSync(`${path}-wal`)).toBe(true);
    const before = files();
    expect(() => new SqliteStore(path)).toThrow(SaveTooNewError);
    expect(files()).toEqual(before);
  });

  it('a world saved over an upgraded file by pre-0.9 code is upgraded on its own', () => {
    const path = savePath();
    loadSql(fixtureSql(1), path);
    exec(path, `UPDATE meta SET value = '${SCHEMA_VERSION}' WHERE key = 'schema'`);
    const once: Upgrade[] = [
      ...UPGRADES.slice(0, -1),
      { ...UPGRADES.at(-1)!, tables: () => { throw new Error('tables upgraded twice'); } },
    ];
    new SqliteStore(path, { upgrades: once }).close();
    const world = savedOf(path).world as unknown as WorldState;
    expect(world.version).toBe(SCHEMA_VERSION);
    expect(world.residents.find((r) => r.id === 'mdm-tan')!.knownPeople).toContain('mei-ling');
    expect(existsSync(`${path}.bak-v1`)).toBe(true);
  });

  it('a town only resumes from a save at the current version', () => {
    const state = createWorld(1, 100);
    const store = new SqliteStore(':memory:');
    store.save({ world: { ...state, version: SCHEMA_VERSION - 1 }, brains: {} }, [], []);
    expect(() => Town.resume({ store })).toThrow(/version/);
    store.close();
  });
});

describe('v1 → v2: the cast know their family and old friends', () => {
  const load = (v: number) => {
    const path = savePath();
    loadSql(fixtureSql(v), path);
    return savedOf(path);
  };
  const run = (save: SaveData) => step(1).save!(save).world as unknown as WorldState;
  const people = (w: WorldState, id: string) => w.residents.find((r) => r.id === id)!.knownPeople;

  /** Each resident's ties as the step seeds them into a town where nobody knows anyone. */
  function tiesOf(save: SaveData): Map<string, string[]> {
    const blank = structuredClone(save);
    for (const r of (blank.world as unknown as WorldState).residents) r.knownPeople = [];
    return new Map(run(blank).residents.map((r) => [r.id, r.knownPeople]));
  }

  it('its ties are the ones a new town started with at v2', () => {
    const v2 = load(2);
    const ties = tiesOf(v2);
    // A v2 town starts with its ties, then adds whoever it meets.
    for (const r of (v2.world as unknown as WorldState).residents) expect(r.knownPeople.slice(0, ties.get(r.id)!.length), r.id).toEqual(ties.get(r.id));
    expect([...ties.values()].flat()).toHaveLength(12);
    expect(ties.get('ah-huat')).toEqual(['ah-seng', 'rahim']);
    expect(ties.get('ah-kow')).toEqual([]);
  });

  it("seeds each resident's starting ties, keeping whoever they already met, with no repeats", () => {
    const old = load(1);
    const ties = tiesOf(load(2));
    const copy = structuredClone(old);
    const up = run(old);
    expect(old).toEqual(copy); // pure: the old save isn't touched
    const oldWorld = old.world as unknown as WorldState;
    for (const r of oldWorld.residents) {
      const after = people(up, r.id);
      expect(after.slice(0, r.knownPeople.length), r.id).toEqual(r.knownPeople);
      expect(new Set(after), r.id).toEqual(new Set([...r.knownPeople, ...ties.get(r.id)!]));
      expect(after.length, r.id).toBe(new Set(after).size);
    }
    expect(people(oldWorld, 'ah-seng')).toContain('ah-huat'); // met in play before v2: kept once
  });

  it('is idempotent: a town that already has its ties is unchanged', () => {
    const v2 = load(2);
    expect(run(structuredClone(v2))).toEqual(v2.world);
    const once = step(1).save!(load(1));
    expect(step(1).save!(structuredClone(once))).toEqual(once);
  });

  it('only names residents who live in the town', () => {
    const save = load(1);
    const world = save.world as unknown as WorldState;
    world.residents = world.residents.filter((r) => r.id !== 'ah-seng');
    for (const r of world.residents) r.knownPeople = [];
    expect(people(run(save), 'ah-huat')).toEqual(['rahim']);
  });
});

describe('starting a command on an old or a newer save', () => {
  function run(home: string): Promise<{ code: number | null; out: string; err: string }> {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli/sim.ts', '--days', '0.01', '--save', '--home', home], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (b: Buffer) => { out += b.toString(); });
    child.stderr.on('data', (b: Buffer) => { err += b.toString(); });
    return new Promise((resolve) => child.on('close', (code) => resolve({ code, out, err })));
  }

  it('says it upgraded and where the backup is, then runs', async () => {
    const path = join(savePath(), '..', 'sim.db');
    loadSql(fixtureSql(1), path);
    const res = await run(join(path, '..'));
    expect(res.code, res.err).toBe(0);
    expect(res.out).toContain(`Upgrading the saved town from v1 to v${SCHEMA_VERSION}`);
    expect(res.out).toContain(`${path}.bak-v1`);
    expect(schemaOf(path)).toBe(SCHEMA_VERSION);
  });

  it('refuses a newer save with a plain message and leaves it alone', async () => {
    const path = join(savePath(), '..', 'sim.db');
    loadSql(fixtureSql(SCHEMA_VERSION), path);
    exec(path, `UPDATE meta SET value = '${SCHEMA_VERSION + 1}' WHERE key = 'schema'`);
    const bytes = readFileSync(path);
    const res = await run(join(path, '..'));
    expect(res.code).toBe(1);
    expect(res.err).toContain('saved by a newer Pixel Kampung');
    expect(res.err).not.toMatch(/at .*\.ts:\d+/); // a message, not a stack trace
    expect(readFileSync(path).equals(bytes)).toBe(true);
  });
});
