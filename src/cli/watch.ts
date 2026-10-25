/**
 * The watch page on its own, without touching the live town.
 *
 *   npm run watch -- --fake [--speed 60] [--seed 42] [--port 8160]
 *       A fresh fake town on a fast clock: 60 game minutes per real minute by
 *       default. Residents think with the free fake model, so their cards show
 *       plans and thoughts. $0 of AI; nothing is saved.
 *
 *   npm run watch -- --replay [file] [--speed 60] [--port 8160]
 *       Plays a trial back. `file` is a path, or a name in
 *       $KAMPUNG_HOME/trials/; with no file, the newest trial there.
 *
 * Open http://127.0.0.1:8160/ in a browser on this PC. Ctrl+C stops it.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { kampungHome } from '../config/paths.ts';
import { CostLog } from '../mind/cost-log.ts';
import { FakeModel } from '../mind/fake-model.ts';
import { MemoryStore } from '../mind/memory.ts';
import { Mind } from '../mind/mind.ts';
import { mindBrains } from '../mind/setup.ts';
import { CARDS } from '../seed/cards.ts';
import { Town, fakeBrains } from '../town.ts';
import { ASSETS_DIR, buildClient } from '../watch/bundle.ts';
import { MAX_SPEED } from '../watch/player.ts';
import { extrasFrom, ReplayReader } from '../watch/replay.ts';
import { DEFAULT_PORT, startWatchServer, trialCatalog, type Catalog, type WatchServer } from '../watch/server.ts';
import { LiveSource, ReplaySource, type WatchSource } from '../watch/source.ts';
import { numArg, parseArgs } from './args.ts';
import { SIM_START } from './start.ts';

const args = parseArgs(process.argv.slice(2));
const port = numArg(args, 'port', DEFAULT_PORT);
const speed = numArg(args, 'speed', 60);
if (!(speed > 0 && speed <= MAX_SPEED)) {
  console.error(`--speed must be between 0 and ${MAX_SPEED} (game minutes per real minute).`);
  process.exit(1);
}
const trialsDir = join(kampungHome(), 'trials');

let source: WatchSource;
let catalog: Catalog | undefined;
let stopTown = () => {};

if (args.replay !== undefined) {
  catalog = trialCatalog(trialsDir);
  let file: string | null;
  if (args.replay === true) {
    const newest = catalog.list()[0];
    file = newest ? join(trialsDir, newest.name) : null;
    if (!file) {
      console.error(`No trials found in ${trialsDir}. Run \`npm run trial -- --fake\` for a free one.`);
      process.exit(1);
    }
  } else {
    file = existsSync(args.replay) ? resolve(args.replay) : catalog.find(args.replay);
    if (!file) {
      console.error(`Can't find ${args.replay}. Trials in ${trialsDir}:`);
      for (const t of catalog.list()) console.error(`  ${t.name}`);
      process.exit(1);
    }
  }
  const reader = new ReplayReader(file);
  source = new ReplaySource(reader, { speed });
  const info = reader.info();
  console.log(`Replaying ${file} (${Math.round((info.end - info.start) / 60 * 10) / 10} game hours${info.hasFrames ? '' : ', thoughts only'}) at ${speed}×.`);
} else {
  // A fresh fake town on a fast clock (the default).
  const seed = numArg(args, 'seed', 42);
  const msPerMinute = 60_000 / speed;
  const memory = new MemoryStore(':memory:');
  const mind = new Mind({ client: new FakeModel(seed), memory, costs: new CostLog(null), cards: CARDS, townCap: Infinity });
  const live = new LiveSource({
    label: `Fake town at ${speed}×`,
    msPerMinute,
    extras: (id, t) => extrasFrom((r, k, up, n) => memory.latest(r, k, up, n), id, t),
  });
  const town = Town.create(seed, SIM_START, { brains: mindBrains(mind, fakeBrains), observer: mind.observe, ...live.hooks() });
  source = live;
  const startedAt = Date.now();
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    const due = SIM_START + Math.floor((Date.now() - startedAt) / msPerMinute);
    // At most an hour of game time per tick, so the page stays smooth.
    town.runUntil(Math.min(due, town.t + 60)).finally(() => { busy = false; });
  }, Math.min(250, msPerMinute));
  stopTown = () => {
    clearInterval(timer);
    memory.close();
  };
  console.log(`A fake town (free fake model, $0) from Monday 06:00 at ${speed}×, seed ${seed}.`);
}

let server: WatchServer;
try {
  server = await startWatchServer({ source, client: await buildClient(), assetsDir: ASSETS_DIR, port, catalog, replaySpeed: speed });
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  console.error(code === 'EADDRINUSE' ? `Port ${port} is busy. Try --port ${port + 1}.` : `The watch page couldn't start: ${err instanceof Error ? err.message : String(err)}`);
  stopTown();
  process.exit(1);
}
console.log(`Watch the kampung at ${server.url}  (this PC only; Ctrl+C to stop)`);

async function stop(): Promise<void> {
  stopTown();
  await server.close();
  server.source().close();
  process.exit(0);
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
