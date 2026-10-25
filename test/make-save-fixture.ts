/**
 * Freezes the fixtures for the current schema version, after adding an
 * upgrade step:
 *
 *   test/fixtures/saves/v<N>.sql            a tiny fake town saved by today's code
 *   test/fixtures/saves/v<N>.shape.txt      the shape of everything a save holds
 *   test/fixtures/saves/v<N-1>.upgraded.sql the previous fixture after the new step alone
 *
 *   npm run save-fixture
 *
 * It refuses to touch fixtures that already exist: those are frozen.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, UPGRADES } from '../src/store/upgrades.ts';
import { dumpSql, fixtureHeader, fixtureShape, fixtureSql, fixtureUpgraded, makeFixtureSave, saveShape, upgradeOneStep, upgradedHeader } from './saves.ts';

const v = SCHEMA_VERSION;
const files = [fixtureSql(v), fixtureShape(v), ...(v > 1 ? [fixtureUpgraded(v - 1)] : [])];
if (files.some((f) => existsSync(f))) {
  console.error(`Fixtures for save v${v} already exist and are frozen. Add an upgrade step first (docs/design/upgrades.md).`);
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), 'kampung-fixture-'));
try {
  const path = join(dir, 'kampung.db');
  await makeFixtureSave(path);
  writeFileSync(fixtureSql(v), dumpSql(path, fixtureHeader(v)));
  writeFileSync(fixtureShape(v), saveShape());
  if (v > 1) {
    const up = join(dir, 'upgraded.db');
    upgradeOneStep(v - 1, up, UPGRADES);
    writeFileSync(fixtureUpgraded(v - 1), dumpSql(up, upgradedHeader(v - 1)));
  }
  console.log(`Wrote ${files.map((f) => f.pathname.split('/test/')[1]).join(', ')}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
