/**
 * Frozen save fixtures (test/fixtures/saves/): tiny, fake towns saved by each
 * schema version, kept as SQL text so they diff, review and scan like code.
 * See docs/design/upgrades.md.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import ts from 'typescript';
import { SIM_START } from '../src/cli/start.ts';
import { MemoryStore } from '../src/mind/memory.ts';
import { SqliteStore } from '../src/store/sqlite-store.ts';
import type { Upgrade } from '../src/store/upgrades.ts';
import { Town } from '../src/town.ts';

export const FIXTURE_DIR = new URL('./fixtures/saves/', import.meta.url);

export const fixtureSql = (version: number) => new URL(`v${version}.sql`, FIXTURE_DIR);
export const fixtureShape = (version: number) => new URL(`v${version}.shape.txt`, FIXTURE_DIR);
/** v<N>'s fixture after only its own step has run: what that step does, frozen. */
export const fixtureUpgraded = (version: number) => new URL(`v${version}.upgraded.sql`, FIXTURE_DIR);

function quote(v: unknown): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'`;
  throw new Error(`can't write ${typeof v} into a fixture`);
}

/** The whole file as SQL: its tables and indexes, then every row. */
export function dumpSql(path: string, header: string): string {
  const db = new DatabaseSync(path, { readOnly: true });
  const objects = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'index', name")
    .all() as { type: string; name: string; sql: string }[];
  const out = header.split('\n').map((l) => `-- ${l}`.trimEnd());
  for (const o of objects) out.push(`${o.sql};`);
  for (const o of objects.filter((x) => x.type === 'table')) {
    for (const row of db.prepare(`SELECT * FROM "${o.name}" ORDER BY rowid`).all()) {
      out.push(`INSERT INTO "${o.name}" VALUES (${Object.values(row).map(quote).join(', ')});`);
    }
  }
  db.close();
  return out.join('\n') + '\n';
}

/** Writes a fixture into a fresh SQLite file at path, as a town on disk would be. */
export function loadSql(sqlFile: URL, path: string): void {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(sqlFile, 'utf8'));
  db.close();
}

/** Runs one statement's worth of reads on a save file, read-only. */
export function peek<T>(path: string, sql: string, ...params: SQLInputValue[]): T {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare(sql).get(...params) as T;
  } finally {
    db.close();
  }
}

/** The saved types: the world, and what each kind of brain saves. */
const SAVED_TYPES: readonly [file: string, type: string][] = [
  ['src/sim/state.ts', 'WorldState'],
  ['src/brain/fake-brain.ts', 'Memory'],
  ['src/mind/mind.ts', 'MindState'],
];
/** A brain saves as one of these. */
const BRAIN_TYPES = ['Memory', 'MindState'];

let typesCache: { checker: ts.TypeChecker; types: Map<string, ts.Type> } | null = null;

/** Today's saved types, read by the type checker (once per run). */
function savedTypes(): { checker: ts.TypeChecker; types: Map<string, ts.Type> } {
  if (typesCache) return typesCache;
  const files = SAVED_TYPES.map(([f]) => fileURLToPath(new URL(`../${f}`, import.meta.url)));
  const program = ts.createProgram(files, { strict: true, noEmit: true, allowImportingTsExtensions: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2023 });
  const checker = program.getTypeChecker();
  const types = new Map<string, ts.Type>();
  SAVED_TYPES.forEach(([f, name], i) => {
    const source = program.getSourceFile(files[i]!)!;
    const decl = source.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === name);
    if (!decl) throw new Error(`${name} not found in ${f}`);
    types.set(name, checker.getTypeAtLocation(decl));
  });
  typesCache = { checker, types };
  return typesCache;
}

/** A save file's tables and indexes, whitespace aside (re-indenting the code that makes a table changes nothing saved). */
export function tablesOf(path: string): string[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'index', name").all() as { sql: string }[];
    return ddl.map((d) => `${d.sql.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')')};`);
  } finally {
    db.close();
  }
}

