import { FISHING_MINUTES, RESTED, startSleep } from '../activities.ts';
import { ITEMS, LORRY_BUYS, quantityLabel, type ItemId } from '../items.ts';
import { PLACES, PLACE_BY_ID, findPath, type Point } from '../map.ts';
import { formatMoney } from '../money.ts';
import { describe, perceive } from '../perception.ts';
import {
  addGoods, countGoods, type Resident, type Shop, type World, LORRY_ID,
} from '../state.ts';
import { atTimeOfDay, dayIndex, sgtHour } from '../time.ts';
import {
  type ActionResult, type Intent, SAY_NOTHING_SENSIBLE, bundleLabel, bundleOf, isEmptyBundle, itemOf,
  lacks, moneyOf, no, ok, personNearby, qtyOf, quoted, textOf,
} from './common.ts';

export const MAX_SAY = 300;
export const MAX_NOTE = 200;
export const MAX_NOTES = 12;
export const TRADE_OFFER_MINUTES = 30;
export const MAX_BEDS_EACH = 2;
export const HARVEST_YIELD = 5;
export const DAYS_TO_GROW = 2;

const PLACE_WORDS: Record<string, string[]> = {
  kopitiam: ['kopitiam', 'coffee shop'],
  'provision-shop': ['provision shop', 'provisions shop', 'provision store', 'sundry shop'],
  'market-stall': ['wet-market stall', 'wet market stall', 'market stall', 'wet market', 'market', 'stall'],
  'lorry-stop': ['lorry stop', 'lorry', 'road'],
  farm: ['farm plot', 'farm', 'plot', 'vegetable plot'],
  jetty: ['jetty', 'pier'],
  well: ['well'],
  'notice-board': ['notice board', 'noticeboard', 'board'],
};

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/^(the|to the|to)\s+/, '');
}

