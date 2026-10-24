import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kampungHome } from './paths.ts';

/**
 * The Anthropic API key lives only in $KAMPUNG_HOME/.env (spec §5), never in
 * the repo or the shell environment. Returns null if it isn't set. Never log it.
 */
export function readApiKey(home = kampungHome()): string | null {
  const file = join(home, '.env');
  if (!existsSync(file)) return null;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*ANTHROPIC_API_KEY\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m) continue;
    const value = m[1]!.replace(/^(['"])(.*)\1$/, '$2').trim();
    return value || null;
  }
  return null;
}
