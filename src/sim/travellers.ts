/**
 * Travellers from the coast road (docs/design/daily-life.md B): nameless
 * customers who stop at the shops at set hours, queue, and pay the posted
 * price if it's no more than they'll pay. No AI and no cost: all in the tick.
 * Their money comes from outside, through the `travellers` account, and only
 * up to each shop's daily budget (an owner's dial, src/sim/dials.ts).
 */
import { practise, skillLevel } from './skills.ts';
import { quantityLabel, RECIPES, type ItemId } from './items.ts';
import { formatMoney, type Cents } from './money.ts';
import { addGoods, countGoods, isKept, TRAVELLERS_ID, type Resident, type Shop, type World } from './state.ts';
import { dayIndex, minuteOfDay } from './time.ts';

/** Minutes a customer takes to serve. */
export const SERVE_MINUTES = 2;
/** How many wait in a shop's queue at most; more leave at once. */
export const QUEUE_MAX = 4;
/** How long a customer waits to be served before giving up. */
export const WAIT_MINUTES = 8;
/** In a shop swept today, they'll wait longer. */
export const SWEPT_WAIT_MINUTES = 12;
/** Minutes at the stove a batch takes (kopi is quicker). */
export const COOK_MINUTES: Partial<Record<ItemId, number>> = { kopi: 5, 'fish porridge': 10, 'vegetable rice': 10, 'sambal kangkong': 8, bubur: 12, 'grilled fish': 10, 'boiled kangkong': 8 };

/** When travellers come to each shop: one every so many minutes in its busy hours, and in its other open hours (07–21). */
export const TRAVELLER_HOURS: Record<string, { busy: [number, number][]; busyEvery: number; otherEvery: number }> = {
  kopitiam: { busy: [[6 * 60 + 30, 8 * 60 + 30], [12 * 60, 13 * 60], [18 * 60, 19 * 60]], busyEvery: 5, otherEvery: 20 },
  'provision-shop': { busy: [[8 * 60, 10 * 60], [16 * 60, 18 * 60]], busyEvery: 6, otherEvery: 30 },
  'market-stall': { busy: [[6 * 60, 9 * 60]], busyEvery: 4, otherEvery: 30 },
};
const OPEN_FROM = 7 * 60;
const OPEN_TO = 21 * 60;

/** What a traveller wants at each shop, by weight. */
const WANTS: Record<string, Partial<Record<ItemId, number>>> = {
  kopitiam: { kopi: 3, 'fish porridge': 2, 'vegetable rice': 2, 'sambal kangkong': 2 },
  'provision-shop': { rice: 3, bread: 3, coffee: 1 },
  'market-stall': { fish: 3, vegetables: 2, chilli: 1, papaya: 1, 'red snapper': 1 },
};

/** The most a traveller will pay for one (later the economy check's town reference prices). */
export const TRAVELLER_PAYS: Partial<Record<ItemId, Cents>> = {
  kopi: 20, 'fish porridge': 50, 'vegetable rice': 45, rice: 35, coffee: 75, bread: 25, fish: 55, vegetables: 35,
  'red snapper': 150, chilli: 40, papaya: 60, 'sambal kangkong': 50,
};

/** At a kitchen where a master cooked today, travellers pay up to this much more. */
export const MASTER_PAYS = 1.2;

/** The most a traveller will pay for one here today. */
export function travellerPays(shop: Shop, item: ItemId): Cents {
  return Math.round((TRAVELLER_PAYS[item] ?? 0) * (shop.today.masterCooked ? MASTER_PAYS : 1));
}

/** A fresh day's counts for a shop. */
export function freshDay(day: number): Shop['today'] {
  return { day, served: 0, cents: 0, left: 0, away: 0, awayTold: 0, tooDear: {}, servedBy: {}, masterCooked: false, lost: 0 };
}

/** How often a traveller comes to this shop at this minute of the day, or null if none come now. */
function every(shopId: string, mod: number): number | null {
  const h = TRAVELLER_HOURS[shopId];
  if (!h) return null;
  if (h.busy.some(([a, b]) => mod >= a && mod < b)) return h.busyEvery;
  return mod >= OPEN_FROM && mod < OPEN_TO ? h.otherEvery : null;
}

/** Who can serve at this shop now: the owner there (awake, not walking, not at the stove) and each worker on shift there not cooking. */
export function servers(w: World, shop: Shop): Resident[] {
  const out: Resident[] = [];
  if (shop.ownerId === null) return out;
  const owner = w.resident(shop.ownerId);
  if (w.isAt(owner, shop.id) && !owner.activity && !owner.stove) out.push(owner);
  for (const r of w.state.residents) {
    const a = r.activity;
    if (a?.kind === 'working' && !r.stove && w.state.jobs.some((j) => j.id === a.jobId && j.placeId === shop.id)) out.push(r);
  }
  return out;
}

