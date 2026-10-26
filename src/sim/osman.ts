/**
 * Pak Osman, the lorry trader (docs/design/village-characters.md): a village
 * character with a scripted body and a bounded head. He comes most mornings
 * with one lorry's worth of room, shared between the goods he brings from
 * town and the fish and vegetables he buys here. His prices, his answers to a
 * haggle and his news can come from a model (src/mind/osman-head.ts); the
 * code here keeps every answer inside his bounds and falls back to his
 * scripted ways when there's no head or no money for thinking.
 *
 * Money moves only through the ledger: his purse is the outside `lorry`
 * account, so money he pays in or takes away appears or vanishes there.
 * What residents owe him and how well he knows them is his own ledger
 * (`OsmanState.accounts`), not memory.
 */
import { ITEMS, quantityLabel, type ItemId } from './items.ts';
import { formatMoney, type Cents } from './money.ts';
import { Rng } from './rng.ts';
import { addGoods, countGoods, GROWN_AGE, LORRY_ID, type Goods, type Resident, type World } from './state.ts';
import { dayIndex, minuteOfDay } from './time.ts';

export const OSMAN = 'Pak Osman';
export const OSMAN_ID = 'pak-osman';

/** About when he comes (06:30, give or take ten minutes) and how long he stays. */
export const ARRIVES = 6 * 60 + 30;
export const ARRIVE_SPREAD = 10;
/** The first half of the day: about half past six to about noon (owner, 2026-10-26). */
export const STAYS = 330;
export const STAY_SPREAD = 10;

/** One lorry's room a day, in sacks and baskets: what he brings and what he buys share it. */
export const LOAD = 120;
/** He brings goods for sale into no more than this share of it, leaving room to buy. */
export const GOODS_SHARE = 0.6;

/** What he brings from town. */
export const BRINGS = ['rice', 'coffee', 'bread', 'kerosene', 'pot'] as const satisfies readonly ItemId[];
/** What he buys here. */
export const TAKES = ['fish', 'vegetables'] as const satisfies readonly ItemId[];
export type Brought = (typeof BRINGS)[number];

/** Town supply: how many of each the wholesaler has for him on a day, at least and at most. */
export const SUPPLY: Record<Brought, [number, number]> = { rice: [16, 36], coffee: [3, 9], bread: [10, 26], kerosene: [3, 10], pot: [1, 3] };

/** Town reference prices, per unit: what things fetch at the town market (the economy check will measure these later). */
export const TOWN_PRICES: Partial<Record<ItemId, Cents>> = { rice: 16, coffee: 40, bread: 12, kerosene: 30, pot: 5, fish: 25, vegetables: 16 };
/** He buys at 40–80% of the town price and sells at 110–160%: never at a loss. */
export const BUY_BOUNDS: [number, number] = [0.4, 0.8];
export const SELL_BOUNDS: [number, number] = [1.1, 1.6];

/** Haggles a visit he thinks over; after that it's take it or leave it. */
export const HAGGLES_PER_VISIT = 10;
/** Days dealt with him before someone is a regular. */
export const REGULAR_DAYS = 5;
/** Regulars get this much better; anyone who cheated him this much worse. */
export const REGULAR_EASE = 0.05;
export const CHEAT_MARKUP = 0.15;
/** A debt to him lasts a week. */
export const DEBT_MINUTES = 7 * 1440;
/** Credit cap: this share of a typical grown resident's purse (a stand-in for a week's income until the economy check lands), and never under the floor. */
export const CREDIT_SHARE = 0.25;
export const CREDIT_FLOOR: Cents = 100;
/** The most of one thing anyone can ask him to bring. */
export const MAX_ORDER = 40;
/** Purses below this (the middle grown resident's) mean money is tight; above the other, it's piling up. */
export const TIGHT_PURSE: Cents = 300;
export const FLUSH_PURSE: Cents = 4000;

export type Side = 'sells' | 'buys';
export type Mood = 'slow' | 'usual' | 'brisk';

/** What he knows of one resident, from dealing with them. */
export interface OsmanAccount {
  owes: Cents;
  /** When the oldest unpaid part began. */
  since: number | null;
  /** Days they've dealt with him, and the last. */
  days: number;
  lastDay: number | null;
  /** They let a debt run past its week: no more credit, and dearer. He never forgets. */
  cheated: boolean;
}

/** Something asked for next time: priced when asked, with any deposit paid. Filled (perhaps only partly) when he next comes. */
export interface LorryOrder {
  id: number;
  who: string;
  item: Brought;
  qty: number;
  each: Cents;
  deposit: Cents;
  /** For a shop's shelves (an owner asking), or into their hands. */
  forShop: string | null;
  /** How many he brought, once he's come with it; null while it waits for next time. */
  brought: number | null;
}

/** An offer waiting on his answer (the next minute). `cents` is the whole sum. */
export interface LorryOffer {
  id: number;
  who: string;
  side: Side;
  item: ItemId;
  qty: number;
  cents: Cents;
  forShop: string | null;
  later: boolean;
}