/** Where "walk to X" leads: a place, a house, home, or a person. */
export function resolveDestination(w: World, r: Resident, where: unknown):
  { point: Point; placeId: string | null; label: string } | string {
  if (typeof where !== 'string' || !where.trim()) return "You're not sure where you meant to go.";
  const s = normalise(where);
  if (['home', 'my house', 'my home', 'house', 'my attap house'].includes(s)) {
    const h = w.home(r);
    return { point: h.spot, placeId: h.id, label: 'home' };
  }
  for (const [id, words] of Object.entries(PLACE_WORDS)) {
    if (words.includes(s)) {
      const p = PLACE_BY_ID.get(id)!;
      return { point: p.spot, placeId: id, label: p.name };
    }
  }
  const house = /^(.+?)['’]s\s+(house|home|place)$/.exec(s);
  if (house) {
    const o = w.residentByName(house[1]);
    if (o) {
      const h = w.home(o);
      return { point: h.spot, placeId: h.id, label: w.placeName(h) };
    }
  }
  const person = w.residentByName(where);
  if (person && person.id !== r.id) return { point: person.pos, placeId: null, label: person.name };
  if (person) return "You're already where you are.";
  const exact = PLACES.find((p) => p.kind !== 'house' && normalise(p.name) === s);
  if (exact) return { point: exact.spot, placeId: exact.id, label: exact.name };
  return `You don't know of anywhere called ${quoted(where)}.`;
}

export function walkTo(w: World, r: Resident, i: Intent): ActionResult {
  const d = resolveDestination(w, r, i.where);
  if (typeof d === 'string') return no(d);
  if (d.placeId && w.isAt(r, d.placeId)) return no(d.label === 'home' ? "You're already home." : `You're already at ${d.label}.`);
  if (!d.placeId) {
    const o = w.residentByName(d.label)!;
    if (w.isNear(r, o)) return no(`${o.name} is right here.`);
  }
  const path = findPath(r.pos, d.point);
  if (!path) return no("You can't see a way to get there.");
  r.activity = { kind: 'walking', path, dest: d.placeId, thenSleep: false };
  w.emit({ type: 'walked', who: r.id, to: d.label === 'home' ? w.placeName(w.home(r)) : d.label });
  return ok(`You set off for ${d.label === 'home' ? 'home' : d.label}.`);
}

export function lookAround(w: World, r: Resident): ActionResult {
  w.emit({ type: 'looked_around', who: r.id });
  return ok(describe(perceive(w, r)));
}

export function say(w: World, r: Resident, i: Intent): ActionResult {
  const text = textOf(i.text);
  if (!text) return no('You open your mouth, but nothing comes out.');
  if (text.length > MAX_SAY) return no("That's a lot to say in one go. Keep it shorter.");
  let to: Resident | null = null;
  if (i.to !== undefined && i.to !== null && i.to !== '') {
    const o = personNearby(w, r, i.to);
    if (typeof o === 'string') return no(o);
    to = o;
  }
  w.emit({ type: 'said', who: r.id, to: to?.id ?? null, text });
  for (const o of w.nearby(r)) {
    if (w.isAsleep(o)) continue;
    const line = to && to.id === o.id ? `${r.name} says to you: "${text}"` : to ? `${r.name} says to ${to.name}: "${text}"` : `${r.name} says: "${text}"`;
    w.notify(o.id, line);
  }
  return ok();
}

/** The shop whose premises the resident is standing in, if any. */
export function shopHere(w: World, r: Resident): Shop | null {
  const p = w.placeOf(r);
  return p ? w.shop(p.id) : null;
}

/** Someone is serving: the owner is there and awake, or a worker is on shift there. */
export function isStaffed(w: World, shop: Shop): boolean {
  const owner = w.resident(shop.ownerId);
  if (w.isAt(owner, shop.id) && !w.isAsleep(owner) && owner.activity?.kind !== 'walking') return true;
  return w.state.residents.some((x) => {
    const a = x.activity;
    if (a?.kind !== 'working') return false;
    return w.state.jobs.some((j) => j.id === a.jobId && j.placeId === shop.id);
  });
}

function shopName(shop: Shop): string {
  return PLACE_BY_ID.get(shop.id)!.name;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function recordFirstSale(w: World, shop: Shop): void {
  const key = `first-sale:${shop.id}`;
  if (w.state.firsts.includes(key)) return;
  w.state.firsts.push(key);
  w.emit({ type: 'first_sale', who: shop.ownerId, shop: shop.id });
}

export function buy(w: World, r: Resident, i: Intent): ActionResult {
  if (w.isAt(r, 'lorry-stop')) {
    return no(w.shopOf(r.id) ? 'The lorry man takes orders for your shop, not sales over the tailboard.' : 'The lorry man only takes orders from shopkeepers.');
  }
  const shop = shopHere(w, r);
  if (!shop) return no("There's nothing for sale here.");
  const item = itemOf(i.item);
  const name = capital(shopName(shop));
  if (!item) return no(`${name} doesn't sell ${quoted(i.item)}.`);
  const qty = qtyOf(i.qty);
  if (qty === null) return no(SAY_NOTHING_SENSIBLE);
  const have = countGoods(shop.stock, item);
  if (shop.ownerId === r.id) {
    if (have < qty) return no(have === 0 ? `You've no ${item} left in stock.` : `You only have ${quantityLabel(item, have)} in stock.`);
    addGoods(shop.stock, item, -qty);
    addGoods(r.items, item, qty);
    w.emit({ type: 'took_stock', who: r.id, shop: shop.id, item, qty });
    return ok(`You take ${quantityLabel(item, qty)} from your own stock.`);
  }
  if (!isStaffed(w, shop)) return no(`Nobody's minding ${shopName(shop)} right now.`);
  const price = shop.sellPrices[item];
  if (!price) return no(`${name} doesn't sell ${item}.`);
  if (have === 0) return no(`${name} has run out of ${item}.`);
  if (have < qty) return no(`${name} only has ${quantityLabel(item, have)} left.`);
  const cost = price * qty;
  if (r.money < cost) return no(`You can't afford that: ${quantityLabel(item, qty)} costs ${formatMoney(cost)} and you have ${formatMoney(r.money)}.`);
  w.transfer(r.id, shop.ownerId, cost, `bought ${item}`);
  addGoods(shop.stock, item, -qty);
  addGoods(r.items, item, qty);
  w.emit({ type: 'bought', who: r.id, from: shop.ownerId, shop: shop.id, item, qty, cents: cost });
  recordFirstSale(w, shop);
  w.remember(shop.ownerId, `${r.name} bought ${quantityLabel(item, qty)} for ${formatMoney(cost)}.`);
  return ok(`You buy ${quantityLabel(item, qty)} for ${formatMoney(cost)}.`);
}

export function sell(w: World, r: Resident, i: Intent): ActionResult {
  const item = itemOf(i.item);
  const qty = qtyOf(i.qty);
  if (qty === null) return no(SAY_NOTHING_SENSIBLE);
  if (w.isAt(r, 'lorry-stop')) {
    if (!w.state.lorryHere) return no("The lorry isn't here.");
    const price = item ? LORRY_BUYS[item] : undefined;
    if (!item || !price) return no('The lorry man only buys fish and vegetables.');
    if (countGoods(r.items, item) < qty) return no(`You don't have ${quantityLabel(item, qty)}.`);
    const cents = price * qty;
    addGoods(r.items, item, -qty);
    w.transfer(LORRY_ID, r.id, cents, `sold ${item} to the lorry`);
    w.emit({ type: 'lorry_sale', who: r.id, item, qty, cents });
    return ok(`The lorry man takes ${quantityLabel(item, qty)} and pays you ${formatMoney(cents)}.`);
  }
  const shop = shopHere(w, r);
  if (!shop) return no("There's nobody here to sell to.");
  const name = capital(shopName(shop));
  if (!item) return no(`${name} doesn't buy ${quoted(i.item)}.`);
  if (countGoods(r.items, item) < qty) return no(`You don't have ${quantityLabel(item, qty)}.`);
  if (shop.ownerId === r.id) {
    addGoods(r.items, item, -qty);
    addGoods(shop.stock, item, qty);
    w.emit({ type: 'stocked', who: r.id, shop: shop.id, item, qty });
    return ok(`You put ${quantityLabel(item, qty)} into your stock.`);
  }
  if (!isStaffed(w, shop)) return no(`Nobody's minding ${shopName(shop)} right now.`);
  const price = shop.buyPrices[item];
  if (!price) return no(`${name} isn't buying ${item}.`);
  const owner = w.resident(shop.ownerId);
  const wants = shop.buyLimits[item];
  if (wants !== undefined && wants < qty) {
    return no(wants === 0 ? `${owner.name} isn't buying any more ${item}.` : `${owner.name} only wants ${quantityLabel(item, wants)} more.`);
  }
  const cents = price * qty;
  if (owner.money < cents) return no(`${owner.name} can't afford to buy that much right now.`);
  addGoods(r.items, item, -qty);
  addGoods(shop.stock, item, qty);
  if (wants !== undefined) shop.buyLimits[item] = wants - qty;
  w.transfer(owner.id, r.id, cents, `bought ${item} for the shop`);
  w.emit({ type: 'sold', who: r.id, to: owner.id, shop: shop.id, item, qty, cents });
  w.remember(owner.id, `${r.name} sold you ${quantityLabel(item, qty)} for ${formatMoney(cents)}.`);
  return ok(`You sell ${quantityLabel(item, qty)} for ${formatMoney(cents)}.`);
}

export function offerTrade(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const give = bundleOf(i.give);
  if (typeof give === 'string') return no(give);
  const want = bundleOf(i.want);
  if (typeof want === 'string') return no(want);
  if (isEmptyBundle(give)) return no('You need to offer something.');
  if (isEmptyBundle(want)) return no("If you want nothing back, just give it.");
  const missing = lacks(r, give, true);
  if (missing) return no(missing);
  w.state.trades = w.state.trades.filter((t) => !(t.fromId === r.id && t.toId === o.id));
  w.state.trades.push({ id: w.nextId(), fromId: r.id, toId: o.id, give, want, expires: w.t + TRADE_OFFER_MINUTES });
  w.emit({ type: 'trade_offered', who: r.id, to: o.id, give, want });
  w.notify(o.id, `${r.name} offers you ${bundleLabel(give)} for ${bundleLabel(want)}.`);
  return ok(`You offer ${o.name} ${bundleLabel(give)} for ${bundleLabel(want)}.`);
}

function tradeFrom(w: World, r: Resident, from: unknown) {
  const o = w.residentByName(from);
  if (!o) return `You don't know anyone called ${quoted(from)}.`;
  const offer = w.state.trades.find((t) => t.fromId === o.id && t.toId === r.id);
  if (!offer) return `${o.name} hasn't offered you a trade.`;
  return { o, offer };
}

export function acceptTrade(w: World, r: Resident, i: Intent): ActionResult {
  const found = tradeFrom(w, r, i.from);
  if (typeof found === 'string') return no(found);
  const { o, offer } = found;
  const near = personNearby(w, r, o.name);
  if (typeof near === 'string') return no(near);
  const theirs = lacks(o, offer.give, false);
  if (theirs) return no(theirs);
  const mine = lacks(r, offer.want, true);
  if (mine) return no(mine);
  const move = (from: Resident, to: Resident, b: typeof offer.give) => {
    for (const [item, n] of Object.entries(b.items) as [ItemId, number][]) {
      addGoods(from.items, item, -n);
      addGoods(to.items, item, n);
    }
    if (b.cents > 0) w.transfer(from.id, to.id, b.cents, 'trade');
  };
  move(o, r, offer.give);
  move(r, o, offer.want);
  w.state.trades = w.state.trades.filter((t) => t.id !== offer.id);
  w.emit({ type: 'traded', who: r.id, with: o.id, give: offer.give, want: offer.want });
  w.notify(o.id, `${r.name} took your trade: ${bundleLabel(offer.give)} for ${bundleLabel(offer.want)}.`);
  return ok(`You trade ${bundleLabel(offer.want)} for ${bundleLabel(offer.give)}.`);
}

export function declineTrade(w: World, r: Resident, i: Intent): ActionResult {
  const found = tradeFrom(w, r, i.from);
  if (typeof found === 'string') return no(found);
  w.state.trades = w.state.trades.filter((t) => t.id !== found.offer.id);
  w.emit({ type: 'trade_declined', who: r.id, from: found.o.id });
  w.notify(found.o.id, `${r.name} turned down your trade.`);
  return ok(`You turn down ${found.o.name}'s offer.`);
}

export function fish(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'jetty')) return no('You need to be out on the jetty to fish.');
  r.activity = { kind: 'fishing', until: w.t + FISHING_MINUTES };
  w.emit({ type: 'went_fishing', who: r.id });
  return ok('You drop a line into the water and wait.');
}

