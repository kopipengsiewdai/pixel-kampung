/**
 * Measure what real thinking costs (M2). Runs a fast game from Monday 06:00
 * with a few residents on the model and the rest on the free fake brain, then
 * reports thoughts per waking game hour and cost per REAL resident-hour (4.8
 * game hours on the kampung clock) against the $0.0139 ceiling.
 *
 *   npm run trial -- --fake [--minds 13] [--hours 24]       free dry run
 *   npm run trial -- --fake --chatty                        ...where everyone answers talk
 *   npm run trial -- --fake --circles                       ...where talk narrates deals instead of doing them
 *   npm run trial -- --minds 3 --hours 4 --budget 1.00      real calls (owner's PC)
 *
 * Real trials need ANTHROPIC_API_KEY in $KAMPUNG_HOME/.env. All trials
 * together may spend at most US$10 (M2 decision 4); each stops at its budget.
 * Trial data (memories, cost log) goes under $KAMPUNG_HOME/trials/.
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readApiKey } from '../config/env.ts';
import { readSettings } from '../config/settings.ts';
import { kampungHome } from '../config/paths.ts';
import { feedLine, formatFeedLine } from '../feed/feed.ts';
import { AnthropicModel } from '../mind/anthropic-model.ts';
import { CostLog, sumCostFile } from '../mind/cost-log.ts';
import { FakeModel } from '../mind/fake-model.ts';
import { MemoryStore } from '../mind/memory.ts';
import { Mind } from '../mind/mind.ts';
import { HOURLY_ALLOWANCE } from '../mind/budget.ts';
import { mindBrains } from '../mind/setup.ts';
import type { ModelClient, ThinkRequest, ThinkResponse } from '../mind/model.ts';
import { costUsd } from '../mind/pricing.ts';
import { CARDS } from '../seed/cards.ts';
import type { GameEvent } from '../sim/events.ts';
import { Town, fakeBrains } from '../town.ts';
import { ReplayRecorder, recordTown } from '../watch/replay.ts';
import { numArg, parseArgs } from './args.ts';
import { SIM_START } from './start.ts';
import { formatMoney } from '../sim/money.ts';
import { talkMeasures } from '../sim/talk.ts';
import { GAME_MINUTES_PER_REAL_MINUTE, isNight } from '../sim/time.ts';

/** M2 decision 4: the most all paid trials may spend together. */
export const TRIAL_ALLOWANCE = 10;

/** Who goes on the model first: one owner among the first few, so business calls are measured too; those living with family last. */
const ORDER = ['ah-huat', 'siti', 'raju', 'mei-ling', 'ah-kow', 'muthu', 'ah-seng', 'fatimah', 'mdm-tan', 'rahim', 'mak-esah', 'aminah', 'hassan'];

const args = parseArgs(process.argv.slice(2));
const fake = args.fake === true;
const minds = Math.max(1, Math.min(ORDER.length, numArg(args, 'minds', fake ? ORDER.length : 3)));
const hours = Math.max(1, numArg(args, 'hours', fake ? 24 : 4));
const seed = numArg(args, 'seed', 42);
const home = kampungHome();
const trialsDir = join(home, 'trials');
const costRoot = join(trialsDir, fake ? 'costs-fake' : 'costs');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
/** Each trial keeps its own cost log, so one trial's spend never throttles the next. */
const costDir = join(costRoot, stamp);

/** Everything all trials have spent, across every trial's log. */
function spentOnTrials(dir: string): number {
  if (!existsSync(dir)) return 0;
  let sum = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    sum += entry.isDirectory() ? spentOnTrials(path) : entry.name.endsWith('.jsonl') ? sumCostFile(path) : 0;
  }
  return sum;
}

let client: ModelClient;
let budget = numArg(args, 'budget', 1);
if (fake) {
  client = new FakeModel(seed, { chatty: args.chatty === true, circles: args.circles === true });
  budget = Infinity;
} else {
  const apiKey = readApiKey(home);
  if (!apiKey) {
    console.error(`No API key found. Put ANTHROPIC_API_KEY=... in ${join(home, '.env')} (never in the repo).`);
    process.exit(1);
  }
  const left = TRIAL_ALLOWANCE - spentOnTrials(costRoot);
  if (left <= 0.01) {
    console.error(`Trials have used the full US$${TRIAL_ALLOWANCE} allowance. Nothing was run.`);
    process.exit(1);
  }
  budget = Math.min(budget, left);
  client = new AnthropicModel({ apiKey });
}

