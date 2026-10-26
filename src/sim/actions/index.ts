import { countGoods, type Resident, type World } from '../state.ts';
import { ITEMS, type ItemId } from '../items.ts';
import { dayIndex, isNight } from '../time.ts';
import { type ActionResult, type Intent, no } from './common.ts';
import * as chores from './chores.ts';
import * as debts from './debts.ts';
import * as everyone from './everyone.ts';
import { offersFor } from './haggle.ts';
import * as owners from './owners.ts';
import * as teach from './teach.ts';
import * as households from '../households.ts';
import { TOO_ILL, TOO_ILL_FOR } from '../sickness.ts';
import { doneToday, openJobHere, whatOf } from '../mr-lim.ts';
import { formatMoney } from '../money.ts';
import { moneyOf, ok as yes } from './common.ts';

const res = (x: { ok: boolean; reply: string }): ActionResult => (x.ok ? yes(x.reply) : no(x.reply));
import { mastered, skillLevel } from '../skills.ts';

export type { ActionResult, Intent } from './common.ts';

type Handler = (w: World, r: Resident, i: Intent) => ActionResult;

interface ActionDef {
  run: Handler;
  ownersOnly: boolean;
  /** How the character thinks of it. Shown to brains; in-world words only (some depend on who's doing it). */
  says: string | ((w: World, r: Resident) => string);
  /** Whether it makes sense right where they are. */
  here?: (w: World, r: Resident) => boolean;
}