function myBeds(w: World, r: Resident) {
  return w.state.beds.filter((b) => b.planterId === r.id);
}

export function isRipe(w: World, b: { wateredDays: number; plantedDay: number }): boolean {
  return b.wateredDays >= DAYS_TO_GROW && dayIndex(w.t) >= b.plantedDay + DAYS_TO_GROW;
}

export function plant(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'farm')) return no('You need to be at the farm plot to plant anything.');
  if (myBeds(w, r).length >= MAX_BEDS_EACH) return no('You already have two beds to look after.');
  const bed = w.state.beds.find((b) => b.planterId === null);
  if (!bed) return no('Every bed on the farm plot is taken.');
  bed.planterId = r.id;
  bed.plantedDay = dayIndex(w.t);
  bed.wateredDays = 0;
  bed.lastWateredDay = null;
  w.emit({ type: 'planted', who: r.id, bed: bed.n });
  return ok(`You plant kangkong cuttings in bed ${bed.n}. They'll need water every day.`);
}

export function water(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'farm')) return no('You need to be at the farm plot to water anything.');
  const beds = myBeds(w, r);
  if (beds.length === 0) return no("You haven't planted anything here.");
  const today = dayIndex(w.t);
  const dry = beds.filter((b) => b.lastWateredDay !== today);
  if (dry.length === 0) return no("You've already watered your beds today.");
  for (const b of dry) {
    b.wateredDays += 1;
    b.lastWateredDay = today;
  }
  w.emit({ type: 'watered', who: r.id, beds: dry.length });
  return ok(dry.length === 1 ? 'You water your bed.' : `You water your ${dry.length} beds.`);
}

