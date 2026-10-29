import { effectiveLevel, HANDY_COOK, skillLevel } from '../skills.ts';
import { endShift } from '../activities.ts';
import { ITEMS, RECIPES, quantityLabel, type ItemId } from '../items.ts';
import { askToBring as osmanAsk, collect as osmanCollect, lorryBuy, payOsman } from '../osman.ts';
import { PLACE_BY_ID } from '../map.ts';
import { formatMoney } from '../money.ts';
import { COOK_MINUTES } from '../travellers.ts';
import { addGoods, countGoods, GROWN_AGE, type Goods, type Resident, type Shop, type World } from '../state.ts';
import {
  type ActionResult, type Intent, MAX_PRICE, SAY_NOTHING_SENSIBLE, itemOf, moneyOf, no, ok,
  personNearby, qtyOf, quoted, hasMoney, saysLater,
} from './common.ts';
import { shiftLabel } from './everyone.ts';
import { fireGround, fireNear, KITCHEN_ID, kitchenBuilt } from '../cooking.ts';

export const JOB_OFFER_MINUTES = 120;
export const MAX_SHIFT_HOURS = 8;
export const MAX_WAGE = 10_000;

function ownShop(w: World, r: Resident): Shop | string {
  const shop = w.shopOf(r.id);
  if (!shop) return "You don't have a shop.";
  return shop;
}

export function setPrice(w: World, r: Resident, i: Intent): ActionResult {
  const shop = ownShop(w, r);
  if (typeof shop === 'string') return no(shop);
  if (!w.isAt(r, shop.id)) return no("You'd have to be at your shop to change the prices.");
  const item = itemOf(i.item);
  if (!item) return no(`You don't know what ${quoted(i.item)} is.`);
  const cents = moneyOf(i.price);
  if (cents === null || cents > MAX_PRICE) return no("That doesn't sound like a price.");
  const side = i.side === 'buy' ? 'buy' : i.side === undefined || i.side === 'sell' ? 'sell' : null;
  if (!side) return no("You're not sure whether you meant buying or selling.");
  const hasLimit = i.limit !== undefined && i.limit !== null && i.limit !== '';
  const limit = hasLimit ? qtyOf(i.limit) : null;
  if (hasLimit && side === 'sell') return no('You can only put a limit on how much you buy.');
  if (hasLimit && limit === null) return no(SAY_NOTHING_SENSIBLE);
  const prices = side === 'sell' ? shop.sellPrices : shop.buyPrices;
  // Setting what's already set changes nothing; refusing it stops an owner looping on it.
  const sameLimit = side === 'sell' || (limit ?? undefined) === shop.buyLimits[item];
  if ((prices[item] ?? 0) === cents && sameLimit) {
    if (cents === 0) return no(side === 'sell' ? `You're already not selling ${item}.` : `You're already not buying ${item}.`);
    return no(`That's already your price for ${item}: ${formatMoney(cents)}.`);
  }
  if (cents === 0) delete prices[item];
  else prices[item] = cents;
  // A dish stopped stays off the counter when more is cooked; priced again, it's on again.
  if (side === 'sell') shop.notSelling = cents === 0 ? [...new Set([...shop.notSelling, item])] : shop.notSelling.filter((x) => x !== item);
  if (side === 'buy') {
    if (limit !== null && cents > 0) shop.buyLimits[item] = limit;
    else delete shop.buyLimits[item];
  }
  w.emit({ type: 'price_set', who: r.id, shop: shop.id, item, side, cents, limit });
  if (cents === 0) return ok(side === 'sell' ? `You stop selling ${item}.` : `You stop buying ${item}.`);
  if (side === 'sell') return ok(`You'll sell ${item} at ${formatMoney(cents)} each.`);
  return ok(`You'll buy ${item} at ${formatMoney(cents)} each${limit !== null ? `, up to ${quantityLabel(item, limit)}` : ''}.`);
}