export interface Visit {
  day: number;
  leaves: number;
  /** Goods on board for sale, and goods held for orders. */
  goods: Goods;
  held: Goods;
  /** Fish and vegetables bought so far. */
  produce: Goods;
  /** Today's list. */
  sells: Partial<Record<ItemId, Cents>>;
  buys: Partial<Record<ItemId, Cents>>;
  /** Whether his head has had its once-a-visit say on the prices. */
  priced: boolean;
  haggles: number;
  /** A counter he made someone: their own price today, per unit ("sells:rice"). */
  deals: Record<string, Record<string, Cents>>;
  offers: LorryOffer[];
  /** His line of news from town today, and who's heard it. */
  gossip: string | null;
  heard: string[];
}

export interface OsmanState {
  lastDay: number | null;
  visit: Visit | null;
  accounts: Record<string, OsmanAccount>;
  orders: LorryOrder[];
}

export function freshOsman(): OsmanState {
  return { lastDay: null, visit: null, accounts: {}, orders: [] };
}

// --- schedule -----------------------------------------------------------

/** The day's own draws, from the world's seed: the same for a town every time, and taking nothing from its main RNG. */
export function dayRng(w: World, day: number, salt = 0): Rng {
  return new Rng((Math.imul(w.state.seed ^ 0x5f3759df, 2654435761) ^ Math.imul(day + 1, 40503) ^ salt) >>> 0);
}

/** When he comes and goes on a day (minutes of the day): every day, Sundays too (owner, 2026-10-26). */
export function scheduleFor(w: World, day: number): { arrives: number; leaves: number } {
  const rng = dayRng(w, day, 1);
  const arrives = ARRIVES + rng.int(-ARRIVE_SPREAD, ARRIVE_SPREAD);
  return { arrives, leaves: arrives + STAYS + rng.int(-STAY_SPREAD, STAY_SPREAD) };
}

/** Town supply on a day: random within its bounds. */
export function supplyFor(w: World, day: number): Record<Brought, number> {
  const rng = dayRng(w, day, 2);
  return Object.fromEntries(BRINGS.map((g) => [g, rng.int(SUPPLY[g][0], SUPPLY[g][1])])) as Record<Brought, number>;
}

// --- prices -------------------------------------------------------------

/** The lowest and highest he'll go for an item on a side. */
export function bounds(side: Side, item: ItemId): [Cents, Cents] | null {
  const town = Object.hasOwn(TOWN_PRICES, item) ? TOWN_PRICES[item] : undefined;
  if (!town) return null;
  const [lo, hi] = side === 'sells' ? SELL_BOUNDS : BUY_BOUNDS;
  return [Math.ceil(town * lo), Math.floor(town * hi)];
}

export function clampPrice(side: Side, item: ItemId, cents: number): Cents | null {
  const b = bounds(side, item);
  if (!b || !Number.isFinite(cents)) return null;
  return Math.max(b[0], Math.min(b[1], Math.round(cents)));
}

/** The economy check's reading of the kampung, in his terms (scripted, free): the middle grown resident's purse. */
export function tradeMood(w: World): Mood {
  const purses = w.state.residents.filter((r) => w.ageOf(r) >= GROWN_AGE).map((r) => r.money).sort((a, b) => a - b);
  const mid = purses.length ? purses[Math.floor(purses.length / 2)]! : 0;
  return mid < TIGHT_PURSE ? 'slow' : mid > FLUSH_PURSE ? 'brisk' : 'usual';
}

/** His scripted list: dearer when town supply is short or money is piling up; paying more when trade is slow, less when his lorry's filling. */
export function scriptedPrices(w: World, v: Pick<Visit, 'goods' | 'held'>, supply: Record<Brought, number>): { sells: Partial<Record<ItemId, Cents>>; buys: Partial<Record<ItemId, Cents>> } {
  const mood = tradeMood(w);
  const sells: Partial<Record<ItemId, Cents>> = {};
  for (const g of BRINGS) {
    const [lo, hi] = SUPPLY[g];
    const short = supply[g] < (lo + hi) / 2 ? 0.1 : 0;
    sells[g] = clampPrice('sells', g, TOWN_PRICES[g]! * (1.25 + short + (mood === 'brisk' ? 0.1 : 0)))!;
  }
  const buys: Partial<Record<ItemId, Cents>> = {};
  const full = onBoard(v.goods) + onBoard(v.held) > LOAD * 0.5 ? -0.05 : 0;
  for (const g of TAKES) buys[g] = clampPrice('buys', g, TOWN_PRICES[g]! * (0.6 + (mood === 'slow' ? 0.1 : 0) + full))!;
  return { sells, buys };
}

export function account(w: World, id: string): OsmanAccount | null {
  return w.state.osman.accounts[id] ?? null;
}

export function isRegular(a: OsmanAccount | null): boolean {
  return !!a && !a.cheated && a.days >= REGULAR_DAYS;
}

