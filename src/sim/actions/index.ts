import type { Resident, World } from '../state.ts';
import { isNight } from '../time.ts';
import { type ActionResult, type Intent, no } from './common.ts';
import * as everyone from './everyone.ts';
import * as owners from './owners.ts';

export type { ActionResult, Intent } from './common.ts';

type Handler = (w: World, r: Resident, i: Intent) => ActionResult;

interface ActionDef {
  run: Handler;
  ownersOnly: boolean;
  /** How the character thinks of it. Shown to brains; in-world words only. */
  says: string;
  /** Whether it makes sense right where they are. */
  here?: (w: World, r: Resident) => boolean;
}

const atShop = (w: World, r: Resident) => everyone.shopHere(w, r) !== null;
const at = (id: string) => (w: World, r: Resident) => w.isAt(r, id);
const withPeople = (w: World, r: Resident) => w.nearby(r).some((o) => !w.isAsleep(o));

/** The whole v1 action space (spec §3). Nothing else can be done. */
export const ACTIONS: Record<string, ActionDef> = {
  walk_to: { run: everyone.walkTo, ownersOnly: false, says: 'walk to a place or a person (where)' },
  look_around: { run: everyone.lookAround, ownersOnly: false, says: 'look around' },
  say: { run: everyone.say, ownersOnly: false, says: 'say something (text, optionally to someone nearby)' },
  buy: { run: everyone.buy, ownersOnly: false, says: 'buy something here (item, how many)', here: atShop },
  sell: {
    run: everyone.sell, ownersOnly: false, says: 'sell something here (item, how many)',
    here: (w, r) => atShop(w, r) || (w.isAt(r, 'lorry-stop') && w.state.lorryHere),
  },
  offer_trade: { run: everyone.offerTrade, ownersOnly: false, says: 'offer someone a trade (to, what you give, what you want)', here: withPeople },
  accept_trade: {
    run: everyone.acceptTrade, ownersOnly: false, says: 'accept a trade someone offered you (from)',
    here: (w, r) => w.state.trades.some((t) => t.toId === r.id),
  },
  decline_trade: {
    run: everyone.declineTrade, ownersOnly: false, says: 'turn down a trade (from)',
    here: (w, r) => w.state.trades.some((t) => t.toId === r.id),
  },
  fish: { run: everyone.fish, ownersOnly: false, says: 'fish', here: at('jetty') },
  plant: { run: everyone.plant, ownersOnly: false, says: 'plant kangkong in a free bed', here: at('farm') },
  water: { run: everyone.water, ownersOnly: false, says: 'water your beds', here: at('farm') },
  harvest: { run: everyone.harvest, ownersOnly: false, says: 'harvest your beds', here: at('farm') },
  eat: { run: everyone.eat, ownersOnly: false, says: 'eat or drink something you carry (item)', here: (_w, r) => Object.keys(r.items).length > 0 },
  sleep: { run: everyone.sleep, ownersOnly: false, says: 'sleep', here: (w, r) => w.isAt(r, r.homeId) },
  accept_job: {
    run: everyone.acceptJob, ownersOnly: false, says: 'accept a job someone offered you (from)',
    here: (w, r) => w.state.jobOffers.some((o) => o.workerId === r.id),
  },
  quit_job: { run: everyone.quitJob, ownersOnly: false, says: 'quit your job', here: (w, r) => w.jobOf(r.id) !== null },
  work_shift: { run: everyone.workShift, ownersOnly: false, says: 'work your shift', here: (w, r) => w.jobOf(r.id) !== null },
  give: { run: everyone.give, ownersOnly: false, says: 'give someone money or something you carry (to, item and how many, or money)', here: withPeople },
  read_notice_board: { run: everyone.readNoticeBoard, ownersOnly: false, says: 'read the notice board', here: at('notice-board') },
  pin_note: { run: everyone.pinNote, ownersOnly: false, says: 'pin a note on the board (text)', here: at('notice-board') },
  set_price: {
    run: owners.setPrice, ownersOnly: true, says: 'set a price at your shop (item, price, sell or buy, and for buying how many you want)',
    here: (w, r) => { const s = w.shopOf(r.id); return !!s && w.isAt(r, s.id); },
  },
  offer_job: { run: owners.offerJob, ownersOnly: true, says: 'offer someone a job (to, wage per shift, start hour, hours)', here: withPeople },
  let_go: {
    run: owners.letGo, ownersOnly: true, says: 'let a worker go (who)',
    here: (w, r) => w.state.jobs.some((j) => j.employerId === r.id),
  },
  pay_wages: {
    run: owners.payWages, ownersOnly: true, says: 'pay a worker wages you owe (to, optionally part of it)',
    here: (w, r) => w.state.owed.some((o) => o.employerId === r.id),
  },
  order_stock: {
    run: owners.orderStock, ownersOnly: true, says: 'order stock from the lorry (item, how many)',
    here: (w, r) => w.isAt(r, 'lorry-stop') && w.state.lorryHere,
  },
  cook: {
    run: owners.cook, ownersOnly: false, says: 'cook in the kitchen (dish, how many batches)',
    here: (w, r) => (w.shopOf(r.id)?.id === 'kopitiam' && w.isAt(r, 'kopitiam'))
      || (r.activity?.kind === 'working' && w.jobOf(r.id)?.placeId === 'kopitiam'),
  },
};

const BUSY: Record<string, string> = {
  walking: "You're on your way somewhere.",
  fishing: "You're busy fishing.",
  working: "You're in the middle of your shift.",
  sleeping: "You're asleep.",
};

/** What can still be done in the middle of a shift, without leaving it. */
export const ON_SHIFT = new Set(['look_around', 'say', 'cook']);

/** Validates and performs one action. Every refusal is in-world text. */
export function act(w: World, residentId: string, intent: unknown): ActionResult {
  const r = w.resident(residentId);
  const verb = intent && typeof intent === 'object' && typeof (intent as Intent).verb === 'string'
    ? (intent as Intent).verb.trim().toLowerCase().replace(/\s+/g, '_') : '';
  if (r.activity && !(r.activity.kind === 'working' && ON_SHIFT.has(verb))) return no(BUSY[r.activity.kind]!);
  if (isNight(w.t)) return no("It's the middle of the night. You should be asleep.");
  const def = Object.hasOwn(ACTIONS, verb) ? ACTIONS[verb] : undefined;
  if (!def) return no("You're not sure how to do that.");
  if (def.ownersOnly && r.role !== 'owner') return no("That's for shopkeepers. You don't have a shop.");
  return def.run(w, r, intent as Intent);
}

/** What this resident could sensibly try right now, in their own words ("walk to", "pay wages"). */
export function availableActions(w: World, r: Resident): { verb: string; says: string }[] {
  const working = r.activity?.kind === 'working';
  return Object.entries(ACTIONS)
    .filter(([verb, d]) => (!d.ownersOnly || r.role === 'owner') && (!d.here || d.here(w, r)) && (!working || ON_SHIFT.has(verb)))
    .map(([verb, d]) => ({ verb: verb.replace(/_/g, ' '), says: d.says }));
}