const atShop = (w: World, r: Resident) => everyone.shopHere(w, r) !== null;
/** At a shop with someone to buy from: one being minded, or your own (taking from your own stock). */
const atServedShop = (w: World, r: Resident) => { const s = everyone.shopHere(w, r); return !!s && (s.ownerId === r.id || everyone.isStaffed(w, s)); };
const atLorry = (w: World, r: Resident) => w.isAt(r, 'lorry-stop') && w.state.lorryHere;
const at = (id: string) => (w: World, r: Resident) => w.isAt(r, id);
const withPeople = (w: World, r: Resident) => w.nearby(r).some((o) => !w.isAsleep(o));
/** Something someone offered or asked r that waits on a yes or no. */
const somethingOffered = (w: World, r: Resident) => w.state.debtOffers.some((o) => o.toId === r.id) || offersFor(w, r).length > 0
  || w.state.errands.some((e) => !e.taken && e.runnerId === r.id) || w.state.lessonOffers.some((o) => o.learnerId === r.id);

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
  buy: {
    run: everyone.buy, ownersOnly: false, here: (w, r) => atServedShop(w, r) || atLorry(w, r),
    says: (w, r) => (atLorry(w, r) ? 'buy something off the lorry (item, amount; money if you offer less than he asks; later: true to ask to pay him another day)'
      : 'buy something here (item, amount, and money if you offer less than the price)'),
  },
  sell: {
    run: everyone.sell, ownersOnly: false, here: (w, r) => atShop(w, r) || atLorry(w, r),
    says: (w, r) => (atLorry(w, r) ? 'sell something to the lorry man (item, amount, and money if you ask more than he pays)' : 'sell something here (item, amount)'),
  },
  ask_to_bring: {
    run: owners.askToBring, ownersOnly: false, says: 'ask the lorry man to bring something next time (item, amount, and money for a deposit)', here: (w, r) => atLorry(w, r),
  },
  collect: {
    run: owners.collect, ownersOnly: false, says: 'collect what you asked the lorry man to bring (later: true to pay him another day)',
    here: (w, r) => atLorry(w, r) && w.state.osman.orders.some((o) => o.who === r.id && o.brought !== null),
  },
  pay_lorry_man: {
    run: owners.payLorryMan, ownersOnly: false, says: 'pay the lorry man what you owe him (money for only part)',
    here: (w, r) => atLorry(w, r) && (w.state.osman.accounts[r.id]?.owes ?? 0) > 0,
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
    here: (w, r) => somethingOffered(w, r),
  },
  refuse: {
    run: debts.refuse, ownersOnly: false, says: 'turn down what someone offered or asked of you, or a price offered at your counter (person, and item for a price at your counter)',
    here: (w, r) => somethingOffered(w, r),
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
  teach: {
    run: teach.teach, ownersOnly: false, says: 'show someone nearby how to do what you do best (person, and item: what)',
    here: (w, r) => mastered(r).length > 0 && withPeople(w, r),
  },
  ask_errand: {
    run: chores.askErrand, ownersOnly: false, says: 'ask someone to run an errand for pay (person; words: "fetch water", or "take something to someone"; money)', here: withPeople,
  },
  gather_firewood: { run: (w, r) => chores.gatherFirewood(w, r), ownersOnly: false, says: 'gather firewood', here: at('farm') },
  do_odd_job: {
    run: (w, r) => chores.doOddJob(w, r), ownersOnly: false,
    says: (w, r) => { const j = openJobHere(w, r); return j ? `do Mr Lim's odd job here (${whatOf(j.kind)}, ${formatMoney(j.pay)})` : "do Mr Lim's odd job here"; },
    here: (w, r) => !!openJobHere(w, r) && !doneToday(w, r),
  },
  forage: {
    run: (w, r) => chores.forage(w, r), ownersOnly: false, here: (w, r) => (w.isAt(r, 'farm') || w.isAt(r, 'jetty')) && chores.canForageToday(w, r),
    says: (w, r) => (w.isAt(r, 'jetty') ? 'look for a coconut on the palms' : 'look for wild kangkong or bananas'),
  },
  fish: { run: everyone.fish, ownersOnly: false, says: 'fish', here: at('jetty') },
  cast_net: {
    run: (w, r) => chores.castNet(w, r), ownersOnly: false, says: 'cast a net from the jetty',
    here: (w, r) => w.isAt(r, 'jetty') && skillLevel(r, 'fishing') >= 3 && chores.netsMended(w, r),
  },
  plant: {
    run: everyone.plant, ownersOnly: false, here: at('farm'),
    says: (_w, r) => {
      const more = (['chilli', 'papaya'] as const).filter((c) => skillLevel(r, 'farming') >= everyone.CROPS[c].level);
      return more.length ? `plant a free bed (item: kangkong, ${more.map((c) => (c === 'papaya' ? 'or a papaya tree' : 'chilli')).join(', ')})` : 'plant kangkong in a free bed';
    },
  },
  water: { run: everyone.water, ownersOnly: false, says: 'water your beds', here: at('farm') },
  harvest: { run: everyone.harvest, ownersOnly: false, says: 'harvest your beds', here: at('farm') },
  eat: {
    run: everyone.eat, ownersOnly: false, says: 'eat or drink something you carry, or from your own shop (item)',
    here: (w, r) => (Object.keys(r.items) as ItemId[]).some((i) => ITEMS[i]?.food && countGoods(r.items, i) > 0) || everyone.shopHere(w, r)?.ownerId === r.id,
  },
  sleep: { run: everyone.sleep, ownersOnly: false, says: 'sleep', here: (w, r) => w.isAt(r, w.home(r).id) },
  pay_rent: {
    run: (w, r, i) => {
      if (i.money === undefined || i.money === null || i.money === '') return res(households.payRent(w, r, null));
      const m = moneyOf(i.money);
      return m === null || m === 0 ? no("That doesn't sound like money.") : res(households.payRent(w, r, m));
    },
    ownersOnly: false, says: 'pay Mr Lim the rent you owe (money for only part)',
    here: (w, r) => w.isAt(r, 'village-head') && (households.heldBy(w, r.id).some(([, p]) => p.owing > 0) || (w.state.arrears[r.id] ?? 0) > 0),
  },
  buy_place: {
    run: (w, r, i) => res(households.buyPlace(w, r, i.item)), ownersOnly: false, says: 'buy your house from Mr Lim outright (item: house, or stall)',
    here: (w, r) => w.isAt(r, 'village-head') && households.heldBy(w, r.id).length > 0,
  },
  rent_to_own: {
    run: (w, r, i) => res(households.rentToOwn(w, r, i.item)), ownersOnly: false, says: 'ask Mr Lim to let you buy your house week by week (item: house, or stall)',
    here: (w, r) => w.isAt(r, 'village-head') && households.heldBy(w, r.id).some(([, p]) => !p.rentToOwn),
  },
  rent_house: {
    run: (w, r) => res(households.rentHouse(w, r)), ownersOnly: false, says: 'rent a free house from Mr Lim',
    here: (w, r) => w.isAt(r, 'village-head') && Object.entries(w.state.property).some(([id, p]) => id.startsWith('house-') && p.holder === null)
      && w.state.property[r.homeId]?.holder !== r.id,
  },
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
    run: owners.orderStock, ownersOnly: true, says: 'buy stock for your shop off the lorry (item, amount; money if you offer less than he asks; later: true to pay another day)',
    here: (w, r) => atLorry(w, r),
  },
  cook: {
    run: owners.cook, ownersOnly: false, says: 'cook in the kitchen (item: the dish; details: batches)',
    here: (w, r) => (w.shopOf(r.id)?.id === 'kopitiam' && w.isAt(r, 'kopitiam'))
      || (r.activity?.kind === 'working' && w.jobOf(r.id)?.placeId === 'kopitiam')
      || (!r.activity && w.isAt(r, r.homeId)),
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
  if (r.ill && TOO_ILL_FOR.has(verb)) return no(TOO_ILL);
  return def.run(w, r, intent as Intent);
}

/** What this resident could sensibly try right now, in their own words ("walk to", "pay wages"). */
export function availableActions(w: World, r: Resident): { verb: string; says: string }[] {
  const working = r.activity?.kind === 'working';
  return Object.entries(ACTIONS)
    .filter(([verb, d]) => (!d.ownersOnly || r.role === 'owner') && (!d.here || d.here(w, r)) && (!working || ON_SHIFT.has(verb)) && (!r.stove || AT_STOVE.has(verb))
      && !(r.ill && TOO_ILL_FOR.has(verb)))
    .map(([verb, d]) => ({ verb: verb.replace(/_/g, ' '), says: typeof d.says === 'string' ? d.says : d.says(w, r) }));
}