/** The thing a traveller wants: one of what the shop sells and has, picked by fixed weights (no randomness). */
function wanted(w: World, shop: Shop): ItemId | null {
  const choices = (Object.entries(WANTS[shop.id] ?? {}) as [ItemId, number][])
    .filter(([item]) => shop.sellPrices[item] && countGoods(shop.stock, item) > w.dials.travellerReserve);
  const total = choices.reduce((n, [, k]) => n + k, 0);
  if (!total) return null;
  let pick = (Math.imul(w.t, 2654435761) >>> 0) % total;
  for (const [item, k] of choices) {
    if (pick < k) return item;
    pick -= k;
  }
  return null;
}

/**
 * A traveller left unserved: what they'd have paid counts as lost, but never
 * more than the shop's travellers could still spend today, nor more than the
 * stock it had there to sell them.
 */
function lost(w: World, shop: Shop, item: ItemId): void {
  const price = shop.sellPrices[item] ?? 0;
  const stock = (Object.entries(shop.sellPrices) as [ItemId, number][])
    .reduce((n, [i, p]) => n + p * Math.max(0, countGoods(shop.stock, i) - w.dials.travellerReserve), 0);
  shop.today.lost = Math.max(shop.today.lost, Math.min(shop.today.lost + price, w.dials.travellerBudgetCents - shop.today.cents, stock));
}

/** English enough to talk with the road's clerks and servicemen (school.md). */
export const ENGLISH_SERVES = 2;

/** One minute of travellers at every shop: arrivals, the queue, serving, and the hourly line. */
export function travellersMinute(w: World): void {
  const mod = minuteOfDay(w.t);
  const day = dayIndex(w.t);
  for (const shop of w.state.shops) {
    if (shop.today.day !== day) shop.today = freshDay(day);
    // A stall standing free is shut: no traveller stops.
    if (!isKept(shop)) {
      shop.queue = [];
      shop.serving = [];
      continue;
    }
    // Finished serving: the sale goes through if the thing is still there.
    for (const s of shop.serving.filter((x) => x.until <= w.t)) {
      const price = shop.sellPrices[s.item];
      // The last few are kept back for the kampung's own people (an owner's dial).
      if (price && countGoods(shop.stock, s.item) > w.dials.travellerReserve && price <= travellerPays(shop, s.item)) {
        addGoods(shop.stock, s.item, -1);
        w.transfer(TRAVELLERS_ID, shop.ownerId, price, `travellers bought ${s.item}`);
        // Clerks and servicemen on the road pay a little more where they're served in English (school.md).
        const server = w.state.residents.find((r) => r.id === s.by);
        const tip = server && skillLevel(server, 'english') >= ENGLISH_SERVES ? Math.round(price / 10) : 0;
        if (tip) {
          w.transfer(TRAVELLERS_ID, shop.ownerId, tip, 'travellers, a little more for being served in English');
          shop.today.cents += tip;
          shop.hour.cents += tip;
        }
        w.emit({ type: 'traveller_bought', shop: shop.id, owner: shop.ownerId, by: s.by, item: s.item, cents: price + tip });
        shop.today.served++;
        shop.today.cents += price;
        shop.today.servedBy[s.by] = (shop.today.servedBy[s.by] ?? 0) + 1;
        shop.hour.served++;
        shop.hour.cents += price;
      } else {
        shop.today.left++;
        shop.hour.left++;
        lost(w, shop, s.item);
      }
    }
    shop.serving = shop.serving.filter((x) => x.until > w.t);
    // Tired of waiting.
    const wait = shop.sweptDay === day ? SWEPT_WAIT_MINUTES : WAIT_MINUTES;
    const gone = shop.queue.filter((c) => w.t - c.t > wait);
    const gaveUp = gone.length;
    for (const c of gone) lost(w, shop, c.item);
    if (gaveUp) {
      shop.queue = shop.queue.filter((c) => w.t - c.t <= wait);
      shop.today.left += gaveUp;
      shop.hour.left += gaveUp;
    }
    // Someone arrives, until the shop's travellers have spent today's budget (the owner's dial): then nobody more comes.
    const n = every(shop.id, mod);
    const free = servers(w, shop);
    if (n !== null && mod % n === 0 && shop.today.cents < w.dials.travellerBudgetCents) {
      const item = wanted(w, shop);
      if (item) {
        if ((shop.sellPrices[item] ?? 0) > travellerPays(shop, item)) shop.today.tooDear[item] = (shop.today.tooDear[item] ?? 0) + 1;
        else if (!free.length) {
          shop.today.away++;
          shop.hour.left++;
          lost(w, shop, item);
        }
        else if (shop.queue.length >= QUEUE_MAX) {
          shop.today.left++;
          shop.hour.left++;
          lost(w, shop, item);
        } else shop.queue.push({ item, t: w.t });
      }
    }
    // Whoever is free takes the next in line.
    for (const r of free) {
      if (!shop.queue.length) break;
      if (shop.serving.some((s) => s.by === r.id)) continue;
      const next = shop.queue.shift()!;
      shop.serving.push({ by: r.id, item: next.item, until: w.t + SERVE_MINUTES });
    }
    // Back at the shop: the owner hears who came while they were away.
    const owner = w.resident(shop.ownerId);
    if (w.isAt(owner, shop.id) && !w.isAsleep(owner) && shop.today.away > shop.today.awayTold) {
      const missed = shop.today.away - shop.today.awayTold;
      shop.today.awayTold = shop.today.away;
      w.notify(owner.id, `While you were away, ${missed === 1 ? 'one person' : `${missed} people`} found nobody serving.`);
    }
    // One feed line an hour per busy shop.
    if (mod % 60 === 0 && (shop.hour.served || shop.hour.left)) {
      w.emit({ type: 'travellers_hour', shop: shop.id, served: shop.hour.served, cents: shop.hour.cents, left: shop.hour.left });
      shop.hour = { served: 0, cents: 0, left: 0 };
    }
  }
}