/** An hour of the day from 7, "7", "7am", "1 pm", "07:00" or "noon"; null if it isn't one. */
function hourOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 23 ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'noon') return 12;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const pm = m[3]?.startsWith('p');
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (pm ? 12 : 0); }
  return h >= 0 && h <= 23 ? h : null;
}

export function offerJob(w: World, r: Resident, i: Intent): ActionResult {
  const shop = ownShop(w, r);
  if (typeof shop === 'string') return no("You don't have a business to hire for.");
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  if (w.shopOf(o.id)) return no(`${o.name} has a business to run.`);
  if (w.ageOf(o) < GROWN_AGE) return no(`${o.name} is too young to work a shift.`);
  const job = w.jobOf(o.id);
  if (job?.employerId === r.id) return no(`${o.name} already works for you.`);
  // The wage may come as "money" or "price" too, and times as people say them ("7am", "17:00", "4 hours").
  const wage = moneyOf(i.wage ?? i.money ?? i.price);
  if (wage === null || wage === 0 || wage > MAX_WAGE) return no("That doesn't sound like a wage.");
  const startHour = hourOf(i.startHour);
  const hours = qtyOf(typeof i.hours === 'string' ? i.hours.replace(/\s*hours?$/i, '') : i.hours, -1);
  if (startHour === null || hours === null || startHour < 0 || hours < 0) return no("You're not sure what hours you meant.");
  if (hours > MAX_SHIFT_HOURS) return no('Nobody can work that long in one go.');
  if (startHour < 6 || startHour + hours > 23) return no("Nobody wants to work through the night.");
  w.state.jobOffers = w.state.jobOffers.filter((x) => !(x.employerId === r.id && x.workerId === o.id));
  w.state.jobOffers.push({ id: w.nextId(), employerId: r.id, workerId: o.id, wage, startHour, hours, expires: w.t + JOB_OFFER_MINUTES });
  w.emit({ type: 'job_offered', who: r.id, to: o.id, wage, startHour, hours });
  const where = PLACE_BY_ID.get(shop.id)!.name;
  w.notify(o.id, `${r.name} offers you work at ${where}, ${shiftLabel(startHour, hours)} every day, for ${formatMoney(wage)} a shift.`);
  return ok(`You offer ${o.name} work ${shiftLabel(startHour, hours)} for ${formatMoney(wage)} a shift.`);
}

export function letGo(w: World, r: Resident, i: Intent): ActionResult {
  const o = w.residentByName(i.who, r);
  if (!o) return no(`You don't know anyone called ${quoted(i.who)}.`);
  const job = w.jobOf(o.id);
  if (!job || job.employerId !== r.id) return no(`${o.name} doesn't work for you.`);
  if (!w.isNear(r, o)) return no(`You'd have to tell ${o.name} in person.`);
  if (o.activity?.kind === 'working') endShift(w, o);
  w.state.jobs = w.state.jobs.filter((j) => j.id !== job.id);
  w.emit({ type: 'let_go', who: r.id, worker: o.id });
  w.notify(o.id, `${r.name} let you go. You no longer work at ${PLACE_BY_ID.get(job.placeId)!.name}.`);
  return ok(`You let ${o.name} go.`);
}

