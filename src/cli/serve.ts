/**
 * The live kampung, in real time (1 game minute = 1 real minute, Singapore
 * time), with fake brains for now. Saves every minute to
 * $KAMPUNG_HOME/kampung.db, writes a heartbeat file, and prints the feed.
 * After downtime it resumes cleanly without replaying the missed hours.
 *
 *   npm start [-- --seed 42]     fake brains, $0
 *   npm start -- --minds         real thinking (needs ANTHROPIC_API_KEY in $KAMPUNG_HOME/.env),
 *                                within the per-resident budget and the town's daily cap
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
import { join } from 'node:path';
import { readApiKey } from '../config/env.ts';
import { AnthropicModel } from '../mind/anthropic-model.ts';
import { CostLog } from '../mind/cost-log.ts';
import { MemoryStore } from '../mind/memory.ts';
import { Mind } from '../mind/mind.ts';
import { mindBrains } from '../mind/setup.ts';
import { TEST_CARDS } from '../seed/test-cards.ts';
import { fakeBrains, type TownOptions } from '../town.ts';

const args = parseArgs(process.argv.slice(2));
const home = kampungHome();
const store = new SqliteStore(dbPath(home));
const clock = new SystemClock();

let town: Town;
const print = (e: GameEvent) => {
  const line = feedLine(e, (id) => town.world.resident(id).name);
  if (line) console.log(formatFeedLine(line));
};

let mindOpts: Partial<TownOptions> = {};
if (args.minds === true) {
  const apiKey = readApiKey(home);
  if (!apiKey) {
    console.error(`No API key found. Put ANTHROPIC_API_KEY=... in ${join(home, '.env')} (never in the repo).`);
    process.exit(1);
  }
  const mind = new Mind({
    client: new AnthropicModel({ apiKey }),
    memory: new MemoryStore(dbPath(home)),
    costs: new CostLog(join(home, 'costs')),
    cards: TEST_CARDS,
  });
  mindOpts = { brains: mindBrains(mind, fakeBrains), observer: mind.observe };
}

const now = () => gameMinuteFromMs(clock.nowMs());
town = Town.resume({ store, onEvent: print, ...mindOpts })
  ?? Town.create(numArg(args, 'seed', Date.now() % 2_147_483_647), now() - 1, { store, onEvent: print, ...mindOpts });
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