/** The tables a fresh save file gets today (a thinking town's: memories included). */
export function freshTables(): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'kampung-shape-'));
  try {
    const path = join(dir, 'kampung.db');
    new SqliteStore(path).close();
    new MemoryStore(path).close();
    return tablesOf(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The shape of everything a save holds: the saved types as the type checker
 * sees them (fully expanded and sorted: every field, whether it's optional and
 * what it holds), then the tables a fresh save file gets. A change here is a
 * change to what gets saved.
 */
export function saveShape(): string {
  const { checker, types } = savedTypes();
  const pad = (n: number) => '  '.repeat(n);
  const seen = new Set<ts.Type>();
  function shape(type: ts.Type, depth: number): string {
    if (type.isUnion()) return [...new Set(type.types.map((t) => shape(t, depth)))].sort().join(' | ');
    if (checker.isArrayType(type)) {
      const el = checker.getTypeArguments(type as ts.TypeReference)[0]!;
      const s = shape(el, depth);
      return el.isUnion() ? `(${s})[]` : `${s}[]`;
    }
    if (!(type.flags & ts.TypeFlags.Object)) return checker.typeToString(type);
    if (seen.has(type)) throw new Error(`recursive type ${checker.typeToString(type)}`);
    seen.add(type);
    const lines: string[] = [];
    for (const info of checker.getIndexInfosOfType(type)) {
      lines.push(`${pad(depth + 1)}[key: ${checker.typeToString(info.keyType)}]: ${shape(info.type, depth + 1)}`);
    }
    for (const p of [...checker.getPropertiesOfType(type)].sort((a, b) => a.name.localeCompare(b.name))) {
      const optional = p.flags & ts.SymbolFlags.Optional ? '?' : '';
      const key = /^[A-Za-z_$][\w$]*$/.test(p.name) ? p.name : JSON.stringify(p.name);
      lines.push(`${pad(depth + 1)}${key}${optional}: ${shape(checker.getTypeOfSymbol(p), depth + 1)}`);
    }
    seen.delete(type);
    return lines.length ? `{\n${lines.join('\n')}\n${pad(depth)}}` : '{}';
  }

  const out = SAVED_TYPES.map(([f, name]) => `${f} ${name} ${shape(types.get(name)!, 0)}`);
  out.push(`Tables of a fresh save:\n${freshTables().join('\n')}`);
  return out.join('\n\n') + '\n';
}

/**
 * Where a saved world and its brains don't fit today's saved types, at any
 * depth: a missing field, a field today's code no longer has, or a value of
 * the wrong kind. Each brain must fit one of the brain types. Empty means
 * today's code reads every value as it expects.
 */
export function misfits(save: { world: unknown; brains: Record<string, unknown> }): string[] {
  const { checker, types } = savedTypes();

  function check(v: unknown, type: ts.Type, at: string, out: string[]): void {
    const f = type.flags;
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;
    if (type.isUnion()) {
      const tries = type.types.map((t) => {
        const o: string[] = [];
        check(v, t, at, o);
        return o;
      });
      if (tries.some((o) => o.length === 0)) return;
      out.push(...tries.sort((a, b) => a.length - b.length)[0]!);
      return;
    }
    const bad = () => out.push(`${at}: ${JSON.stringify(v)?.slice(0, 40)} isn't ${checker.typeToString(type)}`);
    if (f & ts.TypeFlags.Null) { if (v !== null) bad(); return; }
    if (f & ts.TypeFlags.Undefined) { if (v !== undefined) bad(); return; }
    if (type.isStringLiteral() || type.isNumberLiteral()) { if (v !== type.value) bad(); return; }
    if (f & ts.TypeFlags.BooleanLiteral) { if (String(v) !== checker.typeToString(type)) bad(); return; }
    if (f & ts.TypeFlags.String) { if (typeof v !== 'string') bad(); return; }
    if (f & ts.TypeFlags.Number) { if (typeof v !== 'number') bad(); return; }
    if (f & ts.TypeFlags.Boolean) { if (typeof v !== 'boolean') bad(); return; }
    if (checker.isArrayType(type)) {
      if (!Array.isArray(v)) { bad(); return; }
      const el = checker.getTypeArguments(type as ts.TypeReference)[0]!;
      v.forEach((x, i) => check(x, el, `${at}[${i}]`, out));
      return;
    }
    if (f & ts.TypeFlags.Object) {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) { bad(); return; }
      const o = v as Record<string, unknown>;
      const props = checker.getPropertiesOfType(type);
      const index = checker.getIndexInfosOfType(type)[0];
      for (const p of props) {
        if (!(p.name in o)) {
          if (!(p.flags & ts.SymbolFlags.Optional)) out.push(`${at}.${p.name}: missing`);
          continue;
        }
        check(o[p.name], checker.getTypeOfSymbol(p), `${at}.${p.name}`, out);
      }
      const named = new Set(props.map((p) => p.name));
      for (const k of Object.keys(o).filter((k) => !named.has(k))) {
        if (index) check(o[k], index.type, `${at}[${JSON.stringify(k)}]`, out);
        else out.push(`${at}.${k}: today's saves have no such field`);
      }
      return;
    }
    out.push(`${at}: can't check against ${checker.typeToString(type)}`);
  }

  const out: string[] = [];
  check(save.world, types.get('WorldState')!, 'world', out);
  for (const [id, b] of Object.entries(save.brains)) {
    const tries = BRAIN_TYPES.map((name) => {
      const o: string[] = [];
      check(b, types.get(name)!, `brains.${id}`, o);
      return o;
    });
    if (tries.every((o) => o.length > 0)) out.push(...tries.sort((a, c) => a.length - c.length)[0]!);
  }
  return out;
}

export const FIXTURE_SEED = 7;
export const FIXTURE_MINUTES = 10;

/**
 * A tiny fake town saved by today's code at path: seeded, fake brains, ten
 * game minutes from Monday 06:00, plus a few made-up memories in the same
 * file (as a thinking town keeps them). `edit` may adjust the new town first.
 */
export async function makeFixtureSave(path: string, edit?: (town: Town) => void): Promise<void> {
  const store = new SqliteStore(path);
  const town = Town.create(FIXTURE_SEED, SIM_START, { store });
  edit?.(town);
  await town.runUntil(SIM_START + FIXTURE_MINUTES);
  store.close();
  const memory = new MemoryStore(path);
  memory.add('ah-huat', SIM_START + 2, 'noticed', 'The kopitiam smells of fresh kopi.');
  memory.add('siti', SIM_START + 3, 'plan', 'Look for work at the market this morning.');
  memory.add('raju', SIM_START + 5, 'thought', 'Muthu will know who is hiring.');
  memory.close();
}

export function upgradedHeader(version: number): string {
  return [
    `Pixel Kampung save fixture v${version}.sql after its step to v${version + 1} alone: what that step does, frozen.`,
    'Fake data only. Never edit. Made by `npm run save-fixture`; see docs/design/upgrades.md.',
  ].join('\n');
}

/** Opens fixture v<version> at path and runs only its own step on it. */
export function upgradeOneStep(version: number, path: string, steps: readonly Upgrade[]): void {
  loadSql(fixtureSql(version), path);
  new SqliteStore(path, { upgrades: steps.slice(0, version) }).close();
}

export function fixtureHeader(version: number): string {
  return [
    `Pixel Kampung save fixture: schema v${version}.`,
    'Fake data only: a tiny seeded test town (fake brains, made-up memories), never a real save.',
    'Frozen: never edit. Made by `npm run save-fixture`; see docs/design/upgrades.md.',
  ].join('\n');
}