/** What he asks of r for one (sells) or pays r for one (buys) today: a counter he made them, regulars better, cheats worse, all within bounds. */
export function priceFor(w: World, r: Resident, side: Side, item: ItemId): Cents | null {
  const v = w.state.osman.visit;
  const list = v?.[side][item];
  if (!v || !list) return null;
  const a = account(w, r.id);
  const lean = a?.cheated ? CHEAT_MARKUP : isRegular(a) ? -REGULAR_EASE : 0;
  const base = clampPrice(side, item, side === 'sells' ? list * (1 + lean) : list * (1 - lean))!;
  const deal = v.deals[r.id]?.[`${side}:${item}`];
  if (deal === undefined) return base;
  return side === 'sells' ? Math.min(base, deal) : Math.max(base, deal);
}

// --- the lorry and its room ---------------------------------------------

export function onBoard(g: Goods): number {
  return Object.values(g).reduce((n, k) => n + (k ?? 0), 0);
}

/** Room left on the lorry. */
export function room(v: Visit): number {
  return Math.max(0, LOAD - onBoard(v.goods) - onBoard(v.held) - onBoard(v.produce));
}

export function lorryHere(w: World): boolean {
  return w.state.osman.visit !== null;
}

/** What a typical grown resident has: a regular may owe him up to a share of it. */
export function creditCap(w: World): Cents {
  const purses = w.state.residents.filter((r) => w.ageOf(r) >= GROWN_AGE).map((r) => r.money).sort((a, b) => a - b);
  const mid = purses.length ? purses[Math.floor(purses.length / 2)]! : 0;
  return Math.max(CREDIT_FLOOR, Math.round(mid * CREDIT_SHARE));
}

/** How much more r may put on their slate, or why not, in his words. */
export function creditRoom(w: World, r: Resident): Cents | string {
  const a = account(w, r.id);
  if (a?.cheated) return `${OSMAN} won't give you credit: he hasn't forgotten the money you let run.`;
  if (!isRegular(a)) return `${OSMAN} only gives credit to people he knows well.`;
  return Math.max(0, creditCap(w) - a!.owes);
}

function touch(w: World, r: Resident): OsmanAccount {
  const day = dayIndex(w.t);
  const a = w.state.osman.accounts[r.id] ??= { owes: 0, since: null, days: 0, lastDay: null, cheated: false };
  if (a.lastDay !== day) {
    a.days++;
    a.lastDay = day;
  }
  return a;
}

function meet(w: World, r: Resident): void {
  if (w.state.osman.accounts[r.id]) return;
  w.state.osman.accounts[r.id] = { owes: 0, since: null, days: 0, lastDay: null, cheated: false };
  w.remember(r.id, `The lorry man nods to you from his cab. He's ${OSMAN}, a driver for a wholesaler at the town market.`);
}

/** The lorry's comings and goings, one game minute (called from the tick). */
export function osmanMinute(w: World): void {
  const o = w.state.osman;
  const day = dayIndex(w.t);
  const mod = minuteOfDay(w.t);
  if (o.visit && w.t >= o.visit.leaves) depart(w);
  if (!o.visit && o.lastDay !== day) {
    const s = scheduleFor(w, day);
    if (s && mod >= s.arrives && mod < s.leaves) arrive(w, w.t - mod + s.leaves);
  }
  w.state.lorryHere = o.visit !== null;
  const v = o.visit;
  if (!v) return;
  for (const r of w.state.residents) {
    if (w.isAsleep(r) || !w.isAt(r, 'lorry-stop')) continue;
    meet(w, r);
    if (v.gossip && !v.heard.includes(r.id)) {
      v.heard.push(r.id);
      w.remember(r.id, `${OSMAN} says: "${v.gossip}"`);
    }
  }
}

