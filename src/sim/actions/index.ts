import type { Resident, World } from '../state.ts';
import { dayIndex, isNight } from '../time.ts';
import { type ActionResult, type Intent, no } from './common.ts';
import * as chores from './chores.ts';
import * as debts from './debts.ts';
import * as everyone from './everyone.ts';
import { offersFor } from './haggle.ts';
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
  walk_to: { run: everyone.walkTo, ownersOnly: false, says: 'walk to a place or a person you know, or north, south, east or west (where)' },
  go_with: {
    run: everyone.goWith, ownersOnly: false, says: 'go along with someone who is setting off (person)',
    here: (w, r) => w.state.residents.some((o) => everyone.canGoWith(w, r, o)),
  },
  // Not offered: the notes already say where you are and who's there (a typed one still answers).
  look_around: { run: everyone.lookAround, ownersOnly: false, says: 'look around', here: () => false },
  say: { run: everyone.say, ownersOnly: false, says: 'say something (words, and person if it is meant for someone)' },
  buy: { run: everyone.buy, ownersOnly: false, says: 'buy something here (item, amount, and money if you offer less than the price)', here: atShop },
  sell: {
    run: everyone.sell, ownersOnly: false, says: 'sell something here (item, amount)',
    here: (w, r) => atShop(w, r) || (w.isAt(r, 'lorry-stop') && w.state.lorryHere),
  },
  offer_trade: { run: everyone.offerTrade, ownersOnly: false, says: 'offer someone a trade (person; details: give and want, each with items and money)', here: withPeople },
  accept_trade: {
    run: everyone.acceptTrade, ownersOnly: false, says: 'accept a trade someone offered you (person)',
    here: (w, r) => w.state.trades.some((t) => t.toId === r.id),
  },
  decline_trade: {
    run: everyone.declineTrade, ownersOnly: false, says: 'turn down a trade (person)',
    here: (w, r) => w.state.trades.some((t) => t.toId === r.id),
  },
  lend: { run: debts.lend, ownersOnly: false, says: 'lend someone money, if they agree (person, money)', here: withPeople },
  borrow: { run: debts.borrow, ownersOnly: false, says: 'ask someone to lend you money (person, money)', here: withPeople },
  write_iou: {
    run: debts.writeIou, ownersOnly: false, says: 'write someone an IOU saying you owe them (person, money, words: what for)', here: withPeople,
  },
  agree: {
    run: debts.agree, ownersOnly: false, says: 'agree to what someone offered or asked of you, or a price offered at your counter (person, and item for a price at your counter)',
    here: (w, r) => w.state.debtOffers.some((o) => o.toId === r.id) || offersFor(w, r).length > 0 || w.state.errands.some((e) => !e.taken && e.runnerId === r.id),
  },
  refuse: {
    run: debts.refuse, ownersOnly: false, says: 'turn down what someone offered or asked of you, or a price offered at your counter (person, and item for a price at your counter)',
    here: (w, r) => w.state.debtOffers.some((o) => o.toId === r.id) || offersFor(w, r).length > 0 || w.state.errands.some((e) => !e.taken && e.runnerId === r.id),
  },
  repay: {
    run: debts.repay, ownersOnly: false, says: 'pay back money you owe (person, and money to pay only part)',
    here: (w, r) => w.state.debts.some((d) => d.debtor === r.id),
  },
  let_off: {
    run: debts.letOff, ownersOnly: false, says: 'let someone off what they owe you (person, and money for only part)',
    here: (w, r) => w.state.debts.some((d) => d.creditor === r.id),
  },
  fetch_water: { run: (w, r) => chores.fetchWater(w, r), ownersOnly: false, says: 'fetch a pail of water', here: at('well') },
  mend_nets: {
    run: (w, r) => chores.mendNets(w, r), ownersOnly: false, says: 'mend your nets',
    here: (w, r) => w.isAt(r, 'jetty') && !(r.mended && r.mended.day === dayIndex(w.t) && r.mended.left > 0),
  },
  sweep: {
    run: (w, r) => chores.sweep(w, r), ownersOnly: false, says: 'sweep the shop',
    here: (w, r) => { const s = chores.sweepable(w, r); return !!s && w.shop(s)!.sweptDay !== dayIndex(w.t); },
  },
  help: {
    run: chores.help, ownersOnly: false, says: 'help someone with their work here (person)',
    here: (w, r) => w.state.residents.some((o) => o.id !== r.id && w.knowsPerson(r, o.id) && chores.canHelp(w, r, o) !== null),
  },
  ask_errand: {
    run: chores.askErrand, ownersOnly: false, says: 'ask someone to run an errand for pay (person; words: "fetch water", or "take something to someone"; money)', here: withPeople,
  },
  fish: { run: everyone.fish, ownersOnly: false, says: 'fish', here: at('jetty') },
  plant: { run: everyone.plant, ownersOnly: false, says: 'plant kangkong in a free bed', here: at('farm') },
  water: { run: everyone.water, ownersOnly: false, says: 'water your beds', here: at('farm') },
  harvest: { run: everyone.harvest, ownersOnly: false, says: 'harvest your beds', here: at('farm') },
  eat: {
    run: everyone.eat, ownersOnly: false, says: 'eat or drink something you carry, or from your own shop (item)',
    here: (w, r) => Object.keys(r.items).length > 0 || everyone.shopHere(w, r)?.ownerId === r.id,
  },
  sleep: { run: everyone.sleep, ownersOnly: false, says: 'sleep', here: (w, r) => w.isAt(r, r.homeId) },
  accept_job: {
    run: everyone.acceptJob, ownersOnly: false, says: 'accept a job someone offered you (person)',
    here: (w, r) => w.state.jobOffers.some((o) => o.workerId === r.id),
  },
  quit_job: { run: everyone.quitJob, ownersOnly: false, says: 'quit your job', here: (w, r) => w.jobOf(r.id) !== null },
  work_shift: { run: everyone.workShift, ownersOnly: false, says: 'work your shift', here: (w, r) => w.jobOf(r.id) !== null },
  give: { run: everyone.give, ownersOnly: false, says: 'give someone money or something you carry (person, and item and amount, or money)', here: withPeople },
  read_notice_board: { run: everyone.readNoticeBoard, ownersOnly: false, says: 'read the notice board', here: at('notice-board') },
  pin_note: { run: everyone.pinNote, ownersOnly: false, says: 'pin a note on the board (words)', here: at('notice-board') },
  set_price: {
    run: owners.setPrice, ownersOnly: true, says: 'set a price at your shop (item; details: price, and for a price you pay rather than charge, buying true and wanted: the most you will take)',
    here: (w, r) => { const s = w.shopOf(r.id); return !!s && w.isAt(r, s.id); },
  },
  offer_job: { run: owners.offerJob, ownersOnly: true, says: 'offer someone a job (person; details: wage for a shift, start: the hour it begins, hours)', here: withPeople },
  let_go: {
    run: owners.letGo, ownersOnly: true, says: 'let a worker go (person)',
    here: (w, r) => w.state.jobs.some((j) => j.employerId === r.id),
  },
  pay_wages: {
    run: owners.payWages, ownersOnly: true, says: 'pay a worker wages you owe (person, and money to pay only part)',
    here: (w, r) => w.state.owed.some((o) => o.employerId === r.id),
  },
  order_stock: {
    run: owners.orderStock, ownersOnly: true, says: 'order stock from the lorry (item, amount)',
    here: (w, r) => w.isAt(r, 'lorry-stop') && w.state.lorryHere,
  },
  cook: {
    run: owners.cook, ownersOnly: false, says: 'cook in the kitchen (item: the dish; details: batches)',
    here: (w, r) => (w.shopOf(r.id)?.id === 'kopitiam' && w.isAt(r, 'kopitiam'))
      || (r.activity?.kind === 'working' && w.jobOf(r.id)?.placeId === 'kopitiam'),
  },
};