export function payWages(w: World, r: Resident, i: Intent): ActionResult {
  const o = w.residentByName(i.to, r);
  if (!o) return no(`You don't know anyone called ${quoted(i.to)}.`);
  const owed = w.state.owed.find((x) => x.employerId === r.id && x.workerId === o.id);
  if (!owed || owed.cents === 0) return no(`You don't owe ${o.name} anything.`);
  const near = personNearby(w, r, o.name, { awake: false });
  if (typeof near === 'string') return no(near);
  const part = i.money !== undefined && i.money !== null && i.money !== '';
  const cents = part ? moneyOf(i.money) : owed.cents;
  if (cents === null || cents === 0) return no("That doesn't sound like money.");
  if (cents > owed.cents) return no(`You only owe ${o.name} ${formatMoney(owed.cents)}.`);
  if (r.money < cents) {
    return no(part ? `You only have ${formatMoney(r.money)}.` : `You don't have enough to pay ${o.name} the ${formatMoney(owed.cents)} you owe.`);
  }
  w.transfer(r.id, o.id, cents, 'wages');
  owed.cents -= cents;
  if (owed.cents === 0) w.state.owed = w.state.owed.filter((x) => x !== owed);
  const still = owed.cents > 0 ? ` You still owe ${formatMoney(owed.cents)}.` : '';
  w.emit({ type: 'wages_paid', who: r.id, to: o.id, cents, stillOwed: owed.cents });
  w.notify(o.id, `${r.name} paid you ${formatMoney(cents)} in wages.${owed.cents > 0 ? ` ${r.name} still owes you ${formatMoney(owed.cents)}.` : ''}`);
  return ok(`You pay ${o.name} ${formatMoney(cents)}.${still}`);
}

export function orderStock(w: World, r: Resident, i: Intent): ActionResult {
  const shop = ownShop(w, r);
  if (typeof shop === 'string') return no(shop);
  const qty = qtyOf(i.qty);
  if (qty === null) return no(SAY_NOTHING_SENSIBLE);
  const money = hasMoney(i) ? moneyOf(i.money) : null;
  if (hasMoney(i) && money === null) return no("That doesn't sound like money.");
  return lorryBuy(w, r, itemOf(i.item), qty, { forShop: shop.id, money, later: saysLater(i.later) });
}

/** Asking the lorry man to bring something next time; an owner's goes onto their shelves when it comes. */
export function askToBring(w: World, r: Resident, i: Intent): ActionResult {
  const qty = qtyOf(i.qty);
  if (qty === null) return no(SAY_NOTHING_SENSIBLE);
  const deposit = hasMoney(i) ? moneyOf(i.money) : 0;
  if (deposit === null) return no("That doesn't sound like money.");
  return osmanAsk(w, r, itemOf(i.item), qty, deposit, w.shopOf(r.id)?.id ?? null);
}

export function collect(w: World, r: Resident, i: Intent): ActionResult {
  return osmanCollect(w, r, saysLater(i.later));
}

export function payLorryMan(w: World, r: Resident, i: Intent): ActionResult {
  const money = hasMoney(i) ? moneyOf(i.money) : null;
  if (hasMoney(i) && money === null) return no("That doesn't sound like money.");
  return payOsman(w, r, money);
}

/** A home batch: a small pot, from what the cook carries, into their hands (docs/design/home-cooking.md). */
export const HOME_YIELD = 2;
/** Batches a tin of kerosene gives a home stove. */
export const KEROSENE_BATCHES = 4;

function cookAtHome(w: World, r: Resident, item: ItemId, asked: number, stoveAt: string = r.homeId): ActionResult {
  const recipe = RECIPES[item]!;
  // The village kitchen is a proper kitchen; a house's small stove isn't.
  if (recipe.level && stoveAt !== KITCHEN_ID) return no("You'd want a proper kitchen for that.");
  const home = stoveAt;
  if (w.state.residents.some((o) => o.id !== r.id && o.stove?.shopId === home)) return no("There's already a pot on the stove.");
  // One small pot: one batch at a time.
  const batches = 1;
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) {
    if (countGoods(r.items, need) < n * batches) return no(shortOf(need, countGoods(r.items, need), n, batches, recipe.needs, 'You have'));
  }
  // Fuel for every batch: kerosene already in the stove, then a tin poured in, then firewood.
  if ((w.state.stoves[home] ?? 0) + countGoods(r.items, 'kerosene') * KEROSENE_BATCHES + countGoods(r.items, 'firewood') < batches) {
    return no("The stove needs firewood or kerosene for that. There's dry wood to gather past the farm plot, and the lorry sells kerosene.");
  }
  for (let b = 0; b < batches; b++) {
    if ((w.state.stoves[home] ?? 0) === 0 && countGoods(r.items, 'kerosene') > 0) {
      addGoods(r.items, 'kerosene', -1);
      w.state.stoves[home] = KEROSENE_BATCHES;
    }
    if ((w.state.stoves[home] ?? 0) > 0) w.state.stoves[home]! -= 1;
    else addGoods(r.items, 'firewood', -1);
  }
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) addGoods(r.items, need, -n * batches);
  const master = skillLevel(r, 'cooking') === 5;
  const qty = (HOME_YIELD + (master ? 1 : 0)) * batches;
  const minutes = Math.round((COOK_MINUTES[item] ?? 10) * (effectiveLevel(r, 'cooking') >= 2 ? HANDY_COOK : 1));
  r.stove = { item, batches, qty, shopId: home, until: w.t + minutes * batches };
  return ok(`You light the stove and start cooking a pot of ${item}.${asked > 1 ? ' You only have the one small pot.' : ''}`);
}