export function harvest(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'farm')) return no('You need to be at the farm plot to harvest anything.');
  const beds = myBeds(w, r);
  if (beds.length === 0) return no("You haven't planted anything here.");
  const ripe = beds.filter((b) => isRipe(w, b));
  if (ripe.length === 0) return no("Your kangkong isn't ready yet.");
  const qty = ripe.length * HARVEST_YIELD;
  for (const b of ripe) {
    b.planterId = null;
    b.wateredDays = 0;
    b.lastWateredDay = null;
  }
  addGoods(r.items, 'vegetables', qty);
  w.emit({ type: 'harvested', who: r.id, qty });
  return ok(`You harvest ${quantityLabel('vegetables', qty)}.`);
}

export function eat(w: World, r: Resident, i: Intent): ActionResult {
  const item = itemOf(i.item);
  if (!item) return no(`You don't have anything called ${quoted(i.item)}.`);
  if (countGoods(r.items, item) < 1) return no(`You don't have any ${item}.`);
  const def = ITEMS[item];
  if (!def.food) return no(def.inedible ?? "You can't eat that.");
  if (r.hunger < 50 && !def.food.energy) return no("You're too full to eat another bite.");
  addGoods(r.items, item, -1);
  r.hunger = Math.max(0, r.hunger - def.food.hunger);
  r.energy = Math.min(1000, r.energy + (def.food.energy ?? 0));
  w.emit({ type: 'ate', who: r.id, item });
  return ok(`You have ${def.one}.`);
}