/** He comes in: any debt past its week marks its debtor, orders are filled from town supply first, and today's list goes up. */
export function arrive(w: World, leaves: number): void {
  const o = w.state.osman;
  const day = dayIndex(w.t);
  o.lastDay = day;
  for (const a of Object.values(o.accounts)) {
    if (a.owes > 0 && a.since !== null && w.t - a.since > DEBT_MINUTES) a.cheated = true;
  }
  const supply = supplyFor(w, day);
  const sent = { ...supply };
  const goods: Goods = {};
  const held: Goods = {};
  const space = Math.floor(LOAD * GOODS_SHARE);
  let used = 0;
  // Orders come first, in the order asked; whatever town couldn't spare (or the lorry couldn't take) doesn't come.
  for (const ord of o.orders) {
    if (ord.brought !== null) continue;
    // Orders take at most half of what town sends of a thing: the rest is for whoever comes.
    const n = Math.max(0, Math.min(ord.qty, supply[ord.item], Math.floor(sent[ord.item] / 2) - countGoods(held, ord.item), space - used));
    ord.brought = n;
    supply[ord.item] -= n;
    used += n;
    if (n) addGoods(held, ord.item, n);
  }
  // Then whatever else town had, in turn, until his share of the lorry is full.
  for (let more = true; more && used < space;) {
    more = false;
    for (const g of BRINGS) {
      if (supply[g] > 0 && used < space) {
        supply[g]--;
        used++;
        addGoods(goods, g, 1);
        more = true;
      }
    }
  }
  const v: Visit = { day, leaves, goods, held, produce: {}, sells: {}, buys: {}, priced: false, haggles: 0, deals: {}, offers: [], gossip: null, heard: [] };
  Object.assign(v, scriptedPrices(w, v, supplyFor(w, day)));
  o.visit = v;
  w.state.lorryHere = true;
  w.emit({ type: 'lorry_arrived' });
  // The horn tells the kampung what's on the back today, and what he's buying.
  const plain = (g: ItemId) => ITEMS[g].many.replace(/^\{n\} (?:tins of |loaves of |bags of |bunches of )?/, '');
  const and = (names: string[]) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const aboard = and(BRINGS.filter((g) => countGoods(v.goods, g) + countGoods(v.held, g) > 0).map(plain));
  const buying = and(TAKES.map(plain));
  for (const r of w.state.residents) {
    if (w.isAsleep(r)) continue;
    w.learnPlace(r, 'lorry-stop');
    w.notify(r.id, `You hear the lorry's horn from the lorry stop${aboard ? `: the lorry man is in from town with ${aboard}, and he's buying ${buying}.` : `: the lorry man is buying ${buying}.`}`);
  }
}

/** He drives off: offers go unanswered, and anything ordered that nobody came for goes back to town, its deposit returned. */
export function depart(w: World): void {
  const o = w.state.osman;
  if (!o.visit) return;
  for (const off of o.visit.offers) w.notify(off.who, `${OSMAN} drove off before he answered you.`);
  for (const ord of o.orders.filter((x) => x.brought !== null)) {
    if (ord.deposit > 0) w.transfer(LORRY_ID, ord.who, ord.deposit, 'lorry deposit back');
    const what = ord.brought ? `with the ${ord.item} you asked for still on board` : `without the ${ord.item} you asked for: he couldn't get any`;
    w.notify(ord.who, `${OSMAN} drove off ${what}.${ord.deposit > 0 ? ` A neighbour brings you back your ${formatMoney(ord.deposit)} deposit.` : ''}`);
  }
  o.orders = o.orders.filter((x) => x.brought === null);
  o.visit = null;
  w.state.lorryHere = false;
  w.emit({ type: 'lorry_left' });
}

// --- dealing ------------------------------------------------------------

export type Done = { ok: boolean; reply: string };
const yes = (reply: string): Done => ({ ok: true, reply });
const nope = (reply: string): Done => ({ ok: false, reply });

/** Whether r can deal with him right now, or why not. */
function here(w: World, r: Resident): Visit | string {
  if (!w.isAt(r, 'lorry-stop')) return "You'd have to meet the lorry at the lorry stop.";
  const v = w.state.osman.visit;
  if (!v) return "The lorry isn't here.";
  meet(w, r);
  return v;
}

function each(total: Cents, qty: number): string {
  return qty === 1 ? formatMoney(total) : `${formatMoney(total)} for ${qty}`;
}

/** Hands over goods for money, on the slate if `later`. All checks done here, so an accepted offer can't slip past them. */
function sellTo(w: World, r: Resident, item: ItemId, qty: number, cents: Cents, forShop: string | null, later: boolean): Done {
  const v = w.state.osman.visit!;
  const have = countGoods(v.goods, item);
  if (have < qty) return nope(have === 0 ? `${OSMAN} has no ${item} left on the lorry.` : `${OSMAN} only has ${quantityLabel(item, have)} left.`);
  if (later) {
    const roomLeft = creditRoom(w, r);
    if (typeof roomLeft === 'string') return nope(roomLeft);
    if (roomLeft < cents) return nope(`${OSMAN} won't let you owe him more than ${formatMoney(account(w, r.id)!.owes + roomLeft)}.`);
  } else if (r.money < cents) {
    return nope(`You can't afford that: ${quantityLabel(item, qty)} is ${formatMoney(cents)} and you have ${formatMoney(r.money)}.`);
  }
  const a = touch(w, r);
  if (later) {
    if (a.owes === 0) a.since = w.t;
    a.owes += cents;
  } else w.transfer(r.id, LORRY_ID, cents, `bought ${item} off the lorry`);
  addGoods(v.goods, item, -qty);
  if (forShop) {
    addGoods(w.shop(forShop)!.stock, item, qty);
    w.emit({ type: 'lorry_order', who: r.id, shop: forShop, item, qty, cents });
  } else {
    addGoods(r.items, item, qty);
    w.emit({ type: 'lorry_bought', who: r.id, item, qty, cents, later });
  }
  const where = forShop ? ` It'll be dropped off at your shop.` : '';
  return yes(later
    ? `${OSMAN} hands over ${quantityLabel(item, qty)} and writes ${formatMoney(cents)} against your name in his book.${where}`
    : `You pay ${OSMAN} ${formatMoney(cents)} for ${quantityLabel(item, qty)}.${where}`);
}

function buyFrom(w: World, r: Resident, item: ItemId, qty: number, cents: Cents): Done {
  const v = w.state.osman.visit!;
  if (countGoods(r.items, item) < qty) return nope(`You don't have ${quantityLabel(item, qty)}.`);
  const left = room(v);
  if (left < qty) return nope(left === 0 ? `${OSMAN}'s lorry is full today: he can't take any more.` : `${OSMAN} only has room on the lorry for ${quantityLabel(item, left)} more.`);
  touch(w, r);
  addGoods(r.items, item, -qty);
  addGoods(v.produce, item, qty);
  w.transfer(LORRY_ID, r.id, cents, `sold ${item} to the lorry`);
  w.emit({ type: 'lorry_sale', who: r.id, item, qty, cents });
  return yes(`${OSMAN} takes ${quantityLabel(item, qty)} and pays you ${formatMoney(cents)}.`);
}

/** Leaves an offer for his answer; once he's done haggling for the visit, it's his price or nothing. */
function offer(w: World, r: Resident, v: Visit, o: Omit<LorryOffer, 'id' | 'who'>): Done {
  const what = `${formatMoney(o.cents)} for ${quantityLabel(o.item, o.qty)}`;
  if (v.haggles >= HAGGLES_PER_VISIT) {
    w.emit({ type: 'lorry_haggled', who: r.id, side: o.side, item: o.item, qty: o.qty, cents: o.cents, answer: 'flat', counter: null, by: 'script' });
    return nope(`${OSMAN} waves it away: "I've haggled enough for one morning. Take it or leave it."`);
  }
  if (o.side === 'sells' && !o.later && r.money < o.cents) return nope(`You don't have ${formatMoney(o.cents)}.`);
  if (o.side === 'buys' && countGoods(r.items, o.item) < o.qty) return nope(`You don't have ${quantityLabel(o.item, o.qty)}.`);
  v.offers = v.offers.filter((x) => !(x.who === r.id && x.side === o.side && x.item === o.item));
  v.offers.push({ id: w.nextId(), who: r.id, ...o });
  return yes(o.side === 'sells' ? `You offer ${OSMAN} ${what}. He rubs his chin.` : `You ask ${OSMAN} for ${what}. He rubs his chin.`);
}

/** Buying off the lorry, into their hands or (for an owner's order) onto their shop's shelves. A sum named below his price is an offer. */
export function lorryBuy(w: World, r: Resident, item: ItemId | null, qty: number, opts: { forShop: string | null; money: Cents | null; later: boolean }): Done {
  const v = here(w, r);
  if (typeof v === 'string') return nope(v);
  const price = item ? priceFor(w, r, 'sells', item) : null;
  if (!item || !price) return nope(`${OSMAN} doesn't bring ${item ?? 'that'} from town.`);
  const cost = price * qty;
  if (opts.money !== null && opts.money < cost) {
    if (opts.money === 0) return nope("That doesn't sound like money.");
    return offer(w, r, v, { side: 'sells', item, qty, cents: opts.money, forShop: opts.forShop, later: opts.later });
  }
  return sellTo(w, r, item, qty, cost, opts.forShop, opts.later);
}

/** Selling fish or vegetables to him. A sum named above what he pays is an offer. */
export function lorrySell(w: World, r: Resident, item: ItemId | null, qty: number, money: Cents | null): Done {
  const v = here(w, r);
  if (typeof v === 'string') return nope(v);
  const price = item ? priceFor(w, r, 'buys', item) : null;
  if (!item || !price) return nope(`${OSMAN} only buys fish and vegetables.`);
  const pays = price * qty;
  if (money !== null && money > pays) return offer(w, r, v, { side: 'buys', item, qty, cents: money, forShop: null, later: false });
  return buyFrom(w, r, item, qty, pays);
}

/** Asking him to bring something next time, at today's price, with any deposit now. Nothing is promised. */
export function askToBring(w: World, r: Resident, item: ItemId | null, qty: number, deposit: Cents, forShop: string | null): Done {
  const v = here(w, r);
  if (typeof v === 'string') return nope(v);
  if (!item || !(BRINGS as readonly string[]).includes(item)) return nope(`${OSMAN} can't get ${item ?? 'that'} in town.`);
  if (qty > MAX_ORDER) return nope(`${OSMAN} laughs: "That many? I'm one lorry, not the whole market."`);
  const unit = priceFor(w, r, 'sells', item)!;
  if (deposit > unit * qty) return nope(`That's more than the ${formatMoney(unit * qty)} it would all come to.`);
  if (deposit > r.money) return nope(`You don't have ${formatMoney(deposit)}.`);
  touch(w, r);
  if (deposit > 0) w.transfer(r.id, LORRY_ID, deposit, `lorry deposit on ${item}`);
  const o = w.state.osman;
  const same = o.orders.find((x) => x.who === r.id && x.item === item && x.brought === null && x.forShop === forShop);
  if (same) {
    same.qty = Math.min(MAX_ORDER, same.qty + qty);
    same.deposit += deposit;
    same.each = Math.min(same.each, unit);
  } else o.orders.push({ id: w.nextId(), who: r.id, item: item as Brought, qty, each: unit, deposit, forShop, brought: null });
  w.emit({ type: 'lorry_asked', who: r.id, item, qty, deposit });
  const dep = deposit > 0 ? ` You give him ${formatMoney(deposit)} towards it.` : '';
  return yes(`${OSMAN} writes it down: ${quantityLabel(item, qty)} next time, at ${formatMoney(unit)} each, "if town has it."${dep}`);
}

/** Collecting what he brought of their orders: paying the rest, or getting back what the deposit was over. */
export function collect(w: World, r: Resident, later: boolean): Done {
  const v = here(w, r);
  if (typeof v === 'string') return nope(v);
  const mine = w.state.osman.orders.filter((x) => x.who === r.id && x.brought !== null);
  if (!mine.length) return nope(`${OSMAN} has nothing put by for you today.`);
  const due = mine.reduce((n, x) => n + x.each * x.brought! - x.deposit, 0);
  if (due > 0) {
    if (later) {
      const roomLeft = creditRoom(w, r);
      if (typeof roomLeft === 'string') return nope(roomLeft);
      if (roomLeft < due) return nope(`${OSMAN} won't let you owe him more than ${formatMoney(account(w, r.id)!.owes + roomLeft)}.`);
    } else if (r.money < due) return nope(`You'd need ${formatMoney(due)} to pay the rest, and you have ${formatMoney(r.money)}.`);
  }
  const a = touch(w, r);
  if (due > 0 && later) {
    if (a.owes === 0) a.since = w.t;
    a.owes += due;
  } else if (due > 0) w.transfer(r.id, LORRY_ID, due, 'collected from the lorry');
  else if (due < 0) w.transfer(LORRY_ID, r.id, -due, 'lorry deposit back');
  const parts: string[] = [];
  for (const x of mine) {
    if (x.brought) {
      addGoods(v.held, x.item, -x.brought);
      addGoods(x.forShop ? w.shop(x.forShop)!.stock : r.items, x.item, x.brought);
    }
    w.emit({ type: 'lorry_collected', who: r.id, item: x.item, qty: x.brought!, asked: x.qty, cents: x.each * x.brought! });
    parts.push(x.brought === x.qty ? quantityLabel(x.item, x.qty) : x.brought === 0 ? `none of the ${x.item} (town had none to spare)` : `${x.brought} of the ${x.qty} ${x.item} you asked for`);
  }
  w.state.osman.orders = w.state.osman.orders.filter((x) => !mine.includes(x));
  const money = due > 0 ? (later ? ` He writes ${formatMoney(due)} against your name.` : ` You pay him ${formatMoney(due)}.`)
    : due < 0 ? ` He hands you back ${formatMoney(-due)} of your deposit.` : '';
  const shop = mine.some((x) => x.forShop && x.brought) ? " The shop's share will be dropped off there." : '';
  return yes(`${OSMAN} hands over ${parts.join(', ')}.${money}${shop}`);
}

/** Paying off their slate, or part of it. */
export function payOsman(w: World, r: Resident, money: Cents | null): Done {
  const v = here(w, r);
  if (typeof v === 'string') return nope(v);
  const a = account(w, r.id);
  if (!a || a.owes === 0) return nope(`You don't owe ${OSMAN} anything.`);
  const cents = money ?? a.owes;
  if (cents === 0) return nope("That doesn't sound like money.");
  if (cents > a.owes) return nope(`You only owe ${OSMAN} ${formatMoney(a.owes)}.`);
  if (r.money < cents) return nope(`You only have ${formatMoney(r.money)}.`);
  w.transfer(r.id, LORRY_ID, cents, 'paid the lorry man');
  a.owes -= cents;
  // What's left is still the old debt: its week runs on until it's all paid.
  if (a.owes === 0) a.since = null;
  w.emit({ type: 'lorry_paid', who: r.id, cents, stillOwed: a.owes });
  return yes(`You pay ${OSMAN} ${formatMoney(cents)}. He crosses it out in his book.${a.owes > 0 ? ` You still owe him ${formatMoney(a.owes)}.` : ''}`);
}

// --- his head -----------------------------------------------------------

/** What his head is told for the prices: in his own terms. */
export interface PriceBrief {
  mood: Mood;
  load: { brought: Goods; room: number };
  town: Partial<Record<ItemId, Cents>>;
  scripted: { sells: Partial<Record<ItemId, Cents>>; buys: Partial<Record<ItemId, Cents>> };
  bounds: Record<string, [Cents, Cents]>;
}
export interface HaggleBrief {
  name: string;
  side: Side;
  item: ItemId;
  qty: number;
  offered: Cents;
  list: Cents;
  floor: Cents;
  ceiling: Cents;
  regular: boolean;
  cheated: boolean;
  scripted: HaggleAnswer;
}
export interface HaggleAnswer { answer: 'accept' | 'counter' | 'refuse'; each?: Cents; words?: string }

/** A bounded head: any answer may be null (no thinking to spare), and the code clamps whatever comes back. */
export interface OsmanHead {
  price(brief: PriceBrief, at: { t: number; realMs: number }): Promise<{ sells?: Record<string, unknown>; buys?: Record<string, unknown> } | null>;
  haggle(brief: HaggleBrief, at: { t: number; realMs: number }): Promise<HaggleAnswer | null>;
  gossip(brief: { mood: Mood; short: string[]; plenty: string[] }, at: { t: number; realMs: number }): Promise<string | null>;
}

/** His scripted haggling: accept near enough his price, meet halfway when not too far off, otherwise no. Within his bounds always. */
export function scriptedHaggle(b: Omit<HaggleBrief, 'scripted'>): HaggleAnswer {
  const per = b.offered / b.qty;
  if (b.side === 'sells') {
    // He sells: the least he'd take (regulars get a little nearer).
    const least = Math.max(b.floor, Math.ceil(b.list * (b.cheated ? 1 : b.regular ? 0.85 : 0.9)));
    if (per >= least) return { answer: 'accept' };
    if (per >= least * 0.8) return { answer: 'counter', each: Math.max(least, Math.ceil((per + b.list) / 2)) };
    return { answer: 'refuse' };
  }
  const most = Math.min(b.ceiling, Math.floor(b.list * (b.cheated ? 1 : b.regular ? 1.15 : 1.1)));
  if (per <= most) return { answer: 'accept' };
  if (per <= most * 1.25) return { answer: 'counter', each: Math.min(most, Math.floor((per + b.list) / 2)) };
  return { answer: 'refuse' };
}

const SCRIPTED_GOSSIP = {
  short: (item: string) => `They say ${item} is hard to come by at the town market this week.`,
  plenty: (item: string) => `Plenty of ${item} in town today. The towkays are grumbling about it.`,
  slow: 'Town is quiet too. Everybody is holding on to their money.',
  other: [
    'The new bus to the city broke down twice this week. Twice!',
    'My daughter came top in her class again. All that saving is worth it.',
    'Rain on the main road all night. Half the market was under water.',
  ],
};

export function scriptedGossip(w: World, brief: { mood: Mood; short: string[]; plenty: string[] }): string {
  const rng = dayRng(w, dayIndex(w.t), 3);
  const pick = rng.int(0, 3);
  if (pick === 0 && brief.short[0]) return SCRIPTED_GOSSIP.short(brief.short[0]);
  if (pick === 1 && brief.plenty[0]) return SCRIPTED_GOSSIP.plenty(brief.plenty[0]);
  if (pick === 2 && brief.mood === 'slow') return SCRIPTED_GOSSIP.slow;
  return rng.pick(SCRIPTED_GOSSIP.other);
}

/** Words a line of news must never have: it's a lorry man's talk, nothing about how things work. */
export const UNWORLDLY = /\b(game|simulation|simulated|agent|AI|API|system|feature|implemented|tool|JSON|token|model|prompt|player|npc|engine|server|database|code|bounds?|clamp|percent|%)\b|_/i;

function cleanLine(text: unknown, max = 200): string | null {
  if (typeof text !== 'string') return null;
  const s = text.replace(/\s+/g, ' ').trim().replace(/^"|"$/g, '');
  return s && s.length <= max && !UNWORLDLY.test(s) ? s : null;
}

function toCents(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function brief(w: World): { mood: Mood; short: string[]; plenty: string[] } {
  const supply = supplyFor(w, dayIndex(w.t));
  const items = BRINGS.map((g) => ({ g, mid: (supply[g] - SUPPLY[g][0]) / (SUPPLY[g][1] - SUPPLY[g][0]) }));
  return { mood: tradeMood(w), short: items.filter((x) => x.mid < 0.3).map((x) => ITEMS[x.g].id), plenty: items.filter((x) => x.mid > 0.7).map((x) => ITEMS[x.g].id) };
}

/**
 * His thinking for the minute (called by the town after the tick, before
 * residents think): the once-a-visit look at prices, the day's news, and an
 * answer to every offer waiting. With no head, or a head with nothing to
 * spare, his scripted ways answer.
 */
export async function osmanThinks(w: World, head: OsmanHead | null, realMs: number): Promise<void> {
  const v = w.state.osman.visit;
  if (!v) return;
  const at = { t: w.t, realMs };
  if (!v.priced) {
    v.priced = true;
    const scripted = { sells: { ...v.sells }, buys: { ...v.buys } };
    const b: PriceBrief['bounds'] = {};
    for (const g of BRINGS) b[`sells:${g}`] = bounds('sells', g)!;
    for (const g of TAKES) b[`buys:${g}`] = bounds('buys', g)!;
    const got = head ? await head.price({ mood: tradeMood(w), load: { brought: { ...v.goods, ...v.held }, room: room(v) }, town: { ...TOWN_PRICES }, scripted, bounds: b }, at) : null;
    let by: 'ai' | 'script' = 'script';
    for (const side of ['sells', 'buys'] as const) {
      for (const [item, raw] of Object.entries(got?.[side] ?? {})) {
        if (!Object.hasOwn(v[side], item)) continue;
        const c = toCents(raw);
        const p = c === null ? null : clampPrice(side, item as ItemId, c);
        if (p !== null) {
          v[side][item as ItemId] = p;
          by = 'ai';
        }
      }
    }
    w.emit({ type: 'lorry_priced', by, sells: { ...v.sells }, buys: { ...v.buys } });
  }
  if (v.gossip === null) {
    const bf = brief(w);
    v.gossip = (head ? cleanLine(await head.gossip(bf, at)) : null) ?? scriptedGossip(w, bf);
    w.emit({ type: 'lorry_gossip', text: v.gossip });
    // Those already at the stop hear it now; anyone coming later, when they arrive.
    for (const r of w.state.residents) {
      if (w.isAsleep(r) || !w.isAt(r, 'lorry-stop') || v.heard.includes(r.id)) continue;
      v.heard.push(r.id);
      w.remember(r.id, `${OSMAN} says: "${v.gossip}"`);
    }
  }
  const offers = v.offers;
  v.offers = [];
  for (const o of offers) {
    if (!w.state.osman.visit) return;
    const r = w.resident(o.who);
    if (!w.isAt(r, 'lorry-stop')) {
      w.notify(r.id, `You'd gone before ${OSMAN} could answer your offer for the ${o.item}.`);
      continue;
    }
    const list = priceFor(w, r, o.side, o.item)!;
    const [floor, ceiling] = bounds(o.side, o.item)!;
    const a = account(w, r.id);
    const facts = { name: r.name, side: o.side, item: o.item, qty: o.qty, offered: o.cents, list, floor, ceiling, regular: isRegular(a), cheated: !!a?.cheated };
    const scripted = scriptedHaggle(facts);
    // Past his cap (several offers in one minute), his usual ways answer.
    const thought = head && v.haggles < HAGGLES_PER_VISIT ? await head.haggle({ ...facts, scripted }, at) : null;
    v.haggles++;
    const ans = settleAnswer(facts, thought ?? scripted);
    w.emit({ type: 'lorry_haggled', who: r.id, side: o.side, item: o.item, qty: o.qty, cents: o.cents, answer: ans.answer === 'accept' ? 'took' : ans.answer === 'counter' ? 'countered' : 'refused', counter: ans.each ?? null, by: thought ? 'ai' : 'script' });
    const said = cleanLine(ans.words, 160);
    const words = said ? `${OSMAN} says: "${said}" ` : '';
    const what = `${formatMoney(o.cents)} for ${quantityLabel(o.item, o.qty)}`;
    if (ans.answer === 'accept') {
      const done = o.side === 'sells' ? sellTo(w, r, o.item, o.qty, o.cents, o.forShop, o.later) : buyFrom(w, r, o.item, o.qty, o.cents);
      w.notify(r.id, done.ok ? `${words}${OSMAN} takes your ${what}. ${done.reply}` : `${words}${OSMAN} would take your ${what}, but: ${done.reply}`);
    } else if (ans.answer === 'counter') {
      (v.deals[r.id] ??= {})[`${o.side}:${o.item}`] = ans.each!;
      w.notify(r.id, `${words}${OSMAN} won't do ${what}, but he'll ${o.side === 'sells' ? 'let you have them at' : 'give you'} ${formatMoney(ans.each!)} each today.`);
    } else {
      w.notify(r.id, `${words}${OSMAN} shakes his head at ${what}.`);
    }
  }
}

/** Keeps any answer within his bounds: never accepting past them, a counter always between the offer and his price and inside his limits. */
export function settleAnswer(b: Omit<HaggleBrief, 'scripted'>, a: HaggleAnswer): HaggleAnswer {
  const settled = settle(b, a);
  // His words stand only if the answer does: no "done, take it" on a deal his bounds turned down.
  const same = settled.answer === a.answer && (settled.answer !== 'counter' || settled.each === Math.round(toCents(a.each) ?? NaN));
  const { words, ...rest } = settled;
  return same && words !== undefined ? { ...rest, words } : rest;
}

function settle(b: Omit<HaggleBrief, 'scripted'>, a: HaggleAnswer): HaggleAnswer {
  const per = b.offered / b.qty;
  const words = a.words;
  if (b.side === 'sells') {
    if (a.answer === 'accept') return per >= b.floor ? { answer: 'accept', words } : { answer: 'refuse', words };
    if (a.answer === 'counter') {
      const c = toCents(a.each);
      if (c === null) return { answer: 'refuse', words };
      const each = Math.max(b.floor, Math.ceil(per), Math.min(b.list, Math.round(c)));
      return each >= b.list ? { answer: 'refuse', words } : per >= each ? { answer: 'accept', words } : { answer: 'counter', each, words };
    }
    return { answer: 'refuse', words };
  }
  if (a.answer === 'accept') return per <= b.ceiling ? { answer: 'accept', words } : { answer: 'refuse', words };
  if (a.answer === 'counter') {
    const c = toCents(a.each);
    if (c === null) return { answer: 'refuse', words };
    const each = Math.min(b.ceiling, Math.floor(per), Math.max(b.list, Math.round(c)));
    return each <= b.list ? { answer: 'refuse', words } : per <= each ? { answer: 'accept', words } : { answer: 'counter', each, words };
  }
  return { answer: 'refuse', words };
}

/** A quiet spell (downtime) that runs past his leaving: he's gone, as he would have gone. */
export function osmanSkip(w: World): void {
  const v = w.state.osman.visit;
  if (v && w.t >= v.leaves) depart(w);
  w.state.lorryHere = w.state.osman.visit !== null;
}
