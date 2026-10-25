/**
 * Fast simulation with fake brains ($0 AI). Prints the story feed.
 *
 *   npm run sim -- --days 3 [--seed 42] [--notable] [--save [--home DIR]]
 *
 * --notable prints only highlighted lines. By default nothing is written to disk. With --save the run goes to
 * $KAMPUNG_HOME/sim.db (or DIR/sim.db) and resumes from there if it exists.
 */
import { join } from 'node:path';
import { kampungHome } from '../config/paths.ts';
import { feedLine, formatFeedLine } from '../feed/feed.ts';
import { formatMoney } from '../sim/money.ts';
import { Town } from '../town.ts';
import { numArg, parseArgs } from './args.ts';
import { openSave } from './open-save.ts';
import { SIM_START } from './start.ts';
import { energyWord, hungerWord } from '../sim/perception.ts';
import type { GameEvent } from '../sim/events.ts';
import { PLACE_BY_ID } from '../sim/map.ts';


const args = parseArgs(process.argv.slice(2));
const days = numArg(args, 'days', 3);
const seed = numArg(args, 'seed', 42);
const notableOnly = args.notable === true;

let town: Town;
const store = args.save ? openSave(join(typeof args.home === 'string' ? args.home : kampungHome(), 'sim.db')) : undefined;
const print = (e: GameEvent) => {
  const line = feedLine(e, (id) => town.world.resident(id).name);
  if (line && (!notableOnly || line.notable)) console.log(formatFeedLine(line, town.world.state));
};
const resumed = store ? Town.resume({ store, onEvent: print }) : null;
town = resumed ?? Town.create(seed, SIM_START, { store, onEvent: print });
const until = (resumed ? town.t : SIM_START) + Math.round(days * 1440);
await town.runUntil(until);

console.log('\n--- the kampung now ---');
for (const r of town.world.state.residents) {
  const job = town.world.jobOf(r.id);
  const shop = town.world.shopOf(r.id);
  const role = shop ? `runs ${PLACE_BY_ID.get(shop.id)!.name}` : job ? `works at ${PLACE_BY_ID.get(job.placeId)!.name}` : 'no job';
  console.log(`${r.name.padEnd(9)} ${formatMoney(r.money).padStart(7)}  ${role.padEnd(32)} ${hungerWord(r.hunger)}, ${energyWord(r.energy)}`);
}
store?.close();