export function sleep(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, r.homeId)) return no("You'd rather sleep in your own bed at home.");
  if (r.energy >= RESTED - 50) return no("You're not tired enough to sleep.");
  startSleep(w, r, 'nap');
  return ok('You lie down for a rest.');
}

function hourLabel(h: number): string {
  if (h === 12) return '12 noon';
  if (h < 12) return `${h} in the morning`;
  if (h < 18) return `${h - 12} in the afternoon`;
  return `${h - 12} in the evening`;
}

export function shiftLabel(startHour: number, hours: number): string {
  return `from ${hourLabel(startHour)} to ${hourLabel(startHour + hours)}`;
}

export function acceptJob(w: World, r: Resident, i: Intent): ActionResult {
  const boss = w.residentByName(i.from);
  if (!boss) return no(`You don't know anyone called ${quoted(i.from)}.`);
  const offer = w.state.jobOffers.find((o) => o.employerId === boss.id && o.workerId === r.id);
  if (!offer) return no(`${boss.name} hasn't offered you a job.`);
  const current = w.jobOf(r.id);
  if (current) return no(`You'll have to quit your job at ${PLACE_BY_ID.get(current.placeId)!.name} first.`);
  if (!w.isNear(r, boss)) return no(`You'd have to tell ${boss.name} in person.`);
  const shop = w.shopOf(boss.id)!;
  w.state.jobs.push({
    id: w.nextId(), employerId: boss.id, workerId: r.id, placeId: shop.id,
    wage: offer.wage, startHour: offer.startHour, hours: offer.hours, lastWorkedDay: null,
  });
  w.state.jobOffers = w.state.jobOffers.filter((o) => o.workerId !== r.id);
  w.emit({ type: 'hired', who: r.id, by: boss.id, shop: shop.id, wage: offer.wage });
  w.notify(boss.id, `${r.name} accepted your job offer.`);
  return ok(`You now work for ${boss.name} at ${shopName(shop)}, ${shiftLabel(offer.startHour, offer.hours)}, for ${formatMoney(offer.wage)} a shift.`);
}