// Count every call, to report model mix and cache use.
const stats = { calls: 0, byKind: {} as Record<string, number>, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, usd: 0 };
const counting: ModelClient = {
  async think(req: ThinkRequest): Promise<ThinkResponse> {
    const res = await client.think(req);
    stats.calls++;
    stats.byKind[req.kind] = (stats.byKind[req.kind] ?? 0) + 1;
    stats.input += res.usage.input_tokens;
    stats.output += res.usage.output_tokens;
    stats.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    stats.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
    for (const a of res.attempts) stats.usd += costUsd(a.model, a.usage);
    return res;
  },
  saveFor: client.saveFor?.bind(client),
  loadFor: client.loadFor?.bind(client),
};

/** A request the API rejects outright (bad key, bad request) won't fix itself: stop the trial. */
let fatal: string | null = null;
let failures = 0;
function onError(err: unknown): void {
  failures++;
  const status = err instanceof Anthropic.APIError ? err.status : undefined;
  const what = `${err instanceof Error ? err.constructor.name : 'Error'}${status ? ` (HTTP ${status})` : ''}`;
  console.error(`A call failed: ${what}`);
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) fatal = what;
}
const trialDb = join(trialsDir, `trial-${stamp}.db`);
const memory = new MemoryStore(trialDb);
// Frames and events go in the same file, so the watch page can play the trial back.
const recorder = new ReplayRecorder(trialDb, { seed, label: `${fake ? 'dry run' : 'trial'} ${stamp.slice(0, 16)}, ${minds} on the model` });
const record = recordTown(recorder);
const mind = new Mind({ client: counting, memory, costs: new CostLog(costDir), cards: CARDS, townCap: budget, onError });
const chosen = ORDER.slice(0, minds);
let town: Town;
const events: GameEvent[] = [];
const print = (e: GameEvent) => {
  record.onEvent!(e);
  events.push(e);
  const line = feedLine(e, (id) => town.world.resident(id).name);
  if (line && (args.feed === true || line.notable || e.type === 'kampung_quiet')) console.log(formatFeedLine(line, town.world.state));
};
// The same dials as the living town under this KAMPUNG_HOME.
const settings = readSettings(home);
for (const w of settings.warnings) console.error(w);
town = Town.create(seed, SIM_START, { brains: mindBrains(mind, fakeBrains, chosen), observer: mind.observe, onEvent: print, onTick: record.onTick, dials: settings.dials });
console.log(`${fake ? 'Dry run (fake model, $0)' : `Trial, up to US$${budget.toFixed(2)}`}: ${minds} on the model for ${hours} game hours.`);

const end = SIM_START + Math.round(hours * 60);
while (town.t < end && stats.usd < budget && !fatal) await town.step();
memory.close();
recorder.close();
if (fatal) console.error(`Stopped early: the API refused a request (${fatal}). Check the key in ${join(home, '.env')}.`);