const BUSY: Record<string, string> = {
  chore: "You're busy.",
  walking: "You're on your way somewhere.",
  fishing: "You're busy fishing.",
  working: "You're in the middle of your shift.",
  sleeping: "You're asleep.",
};

/** What can be done while a batch is cooking. */
export const AT_STOVE = new Set(['look_around', 'say']);

/** What can still be done in the middle of a shift, without leaving it. */
export const ON_SHIFT = new Set(['look_around', 'say', 'cook', 'agree', 'refuse', 'sweep']);

/** The action asked for, as written in ACTIONS ("Walk to" → walk_to); '' if none. */
export function verbOf(intent: unknown): string {
  return intent && typeof intent === 'object' && typeof (intent as Intent).verb === 'string'
    ? (intent as Intent).verb.trim().toLowerCase().replace(/\s+/g, '_') : '';
}

/** Validates and performs one action. Every refusal is in-world text. */
export function act(w: World, residentId: string, intent: unknown): ActionResult {
  const r = w.resident(residentId);
  const verb = verbOf(intent);
  if (r.activity?.kind === 'chore') return no(chores.busyAt(r.activity.chore));
  if (r.activity && !(r.activity.kind === 'working' && ON_SHIFT.has(verb))) return no(BUSY[r.activity.kind]!);
  if (r.stove && !AT_STOVE.has(verb)) return no("You're busy at the stove.");
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
    .filter(([verb, d]) => (!d.ownersOnly || r.role === 'owner') && (!d.here || d.here(w, r)) && (!working || ON_SHIFT.has(verb)) && (!r.stove || AT_STOVE.has(verb)))
    .map(([verb, d]) => ({ verb: verb.replace(/_/g, ' '), says: d.says }));
}