export function quitJob(w: World, r: Resident): ActionResult {
  const job = w.jobOf(r.id);
  if (!job) return no("You don't have a job to quit.");
  w.state.jobs = w.state.jobs.filter((j) => j.id !== job.id);
  w.emit({ type: 'quit', who: r.id, from: job.employerId });
  w.notify(job.employerId, `${r.name} quit working for you.`);
  return ok(`You quit your job at ${PLACE_BY_ID.get(job.placeId)!.name}.`);
}

export function workShift(w: World, r: Resident): ActionResult {
  const job = w.jobOf(r.id);
  if (!job) return no("You don't have a job.");
  const where = PLACE_BY_ID.get(job.placeId)!.name;
  if (!w.isAt(r, job.placeId)) return no(`Your work is at ${where}. You'd better get there.`);
  const h = sgtHour(w.t);
  if (h < job.startHour || h >= job.startHour + job.hours) return no(`Your shift is ${shiftLabel(job.startHour, job.hours)}.`);
  if (job.lastWorkedDay === dayIndex(w.t)) return no("You've already done today's shift.");
  if (r.hunger >= 1000) return no("You're too weak from hunger to work.");
  r.activity = { kind: 'working', jobId: job.id, until: atTimeOfDay(w.t, job.startHour + job.hours), worked: 0 };
  w.emit({ type: 'shift_started', who: r.id, shop: job.placeId });
  return ok(`You start your shift at ${where}.`);
}

export function give(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to, { awake: false });
  if (typeof o === 'string') return no(o);
  const hasMoney = i.money !== undefined && i.money !== null && i.money !== '';
  if (hasMoney) {
    const cents = moneyOf(i.money);
    if (cents === null || cents === 0) return no("That doesn't sound like money.");
    if (r.money < cents) return no(`You only have ${formatMoney(r.money)}.`);
    w.transfer(r.id, o.id, cents, 'gift');
    w.emit({ type: 'gave', who: r.id, to: o.id, item: null, qty: 0, cents });
    w.notify(o.id, `${r.name} gave you ${formatMoney(cents)}.`);
    return ok(`You give ${o.name} ${formatMoney(cents)}.`);
  }
  if (i.item === undefined) return no("You're not sure what to give.");
  const item = itemOf(i.item);
  if (!item) return no(`You don't have anything called ${quoted(i.item)}.`);
  const qty = qtyOf(i.qty);
  if (qty === null) return no(SAY_NOTHING_SENSIBLE);
  if (countGoods(r.items, item) < qty) return no(`You don't have ${quantityLabel(item, qty)}.`);
  addGoods(r.items, item, -qty);
  addGoods(o.items, item, qty);
  w.emit({ type: 'gave', who: r.id, to: o.id, item, qty, cents: 0 });
  w.notify(o.id, `${r.name} gave you ${quantityLabel(item, qty)}.`);
  return ok(`You give ${o.name} ${quantityLabel(item, qty)}.`);
}

export function readNoticeBoard(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'notice-board')) return no("You can't read the notice board from here.");
  w.emit({ type: 'read_notices', who: r.id });
  if (w.state.notes.length === 0) return ok('The notice board is empty.');
  const lines = w.state.notes.map((n) => `- "${n.text}" (${w.resident(n.authorId).name})`);
  return ok(`Notes on the board:\n${lines.join('\n')}`);
}

export function pinNote(w: World, r: Resident, i: Intent): ActionResult {
  if (!w.isAt(r, 'notice-board')) return no("You'd have to be at the notice board to pin a note.");
  const text = textOf(i.text);
  if (!text) return no('You need to write something on the note first.');
  if (text.length > MAX_NOTE) return no("That won't fit on a note.");
  w.state.notes.push({ id: w.nextId(), authorId: r.id, text, t: w.t });
  if (w.state.notes.length > MAX_NOTES) w.state.notes.shift();
  w.emit({ type: 'note_pinned', who: r.id, text });
  return ok('You pin your note to the board.');
}