// Thinking money is per REAL hour; a real hour is 4.8 game hours.
const gameHours = (town.t - SIM_START) / 60;
const residentHours = minds * (gameHours / GAME_MINUTES_PER_REAL_MINUTE);
let wakingMinutes = 0;
for (let t = SIM_START + 1; t <= town.t; t++) if (!isNight(t)) wakingMinutes++;
const thoughts = (stats.byKind.act ?? 0) + (stats.byKind.business ?? 0);
const perHour = stats.usd / residentHours;
const inputAll = stats.input + stats.cacheRead + stats.cacheWrite;
console.log('\n--- what thinking cost ---');
if (failures) console.log(`failed calls: ${failures} (each charged at its estimate)`);
console.log(`calls: ${stats.calls} (${Object.entries(stats.byKind).map(([k, n]) => `${k} ${n}`).join(', ')})`);
console.log(`thoughts per resident per waking game hour: ${(thoughts / (minds * (wakingMinutes / 60))).toFixed(1)}`);
console.log(`calls per real resident-hour: ${(stats.calls / residentHours).toFixed(1)} (${gameHours.toFixed(1)} game hours = ${(gameHours / GAME_MINUTES_PER_REAL_MINUTE).toFixed(1)} real hours)`);
console.log(`tokens: ${inputAll} in (${Math.round((100 * stats.cacheRead) / Math.max(1, inputAll))}% from cache), ${stats.output} out`);
console.log(`spent: US$${stats.usd.toFixed(4)}${fake ? ' (estimated from fake token counts)' : ''}`);
console.log(`per real resident-hour: US$${perHour.toFixed(5)} against a ceiling of US$${HOURLY_ALLOWANCE} (${Math.round((100 * perHour) / HOURLY_ALLOWANCE)}%)`);
const talk = talkMeasures(events);
const count = (type: GameEvent['type']) => events.filter((e) => e.type === type).length;
const pct = (x: number) => `${Math.round(100 * x)}%`;
console.log('\n--- talk ---');
console.log(`chats: ${talk.chats}, lines: ${talk.lines}, lines per chat: ${talk.meanLines.toFixed(1)} (longest ${talk.longest})`);
console.log(`talk that led to something: ${pct(talk.ledChatShare)} of chats, ${pct(talk.ledLineShare)} of lines`);
console.log(`lines per resident per waking game hour: ${(talk.lines / (minds * (wakingMinutes / 60))).toFixed(1)}`);
console.log(`deals in words: ${talk.wordDeals} (${talk.wordDealsBacked} done within 5 minutes); going round in circles: ${talk.circles}`);
console.log(`done: ${(['bought', 'sold', 'gave', 'traded', 'trade_offered', 'job_offered', 'hired'] as const).map((t) => `${t} ${count(t)}`).join(', ')}`);
const cents = (type: GameEvent['type']) => events.reduce((n, e) => n + (e.type === type && 'cents' in e ? e.cents : 0), 0);
const purses = (role: 'owner' | 'seeker') => town.world.state.residents.filter((r) => r.role === role).reduce((n, r) => n + r.money, 0);
console.log('\n--- money ---');
console.log(`debts made: ${count('debt_agreed')} (${formatMoney(cents('debt_agreed'))}), paid back: ${count('repaid')} (${formatMoney(cents('repaid'))}), let off: ${count('let_off')} (${formatMoney(cents('let_off'))}); asked or offered: ${count('debt_offered')}, turned down: ${count('debt_refused')}`);
console.log(`at the end: owners hold ${formatMoney(purses('owner'))}, seekers ${formatMoney(purses('seeker'))}; still owed ${formatMoney(town.world.state.debts.reduce((n, d) => n + d.cents, 0))}`);
const byShop = new Map<string, { served: number; cents: number; left: number }>();
for (const e of events) {
  if (e.type === 'traveller_bought') {
    const row = byShop.get(e.shop) ?? { served: 0, cents: 0, left: 0 };
    row.served++;
    row.cents += e.cents;
    byShop.set(e.shop, row);
  } else if (e.type === 'travellers_hour' && e.left) {
    const row = byShop.get(e.shop) ?? { served: 0, cents: 0, left: 0 };
    row.left += e.left;
    byShop.set(e.shop, row);
  }
}
const wagesPaid = events.reduce((n, e) => n + (e.type === 'wages_paid' ? e.cents : 0), 0);
console.log('\n--- work ---');
console.log(`jobs offered: ${count('job_offered')}, hired: ${count('hired')}, wages paid: ${formatMoney(wagesPaid)}`);
console.log(`travellers served: ${[...byShop].map(([shop, r]) => `${shop} ${r.served} (${formatMoney(r.cents)}), ${r.left} unserved`).join('; ') || 'none'}`);
console.log('\n--- day ---');
console.log(`look-arounds: ${count('looked_around')}, chores done: ${count('chore_done')}, neighbours helped: ${count('helped')}, errands asked: ${count('errand_asked')}, done: ${count('errand_done')}; fish caught: ${events.reduce((n, e) => n + (e.type === 'caught_fish' ? e.qty : 0), 0)}`);
if (!fake) console.log(`all trials so far: US$${spentOnTrials(costRoot).toFixed(4)} of US$${TRIAL_ALLOWANCE}`);
console.log(`\nWatch it back: npm run watch -- --replay trial-${stamp}.db`);