/** Whether r is serving a traveller this minute (it tires them as a shift does). */
export function isServing(w: World, r: Resident): boolean {
  return w.state.shops.some((s) => s.serving.some((x) => x.by === r.id));
}

/** Where nothing else says, a dish's first price. */
export const FIRST_DISH_PRICE: Cents = 20;
/** A first price is what goes into a serving and half as much again. */
export const DISH_MARGIN = 1.5;

/**
 * What a dish cooked at a stall goes on its counter at, when it has no price
 * there yet: what another stall asks for it; else what goes into a serving
 * (at what the stall buys it for, or the town's going price) and half as much
 * again, to the next 5¢; else a modest first price. The keeper changes it as
 * they like.
 */
export function startingPrice(w: World, shop: Shop, item: ItemId): Cents {
  const elsewhere = w.state.shops.filter((s) => s !== shop && isKept(s)).map((s) => s.sellPrices[item] ?? 0).filter((c) => c > 0);
  if (elsewhere.length) return Math.min(...elsewhere);
  const recipe = RECIPES[item];
  if (!recipe) return FIRST_DISH_PRICE;
  let cost = 0;
  for (const [need, n] of Object.entries(recipe.needs) as [ItemId, number][]) {
    if (need === 'water') continue;
    const each = shop.buyPrices[need] ?? TRAVELLER_PAYS[need];
    if (each === undefined) return FIRST_DISH_PRICE;
    cost += each * n;
  }
  return Math.max(5, Math.ceil((cost / recipe.yields) * DISH_MARGIN / 5) * 5);
}

/** One minute at the stove: a batch done when its time is up, the servings into the kitchen. */
export function stoveMinute(w: World, r: Resident): void {
  const s = r.stove;
  if (!s || w.t < s.until) return;
  r.stove = null;
  const shop = w.shop(s.shopId);
  // A pot at home goes into the cook's hands.
  if (shop) addGoods(shop.stock, s.item, s.qty);
  else addGoods(r.items, s.item, s.qty);
  // Cooked at a stall: on its counter, at a first price if it has none.
  if (shop && isKept(shop) && !shop.sellPrices[s.item] && !shop.notSelling.includes(s.item)) {
    const price = startingPrice(w, shop, s.item);
    shop.sellPrices[s.item] = price;
    w.notify(shop.ownerId, `The ${s.item} goes on your counter at ${formatMoney(price)} each; you can change its price whenever you like.`);
  }
  w.emit({ type: 'cooked', who: r.id, item: s.item, qty: s.qty });
  // Word gets round on the road: travellers pay a little more where a master cooked today.
  if (shop && skillLevel(r, 'cooking') === 5) shop.today.masterCooked = true;
  practise(w, r, 'cooking', s.batches);
  w.notify(r.id, `The ${s.item} is ready: ${quantityLabel(s.item, s.qty)}.`);
}
