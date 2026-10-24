import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * All private runtime data (world state, the economy ledger, the event log,
 * later memories and logs) lives under KAMPUNG_HOME, default ~/.kampung,
 * outside the repo. Never write runtime output inside the repo.
 */
export function kampungHome(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.KAMPUNG_HOME?.trim();
  if (!raw) return join(homedir(), '.kampung');
  const expanded = raw === '~' ? homedir() : raw.startsWith('~/') || raw.startsWith('~\\') ? join(homedir(), raw.slice(2)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export function dbPath(home = kampungHome()): string {
  return join(home, 'kampung.db');
}

export function heartbeatPath(home = kampungHome()): string {
  return join(home, 'heartbeat');
}
