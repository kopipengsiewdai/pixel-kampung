import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSettings, settingsPath } from '../src/config/settings.ts';
import { DEFAULT_DIALS } from '../src/sim/dials.ts';
import { Town } from '../src/town.ts';
import { sgt } from './helpers.ts';

const dirs: string[] = [];
function home(): string {
  const d = mkdtempSync(join(tmpdir(), 'kampung-settings-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the owner's dials (private settings under KAMPUNG_HOME)", () => {
  it('with no settings file, the defaults are used and a file showing them is written for the owner to edit', () => {
    const h = home();
    const s = readSettings(h);
    expect(s.dials).toEqual(DEFAULT_DIALS);
    expect(s.warnings).toEqual([]);
    expect(JSON.parse(readFileSync(settingsPath(h), 'utf8'))).toEqual({ dials: DEFAULT_DIALS });
  });

  it("the owner's values win; anything unknown or not a sensible number is ignored, with a warning", () => {
    const h = home();
    writeFileSync(settingsPath(h), JSON.stringify({ dials: { travellerBudgetCents: 900, nonsense: 1 } }));
    expect(readSettings(h)).toEqual({ dials: { ...DEFAULT_DIALS, travellerBudgetCents: 900 }, warnings: ['settings.json: unknown dial "nonsense" ignored'] });
    writeFileSync(settingsPath(h), JSON.stringify({ dials: { travellerBudgetCents: -5 } }));
    expect(readSettings(h).dials).toEqual(DEFAULT_DIALS);
    writeFileSync(settingsPath(h), '{ not json');
    const broken = readSettings(h);
    expect(broken.dials).toEqual(DEFAULT_DIALS);
    expect(broken.warnings[0]).toMatch(/settings\.json can't be read/);
  });

  it('a town runs with the dials it is given', () => {
    const town = Town.create(1, sgt(6, 0), { dials: { travellerBudgetCents: 100 } });
    expect(town.world.dials).toEqual({ ...DEFAULT_DIALS, travellerBudgetCents: 100 });
    expect(Town.create(1, sgt(6, 0)).world.dials).toEqual(DEFAULT_DIALS);
  });
});