/** How long a pot of this takes this cook (a handy cook is a fifth quicker). */
const cookMinutes = (r: Resident, item: ItemId) => Math.round((COOK_MINUTES[item] ?? 10) * (effectiveLevel(r, 'cooking') >= 2 ? HANDY_COOK : 1));

/** What can go over an open fire: grilled fish, and with a pot, bubur. */
const FIRE_DISHES: readonly ItemId[] = ['grilled fish', 'bubur'];

/** A thing as stuff, with no count: "water", "fish", "coffee powder". */
const stuffOf = (item: ItemId) => ITEMS[item].many.replace(/^\{n\} (?:\w+ of )?/, '');

/**
 * What's missing for a dish, said plainly (a bare "short of water" was read as
 * "make one batch only"): none at all, only some, or enough for fewer batches.
 */
function shortOf(need: ItemId, have: number, perBatch: number, batches: number, needs: Goods, who: 'You have' | 'The kitchen has' | 'The kitchen and your bag have', each = 'each batch takes'): string {
  const parts = (Object.entries(needs) as [ItemId, number][]).filter(([, n]) => n > 0).map(([i, n]) => quantityLabel(i, n));
  const takes = `${each} ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join('')}`;
  if (have <= 0) return `${who} no ${stuffOf(need)}: ${takes}.`;
  if (have < perBatch) return `${who} only ${quantityLabel(need, have)}: ${takes}.`;
  const k = Math.floor(have / perBatch);
  return `There's enough ${stuffOf(need)} for only ${k} batch${k === 1 ? '' : 'es'}: ${takes}.`;
}

/** A pot over a cooking fire (subsistence.md "Where cooking happens"): simple food from what they carry, into their hands. */
function cookAtFire(w: World, r: Resident, item: ItemId): ActionResult {
  const fire = fireNear(w, r)!;
  if (!FIRE_DISHES.includes(item)) return no("You can't make that over an open fire.");
  if (item === 'bubur' && countGoods(r.items, 'pot') < 1) return no("You'd need a pot to boil rice over the fire.");
  const recipe = RECIPES[item]!;
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) {
    if (countGoods(r.items, need) < n) return no(shortOf(need, countGoods(r.items, need), n, 1, recipe.needs, 'You have', 'that takes'));
  }
  const minutes = cookMinutes(r, item);
  if (fire.until - w.t < minutes) return no('The fire is burning too low for that.');
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) addGoods(r.items, need, -n);
  r.stove = { item, batches: 1, qty: HOME_YIELD, shopId: `fire:${fire.id}`, until: w.t + minutes };
  return ok(`You set ${item === 'bubur' ? 'your pot' : 'the fish'} over the fire.`);
}

