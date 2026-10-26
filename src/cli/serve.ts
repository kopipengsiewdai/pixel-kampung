/**
 * The live kampung on its own clock (4.8 game minutes a real minute: a game day
 * is five real hours), with fake brains unless --minds. Saves every minute to
 * $KAMPUNG_HOME/kampung.db, writes a heartbeat file, and prints the feed.
 * After downtime it resumes cleanly without replaying the missed hours. A save
 * from an older release is upgraded in place first (docs/design/upgrades.md).
 *
 *   npm start [-- --seed 42]     fake brains, $0
 *   npm start -- --minds         real thinking (needs ANTHROPIC_API_KEY in $KAMPUNG_HOME/.env),
 *                                within the per-resident budget and the town's daily cap
 *   [--port 8160]                the watch page, at http://127.0.0.1:8160/ (this PC only)
 *   [--lan]                      also on this PC's home-Wi-Fi address, for a phone at home (read-only)
 */
import { writeFileSync } from 'node:fs';
import { dbPath, heartbeatPath, kampungHome } from '../config/paths.ts';
import { feedLine, formatFeedLine } from '../feed/feed.ts';
import type { GameEvent } from '../sim/events.ts';
import { SystemClock } from '../sim/clock.ts';
import { auditLedger } from '../sim/audit.ts';
import { dayIndex, gameMinuteAt, gameMinuteFromMs, REAL_MS_PER_GAME_MINUTE } from '../sim/time.ts';
import { Town } from '../town.ts';
import { numArg, parseArgs } from './args.ts';
import { openSave } from './open-save.ts';
import { join } from 'node:path';
import { readApiKey } from '../config/env.ts';
import { readSettings, settingsPath } from '../config/settings.ts';
import { AnthropicModel } from '../mind/anthropic-model.ts';
import { dayCap } from '../mind/budget.ts';
import { CostLog } from '../mind/cost-log.ts';
import { MemoryStore } from '../mind/memory.ts';
import { Mind } from '../mind/mind.ts';
import { mindBrains } from '../mind/setup.ts';
import { ModelOsmanHead } from '../mind/osman-head.ts';
import { ModelTeacherHead } from '../mind/teacher-head.ts';
import { CARDS } from '../seed/cards.ts';
import { fakeBrains, type TownOptions } from '../town.ts';
import { ASSETS_DIR, buildClient } from '../watch/bundle.ts';
import { extrasFrom } from '../watch/replay.ts';
import { DEFAULT_PORT, startWatchServer } from '../watch/server.ts';
import { Translator } from '../watch/translate.ts';
import { FEED_KEPT, LiveSource } from '../watch/source.ts';
import { ECONOMY_EVENTS } from '../watch/wiki.ts';

const args = parseArgs(process.argv.slice(2));
const home = kampungHome();
// Upgrades an older save first (backed up beside it); refuses one from newer code.
const store = openSave(dbPath(home));
const clock = new SystemClock();
// The owner's dials (written with the defaults on first start, for the owner to edit).
const settings = readSettings(home);
for (const w of settings.warnings) console.error(w);
console.log(`Dials (${settingsPath(home)}): ${JSON.stringify(settings.dials)}`);

let town: Town;
const print = (e: GameEvent) => {
  const line = feedLine(e, (id) => town.world.nameOf(id));
  if (line) console.log(formatFeedLine(line, town.world.state));
};

let mindOpts: Partial<TownOptions> = { dials: settings.dials };
let memory: MemoryStore | null = null;
let costs: CostLog | null = null;
let translator: Translator | null = null;
if (args.minds === true) {
  const apiKey = readApiKey(home);
  if (!apiKey) {
    console.error(`No API key found. Put ANTHROPIC_API_KEY=... in ${join(home, '.env')} (never in the repo).`);
    process.exit(1);
  }
  memory = new MemoryStore(dbPath(home));
  costs = new CostLog(join(home, 'costs'));
  const mind = new Mind({
    client: new AnthropicModel({ apiKey }),
    memory,
    costs,
    cards: CARDS,
    onError: (err) => console.error(`A thinking call failed: ${err instanceof Error ? err.constructor.name : 'Error'}${err && typeof err === 'object' && 'status' in err ? ` (HTTP ${String(err.status)})` : ''}`),
  });
  // Pak Osman thinks on the same model and the same cap: his calls are in the cost log as pak-osman.
  const osman = new ModelOsmanHead({ client: mind.client, costs, onError: mind.onError });
  // Miss de Souza too, a few short lines a weekday (in the cost log as miss-de-souza).
  const teacher = new ModelTeacherHead({ client: mind.client, costs, onError: mind.onError });
  // The owner's watch page can ask for English, on the same model and the same cap (in the cost log as watch-page).
  translator = new Translator({ client: mind.client, costs, file: join(home, 'translations.json'), onError: mind.onError });
  mindOpts = { ...mindOpts, brains: mindBrains(mind, fakeBrains), observer: mind.observe, osman, teacher };
}

