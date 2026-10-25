import { endShift } from '../activities.ts';
import { LORRY_SELLS, RECIPES, quantityLabel, type ItemId } from '../items.ts';
import { PLACE_BY_ID } from '../map.ts';
import { formatMoney } from '../money.ts';
import { addGoods, countGoods, LORRY_ID, type Resident, type Shop, type World } from '../state.ts';
import {
  type ActionResult, type Intent, MAX_PRICE, SAY_NOTHING_SENSIBLE, goodsLabel, itemOf, moneyOf, no, ok,
  personNearby, qtyOf, quoted,
} from './common.ts';
import { shiftLabel } from './everyone.ts';

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
  if (side === 'buy') {
    if (limit !== null && cents > 0) shop.buyLimits[item] = limit;
    else delete shop.buyLimits[item];
  }
  w.emit({ type: 'price_set', who: r.id, shop: shop.id, item, side, cents, limit });
  if (cents === 0) return ok(side === 'sell' ? `You stop selling ${item}.` : `You stop buying ${item}.`);
  if (side === 'sell') return ok(`You'll sell ${item} at ${formatMoney(cents)} each.`);
  return ok(`You'll buy ${item} at ${formatMoney(cents)} each${limit !== null ? `, up to ${quantityLabel(item, limit)}` : ''}.`);
}

export function offerJob(w: World, r: Resident, i: Intent): ActionResult {
  const shop = ownShop(w, r);
  if (typeof shop === 'string') return no("You don't have a business to hire for.");
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  if (o.role === 'owner') return no(`${o.name} has a business to run.`);
  const job = w.jobOf(o.id);
  if (job?.employerId === r.id) return no(`${o.name} already works for you.`);
  const wage = moneyOf(i.wage);
  if (wage === null || wage === 0 || wage > MAX_WAGE) return no("That doesn't sound like a wage.");
  const startHour = qtyOf(i.startHour, -1);
  const hours = qtyOf(i.hours, -1);
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
  const o = w.residentByName(i.who);
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
  const o = w.residentByName(i.to);
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
  if (typeof shop === 'string') return no('The lorry man only takes orders from shopkeepers.');
  if (!w.isAt(r, 'lorry-stop')) return no("You'd have to meet the lorry to order stock.");
  if (!w.state.lorryHere) return no("The lorry isn't here.");
  const item = itemOf(i.item);
  const price = item ? LORRY_SELLS[item] : undefined;
  if (!item || !price) return no(`The lorry doesn't carry ${quoted(i.item)}.`);
  const qty = qtyOf(i.qty);
  if (qty === null) return no(SAY_NOTHING_SENSIBLE);
  const cost = price * qty;
  if (r.money < cost) return no(`${quantityLabel(item, qty)} would cost ${formatMoney(cost)}. You have ${formatMoney(r.money)}.`);
  w.transfer(r.id, LORRY_ID, cost, `ordered ${item}`);
  addGoods(shop.stock, item, qty);
  w.emit({ type: 'lorry_order', who: r.id, shop: shop.id, item, qty, cents: cost });
  return ok(`You pay the lorry man ${formatMoney(cost)} for ${quantityLabel(item, qty)}. It'll be dropped off at your shop.`);
}

/** Whose kitchen this resident may cook in: their own, or the one they're on shift in. */
function kitchenFor(w: World, r: Resident): Shop | string {
  const own = w.shopOf(r.id);
  if (own?.id === 'kopitiam') return w.isAt(r, own.id) ? own : "You'd have to be in your kitchen to cook.";
  const job = w.jobOf(r.id);
  if (job?.placeId === 'kopitiam') {
    return r.activity?.kind === 'working' ? w.shop(job.placeId)! : 'You can only use the kitchen during your shift.';
  }
  return "You don't have a kitchen to cook in.";
}

export function cook(w: World, r: Resident, i: Intent): ActionResult {
  const shop = kitchenFor(w, r);
  if (typeof shop === 'string') return no(shop);
  const item = itemOf(i.item);
  const recipe = item ? RECIPES[item] : undefined;
  if (!item || !recipe) return no(`You don't know how to make ${quoted(i.item)}.`);
  const batches = qtyOf(i.batches);
  if (batches === null) return no(SAY_NOTHING_SENSIBLE);
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) {
    if (countGoods(shop.stock, need) < n * batches) {
      const perBatch = goodsLabel(recipe.needs);
      return no(`Each batch takes ${perBatch}, and the kitchen is short of ${need}.`);
    }
  }
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) addGoods(shop.stock, need, -n * batches);
  const qty = recipe.yields * batches;
  addGoods(shop.stock, item, qty);
  w.emit({ type: 'cooked', who: r.id, item, qty });
  return ok(`You cook ${quantityLabel(item, qty)}.`);
}