/** The plain dish a raw thing makes, when nothing else can be made from it yet. */
const PLAIN_DISH: Partial<Record<ItemId, ItemId>> = { rice: 'bubur', fish: 'grilled fish', vegetables: 'boiled kangkong' };

/**
 * "Cook kangkong", "cook fish": the dish they mean, from what it's made of
 * (Kampung, 2026-10-29). The one dish they know made from it; else the one
 * they could make from what's to hand; else the plain dish. Two or more they
 * could make now: the choices, to say which.
 */
function dishOf(w: World, r: Resident, raw: ItemId): ItemId | ItemId[] | null {
  const spot = kitchenFor(w, r);
  const knows = (Object.entries(RECIPES) as [ItemId, NonNullable<(typeof RECIPES)[ItemId]>][])
    .filter(([, recipe]) => recipe.needs[raw] && skillLevel(r, 'cooking') >= (recipe.level ?? 1))
    .map(([dish]) => dish)
    .sort((a, b) => Number(b === PLAIN_DISH[raw]) - Number(a === PLAIN_DISH[raw]));
  const known = knows.filter((dish) => !(spot === 'home' && RECIPES[dish]!.level) && (spot !== 'fire' || FIRE_DISHES.includes(dish)));
  // Nothing of theirs that can be made here: the dish, so they hear why not here ("You can't make that over an open fire.").
  if (!known.length) return knows[0] ?? null;
  if (known.length === 1) return known[0]!;
  const now = cookable(w, r)?.dishes ?? [];
  const could = known.filter((d) => now.includes(d));
  if (could.length === 1) return could[0]!;
  if (could.length > 1) return could;
  return PLAIN_DISH[raw] && known.includes(PLAIN_DISH[raw]!) ? PLAIN_DISH[raw]! : known;
}

/** Where r would cook if they cooked now: a kitchen's name for the cook action, the dishes they could make, and whether there's fuel. */
export type CookAt = 'kitchen' | 'home' | 'village kitchen' | 'fire';

/**
 * What r could cook right now, where they are (the same place `cook` would use):
 * the kopitiam's kitchen from its stock and what they bring, or at home, in the
 * village kitchen or over a fire from what they carry; and whether a stove there
 * has anything to burn.
 */
export function cookable(w: World, r: Resident): { at: CookAt; dishes: ItemId[]; fuel: boolean } | null {
  const spot = kitchenFor(w, r);
  if (typeof spot === 'string' && spot !== 'home' && spot !== 'shared' && spot !== 'fire') return null;
  const shop = typeof spot === 'string' ? null : spot;
  const own = w.shopOf(r.id)?.id === shop?.id;
  const have = (i: ItemId) => (shop ? countGoods(shop.stock, i) : 0) + (!shop || own ? countGoods(r.items, i) : 0);
  const dishes = (Object.entries(RECIPES) as [ItemId, NonNullable<(typeof RECIPES)[ItemId]>][])
    .filter(([dish, recipe]) => skillLevel(r, 'cooking') >= (recipe.level ?? 1) && !(spot === 'home' && recipe.level)
      && (spot !== 'fire' || (FIRE_DISHES.includes(dish) && (dish !== 'bubur' || countGoods(r.items, 'pot') > 0))))
    .filter(([, recipe]) => (Object.entries(recipe.needs) as [ItemId, number][]).every(([need, n]) => have(need) >= n))
    // Over a fire, only what it will still be burning for.
    .filter(([dish]) => spot !== 'fire' || fireNear(w, r)!.until - w.t >= cookMinutes(r, dish))
    .map(([dish]) => dish);
  const stove = spot === 'home' ? r.homeId : spot === 'shared' ? KITCHEN_ID : null;
  const fuel = !stove || (w.state.stoves[stove] ?? 0) + countGoods(r.items, 'kerosene') + countGoods(r.items, 'firewood') > 0;
  const at: CookAt = spot === 'home' ? 'home' : spot === 'shared' ? 'village kitchen' : spot === 'fire' ? 'fire' : 'kitchen';
  return { at, dishes, fuel };
}