// The watch page: the owner's view only, read-only towards the town.
const mem = memory;
const live = new LiveSource({
  label: mem ? 'Live town (thinking for real)' : 'Live town',
  msPerMinute: REAL_MS_PER_GAME_MINUTE,
  extras: mem ? (id, t) => extrasFrom((r, k, up, n) => mem.latest(r, k, up, n), id, t, town.world.state) : undefined,
  said: (id, n, since) => store.saidBy(id, n, since),
  moneyEvents: (since) => store.eventsSince(since, [...ECONOMY_EVENTS]),
  ledgerSince: (since) => store.ledgerSince(since),
  audit: () => lastAudit,
  spend: () => (costs ? { usd: costs.spentOn(costs.dayKey(clock.nowMs())), cap: dayCap(costs, clock.nowMs()) } : null),
});
const hooks = live.hooks();
const onEvent = (e: GameEvent) => {
  print(e);
  hooks.onEvent(e);
};

// A new town starts at the real hour, then runs on its own clock (saved with it): 4.8 game minutes a real minute.
const startMs = clock.nowMs();
town = Town.resume({ store, onEvent, onTick: hooks.onTick, ...mindOpts })
  ?? Town.create(numArg(args, 'seed', Date.now() % 2_147_483_647), gameMinuteFromMs(startMs) - 1, { anchorMs: startMs - REAL_MS_PER_GAME_MINUTE, store, onEvent, onTick: hooks.onTick, ...mindOpts });
const now = () => gameMinuteAt(town.world.state.clock, clock.nowMs());
live.attach(town.world);
// The feed survives a restart: refill it from the save's latest events (enough for a full page).
live.seed(store.recentEvents(FEED_KEPT * 10));
console.log(`Pixel Kampung is running. Saving to ${dbPath(home)}`);

const port = numArg(args, 'port', DEFAULT_PORT);
// Not awaited: the town's first minute never waits on the page.
const page = buildClient()
  .then((client) => startWatchServer({ source: live, client, assetsDir: ASSETS_DIR, port, lan: args.lan === true, ...(translator ? { translate: (t: string[]) => translator!.english(t) } : {}) }))
  .then((server) => {
    console.log(`Watch the kampung at ${server.url}  (this PC only)`);
    for (const u of server.lanUrls) console.log(`On a phone on the same Wi-Fi: ${u}`);
    return server;
  })
  .catch((err: unknown) => {
    // The town matters more than the page: keep running without it.
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    console.error(code === 'EADDRINUSE'
      ? `The watch page couldn't open: port ${port} is busy (try --port ${port + 1}). The town keeps running.`
      : `The watch page couldn't start (${err instanceof Error ? err.message : String(err)}). The town keeps running.`);
    return null;
  });

// The money check, once a game day (at midnight) and on start: the ledger replayed against every purse.
// Owner's log only; nothing a resident sees.
let auditedDay: number | null = null;
let lastAudit: string | null = null;
function audit(): void {
  const day = dayIndex(town.t);
  if (day === auditedDay) return;
  auditedDay = day;
  lastAudit = auditLedger(store.ledger(), town.world.state.residents).line;
  console.log(lastAudit);
}

let busy = false;
async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const t = now();
    if (t > town.t) await town.catchUp(t);
    audit();
    writeFileSync(heartbeatPath(home), JSON.stringify({ at: new Date(clock.nowMs()).toISOString(), t: town.t }));
  } finally {
    busy = false;
  }
}

await tick();
const timer = setInterval(() => { void tick(); }, 1000);

function stop(): void {
  clearInterval(timer);
  void page.then((server) => server?.close());
  live.close();
  store.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
