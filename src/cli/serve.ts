/**
 * The live kampung, in real time (1 game minute = 1 real minute, Singapore
 * time), with fake brains for now. Saves every minute to
 * $KAMPUNG_HOME/kampung.db, writes a heartbeat file, and prints the feed.
 * After downtime it resumes cleanly without replaying the missed hours.
 *
 *   npm start [-- --seed 42]
 */
import { writeFileSync } from 'node:fs';
import { dbPath, heartbeatPath, kampungHome } from '../config/paths.ts';
import { feedLine, formatFeedLine } from '../feed/feed.ts';
import type { GameEvent } from '../sim/events.ts';
import { SystemClock } from '../sim/clock.ts';
import { gameMinuteFromMs } from '../sim/time.ts';
import { SqliteStore } from '../store/sqlite-store.ts';
import { Town } from '../town.ts';
import { numArg, parseArgs } from './args.ts';

const args = parseArgs(process.argv.slice(2));
const home = kampungHome();
const store = new SqliteStore(dbPath(home));
const clock = new SystemClock();

let town: Town;
const print = (e: GameEvent) => {
  const line = feedLine(e, (id) => town.world.resident(id).name);
  if (line) console.log(formatFeedLine(line));
};

const now = () => gameMinuteFromMs(clock.nowMs());
town = Town.resume({ store, onEvent: print })
  ?? Town.create(numArg(args, 'seed', Date.now() % 2_147_483_647), now() - 1, { store, onEvent: print });
console.log(`Pixel Kampung is running. Saving to ${dbPath(home)}`);

let busy = false;
async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const t = now();
    if (t > town.t) await town.catchUp(t);
    writeFileSync(heartbeatPath(home), JSON.stringify({ at: new Date(clock.nowMs()).toISOString(), t: town.t }));
  } finally {
    busy = false;
  }
}

await tick();
const timer = setInterval(() => { void tick(); }, 1000);

function stop(): void {
  clearInterval(timer);
  store.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
