import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DIALS, type Dials } from '../sim/dials.ts';
import { kampungHome } from './paths.ts';

/**
 * The owner's private settings, $KAMPUNG_HOME/settings.json (never in the
 * repo): for now the economy dials (src/sim/dials.ts has the defaults and
 * what each means). Written with the defaults on first read, for the owner to
 * edit; read when the town starts.
 */
export function settingsPath(home = kampungHome()): string {
  return join(home, 'settings.json');
}

export interface Settings {
  dials: Dials;
  /** Anything in the file that was ignored, to print on start. */
  warnings: string[];
}

export function readSettings(home = kampungHome()): Settings {
  const file = settingsPath(home);
  if (!existsSync(file)) {
    mkdirSync(home, { recursive: true });
    writeFileSync(file, `${JSON.stringify({ dials: DEFAULT_DIALS }, null, 2)}\n`);
    return { dials: { ...DEFAULT_DIALS }, warnings: [] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { dials: { ...DEFAULT_DIALS }, warnings: [`settings.json can't be read (${(err as Error).message}); using the default dials`] };
  }
  const dials: Dials = { ...DEFAULT_DIALS };
  const warnings: string[] = [];
  const given = (raw as { dials?: unknown })?.dials;
  if (given && typeof given === 'object') {
    for (const [k, v] of Object.entries(given)) {
      if (!(k in DEFAULT_DIALS)) warnings.push(`settings.json: unknown dial "${k}" ignored`);
      else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) warnings.push(`settings.json: dial "${k}" must be a number of 0 or more; using ${DEFAULT_DIALS[k as keyof Dials]}`);
      else dials[k as keyof Dials] = Math.round(v);
    }
  }
  return { dials, warnings };
}