/** Where this resident may cook here: their own kitchen, the one they're on shift in, home, the village kitchen or a fire; or why not. */
export function kitchenFor(w: World, r: Resident): Shop | 'home' | 'shared' | 'fire' | string {
  const off = r.activity?.kind !== 'working';
  // Off shift in your own house: the small stove at home.
  if (off && w.isAt(r, r.homeId)) return 'home';
  // The village kitchen once it's built; a fire burning where they stand (even beside the kitchen while it's going up).
  if (off && w.isAt(r, KITCHEN_ID) && kitchenBuilt(w)) return 'shared';
  if (off && fireNear(w, r)) return 'fire';
  if (off && w.isAt(r, KITCHEN_ID)) return "The village kitchen isn't built yet.";
  const own = w.shopOf(r.id);
  if (own?.id === 'kopitiam') return w.isAt(r, own.id) ? own : "You'd have to be in your kitchen to cook.";
  const job = w.jobOf(r.id);
  if (job?.placeId === 'kopitiam') {
    return r.activity?.kind === 'working' ? w.shop(job.placeId)! : 'You can only use the kitchen during your shift.';
  }
  if (fireGround(w, r)) return "There's no fire burning here. A bundle of firewood would light one, here or on the beach.";
  return 'Your stove is at home.';
}

export function cook(w: World, r: Resident, i: Intent): ActionResult {
  const shop = kitchenFor(w, r);
  if (shop !== 'home' && shop !== 'shared' && shop !== 'fire' && typeof shop === 'string') return no(shop);
  const named = itemOf(i.item);
  const item = named && RECIPES[named] ? named : named ? dishOf(w, r, named) : null;
  if (Array.isArray(item)) return no(`${`${item.slice(0, -1).join(', ')}, or ${item.at(-1)}`.replace(/^./, (c) => c.toUpperCase())}? Say which.`);
  const recipe = item ? RECIPES[item] : undefined;
  if (!item || !recipe || skillLevel(r, 'cooking') < (recipe.level ?? 1)) return no(`You don't know how to make ${quoted(i.item)}.`);
  const batches = qtyOf(i.batches);
  if (batches === null) return no(SAY_NOTHING_SENSIBLE);
  if (shop === 'home') return cookAtHome(w, r, item, batches);
  if (shop === 'shared') return cookAtHome(w, r, item, batches, KITCHEN_ID);
  if (shop === 'fire') return cookAtFire(w, r, item);
  if (typeof shop === 'string') return no(shop);
  const own = w.shopOf(r.id)?.id === shop.id;
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) {
    const have = countGoods(shop.stock, need) + (own ? countGoods(r.items, need) : 0);
    if (have < n * batches) return no(shortOf(need, have, n, batches, recipe.needs, own ? 'The kitchen and your bag have' : 'The kitchen has'));
  }
  // The kitchen's stock first, then (in their own kitchen) what the cook has brought along.
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) {
    const fromStock = Math.min(countGoods(shop.stock, need), n * batches);
    addGoods(shop.stock, need, -fromStock);
    if (n * batches > fromStock) addGoods(r.items, need, -(n * batches - fromStock));
  }
  // At the stove until it's done (daily-life.md B): the servings go into the kitchen then.
  // A master cook's batch gives one more serving.
  const master = skillLevel(r, 'cooking') === 5;
  const qty = (recipe.yields + (master ? 1 : 0)) * batches;
  // A handy cook is a fifth quicker at the stove.
  const minutes = Math.round((COOK_MINUTES[item] ?? 10) * (effectiveLevel(r, 'cooking') >= 2 ? HANDY_COOK : 1));
  r.stove = { item, batches, qty, shopId: shop.id, until: w.t + minutes * batches };
  return ok(`You start cooking ${batches === 1 ? 'a batch' : `${batches} batches`} of ${item}.`);
}
