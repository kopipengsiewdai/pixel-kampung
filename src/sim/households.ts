/**
 * Houses, stalls and rent (docs/design/households.md, households-build.md):
 * Mr Lim the village head owns every house and stall; each household pays
 * him rent on his Monday round, into the village fund. A place can be bought
 * outright or rent-to-own, and then it's never taken. Rent unpaid for over a
 * week, and the household is out, sleeping rough at the jetty. Scripted and
 * free: Mr Lim's thinking head comes later.
 */
import { dateAt, dateLabel, weekdayAt } from './calendar.ts';
import { PLACES, PLACE_BY_ID } from './map.ts';
import { formatMoney, type Cents } from './money.ts';
import { FUND_ID, type Property, type Resident, type World, type WorldState } from './state.ts';
import { dayIndex, minuteOfDay, SGT_OFFSET_MIN, MINUTES_PER_DAY } from './time.ts';

export const HOUSE_RENT: Cents = 50;
export const STALL_RENT: Cents = 100;
/** Buying outright costs a year's rent. */
export const BUY_WEEKS = 52;
/** Rent-to-own: one and a half times the rent a week, theirs after this many weeks (about a quarter more than buying outright). */
export const RENT_TO_OWN_RATE = 1.5;
export const RENT_TO_OWN_WEEKS = 44;
/** Rent owing longer than this after the Monday it was missed, and the household is out. */
export const GRACE_DAYS = 7;
/** The first rent is due at least this many days after households begin. */
export const NOTICE_DAYS = 28;
/** Mr Lim's round: Mondays at nine. */
export const ROUND_MINUTE = 9 * 60;
/** Where someone with no home sleeps. */
export const ROUGH = 'rough';
export const ROUGH_PLACE = 'jetty';

const SHOP_IDS = ['kopitiam', 'provision-shop', 'market-stall'];

/** The first minute of a day (by the kampung's own clock). */
const dayStart = (day: number) => day * MINUTES_PER_DAY - SGT_OFFSET_MIN;

/** The first Monday at least NOTICE_DAYS after day. */
export function firstRentDay(w: { calendar: WorldState['calendar'] }, day: number): number {
  let d = day + NOTICE_DAYS;
  while (weekdayAt(w, dayStart(d)) !== 'Monday') d++;
  return d;
}

/** Every house and stall with who holds it: a house's first resident (in the order the kampung knows them), a stall's shopkeeper. */
export function startingProperty(state: Pick<WorldState, 'residents' | 'shops'>): Record<string, Property> {
  const out: Record<string, Property> = {};
  for (const p of PLACES) {
    if (p.kind !== 'house') continue;
    out[p.id] = { holder: state.residents.find((r) => r.homeId === p.id)?.id ?? null, rent: HOUSE_RENT, owned: false, rentToOwn: null, owing: 0, since: null };
  }
  for (const s of state.shops) if (SHOP_IDS.includes(s.id)) out[s.id] = { holder: s.ownerId, rent: STALL_RENT, owned: false, rentToOwn: null, owing: 0, since: null };
  return out;
}

/** "the house", or a stall's name. */
function placeLabel(id: string): string {
  return id.startsWith('house-') ? 'the house' : PLACE_BY_ID.get(id)?.name ?? id;
}

/** Rent-to-own, in cents: what's been paid towards it, and what makes it theirs. */
export const rentToOwnPrice = (rent: Cents) => Math.round(rent * RENT_TO_OWN_RATE) * RENT_TO_OWN_WEEKS;

/** What a week costs for a place: its rent, or the rent-to-own instalment. */
export function weekly(p: Property): Cents {
  return p.rentToOwn ? Math.round(p.rent * RENT_TO_OWN_RATE) : p.rent;
}

/** The places someone holds and hasn't bought. */
export function heldBy(w: World, id: string): [string, Property][] {
  return Object.entries(w.state.property).filter(([, p]) => p.holder === id && !p.owned);
}

/** Everyone whose home a house is. */
const household = (w: World, placeId: string) => w.state.residents.filter((r) => r.homeId === placeId);

function pay(w: World, r: Resident, placeId: string, p: Property, cents: Cents, why: string): Cents {
  const amount = Math.min(cents, r.money);
  if (amount > 0) {
    w.transfer(r.id, FUND_ID, amount, why);
    w.state.fund += amount;
    // Every cent paid while buying week by week counts towards it.
    if (p.rentToOwn) p.rentToOwn.paid += amount;
    w.emit({ type: 'rent_paid', who: r.id, place: placeId, cents: amount });
  }
  return amount;
}

/** Bought week by week, once it's all paid and nothing is owing. */
function ownIfPaid(w: World, r: Resident, id: string, p: Property): boolean {
  if (!p.rentToOwn || p.rentToOwn.paid < p.rentToOwn.of || p.owing > 0) return false;
  p.owned = true;
  p.rentToOwn = null;
  w.remember(r.id, `That was the last of it: ${placeLabel(id)} is yours now.`);
  return true;
}

function evict(w: World, placeId: string, p: Property): void {
  // What was owed stays owed, by the one who held it: no house again until it's paid.
  if (p.holder && p.owing > 0) w.state.arrears[p.holder] = (w.state.arrears[p.holder] ?? 0) + p.owing;
  for (const r of household(w, placeId)) {
    r.homeId = ROUGH;
    w.remember(r.id, `Mr Lim has let ${placeLabel(placeId)} go for the rent owing: it's no longer your home. You'll have to sleep where you can.`);
    w.emit({ type: 'evicted', who: r.id, place: placeId });
    w.state.evictedWith[r.id] = p.holder ?? r.id;
  }
  p.holder = null;
  p.owing = 0;
  p.since = null;
  p.rentToOwn = null;
}

/** Mr Lim's Monday round: rent from every holder, or owed; a house owing over a week, and the household is out. */
export function rentRound(w: World): void {
  const today = dayIndex(w.t);
  if (today < w.state.rentFrom) return;
  for (const [id, p] of Object.entries(w.state.property)) {
    if (!p.holder || p.owned) continue;
    const r = w.resident(p.holder);
    const due = weekly(p);
    const before = p.owing;
    const oldSince = p.since;
    // The round is the time to pay: the oldest owed first, then this week's.
    const paid = pay(w, r, id, p, p.owing + due, `rent for ${placeLabel(id)}`);
    const short = p.owing + due - paid;
    p.owing = short;
    const oldLeft = Math.max(0, before - paid);
    // A house still owing from a Monday a week or more ago: the household is out (a stall is let go later, by Mr Lim himself).
    if (id.startsWith('house-') && oldLeft > 0 && oldSince !== null && today - oldSince >= GRACE_DAYS) {
      // Only the old debt follows them, not this week's rent on a house they're leaving.
      p.owing = oldLeft;
      evict(w, id, p);
      continue;
    }
    // The old debt paid off, what's left is this week's: its grace starts today.
    p.since = short === 0 ? null : oldLeft === 0 ? today : oldSince;
    if (ownIfPaid(w, r, id, p)) continue;
    if (short > 0) w.emit({ type: 'rent_owed', who: r.id, place: id, cents: short });
    w.remember(r.id, short === 0
      ? `Mr Lim comes round for the rent: you pay ${formatMoney(paid)} for ${placeLabel(id)}.`
      : `Mr Lim comes round for the rent. You can't pay it all: you owe Mr Lim ${formatMoney(short)} for ${placeLabel(id)}.`);
  }
}

/** Each minute: the notice of rent (once), and Mr Lim's Monday round. */
export function householdsMinute(w: World): void {
  const mod = minuteOfDay(w.t);
  if (!w.state.rentNoticed && mod >= 8 * 60) {
    w.state.rentNoticed = true;
    const when = dateLabel(dateAt(w.state, dayStart(w.state.rentFrom)));
    for (const [id, p] of Object.entries(w.state.property)) {
      if (!p.holder || p.owned) continue;
      w.remember(p.holder, `Mr Lim, the village head, has let it be known: from ${when}, rent is due each Monday. ${formatMoney(p.rent)} a week for ${placeLabel(id)}.`);
    }
  }
  // Every Monday round due since the last (one missed while the kampung was away is caught up).
  const today = dayIndex(w.t);
  // The kampung's first day was a Monday: the latest Monday is a whole number of weeks on from it.
  let monday = today - ((((today - w.state.calendar.firstDay) % 7) + 7) % 7);
  if (monday === today && mod < ROUND_MINUTE) monday -= 7;
  if (monday < w.state.rentFrom || monday <= w.state.lastRoundDay) return;
  w.state.lastRoundDay = monday;
  rentRound(w);
}

/** What someone sees at the village head's house, and anywhere while they owe. */
export function householdLines(w: World, r: Resident, atHead: boolean): string[] {
  const out: string[] = [];
  const owing = heldBy(w, r.id).reduce((n, [, p]) => n + p.owing, 0) + (w.state.arrears[r.id] ?? 0);
  if (owing > 0) out.push(`You owe Mr Lim ${formatMoney(owing)} in rent.`);
  if (!atHead) return out;
  out.push("This is Mr Lim's house. Mr Lim is the village head; the houses and stalls are Mr Lim's to let.");
  const arrears = w.state.arrears[r.id] ?? 0;
  if (arrears > 0) out.push(`You still owe Mr Lim ${formatMoney(arrears)} from the house you lost.`);
  for (const [id, p] of Object.entries(w.state.property).filter(([, p]) => p.holder === r.id)) {
    if (p.owned) out.push(`${cap(placeLabel(id))} is yours: you own it.`);
    else if (p.rentToOwn) out.push(`You're buying ${placeLabel(id)} week by week: ${formatMoney(p.rentToOwn.paid)} of ${formatMoney(p.rentToOwn.of)} paid, ${formatMoney(weekly(p))} a week.`);
    else out.push(`You rent ${placeLabel(id)} for ${formatMoney(p.rent)} a week. To buy it outright: ${formatMoney(p.rent * BUY_WEEKS)}.`);
  }
  const free = Object.entries(w.state.property).filter(([id, p]) => id.startsWith('house-') && p.holder === null);
  if (free.length) out.push(`${free.length === 1 ? 'A house stands free' : `${free.length} houses stand free`}, to rent at ${formatMoney(HOUSE_RENT)} a week.`);
  if (dayIndex(w.t) < w.state.rentFrom) out.push(`Rent is due each Monday from ${dateLabel(dateAt(w.state, dayStart(w.state.rentFrom)))}.`);
  return out;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Which of their places they mean: a house by default, a stall if they say so. */
function placeMeant(w: World, r: Resident, item: unknown): [string, Property] | null {
  const held = Object.entries(w.state.property).filter(([, p]) => p.holder === r.id);
  const s = typeof item === 'string' ? item.toLowerCase() : '';
  const stall = /stall|shop|kopitiam/.test(s);
  return held.find(([id]) => (stall ? !id.startsWith('house-') : id.startsWith('house-'))) ?? null;
}

export function payRent(w: World, r: Resident, money: Cents | null): { ok: boolean; reply: string } {
  if (!w.isAt(r, 'village-head')) return { ok: false, reply: "You pay rent at the village head's house." };
  const owed = heldBy(w, r.id).filter(([, p]) => p.owing > 0);
  const arrears = w.state.arrears[r.id] ?? 0;
  const total = owed.reduce((n, [, p]) => n + p.owing, 0) + arrears;
  if (total === 0) return { ok: false, reply: "You don't owe Mr Lim anything." };
  if (r.money === 0) return { ok: false, reply: `You owe Mr Lim ${formatMoney(total)}, and you haven't the money.` };
  let left = Math.min(money ?? total, total, r.money);
  let paid = 0;
  // An old debt from a house lost comes first.
  if (arrears > 0 && left > 0) {
    const amount = Math.min(left, arrears);
    w.transfer(r.id, FUND_ID, amount, 'rent owing for a house lost');
    w.state.fund += amount;
    w.emit({ type: 'rent_paid', who: r.id, place: 'arrears', cents: amount });
    w.state.arrears[r.id] = arrears - amount;
    if (w.state.arrears[r.id] === 0) delete w.state.arrears[r.id];
    left -= amount;
    paid += amount;
  }
  for (const [id, p] of owed) {
    const amount = Math.min(left, p.owing);
    if (amount <= 0) break;
    pay(w, r, id, p, amount, `rent owing for ${placeLabel(id)}`);
    p.owing -= amount;
    if (p.owing === 0) p.since = null;
    left -= amount;
    paid += amount;
    ownIfPaid(w, r, id, p);
  }
  const still = total - paid;
  return { ok: true, reply: `You pay Mr Lim ${formatMoney(paid)}.${still > 0 ? ` You still owe Mr Lim ${formatMoney(still)}.` : ' You owe Mr Lim nothing now.'}` };
}

export function buyPlace(w: World, r: Resident, item: unknown): { ok: boolean; reply: string } {
  if (!w.isAt(r, 'village-head')) return { ok: false, reply: "You'd have to see Mr Lim at the village head's house about that." };
  const held = placeMeant(w, r, item);
  if (!held) return { ok: false, reply: "You don't rent anything like that from Mr Lim." };
  const [id, p] = held;
  if (p.owned) return { ok: false, reply: `${cap(placeLabel(id))} is already yours.` };
  // What was paid week by week counts towards it.
  const price = Math.max(0, p.rent * BUY_WEEKS - (p.rentToOwn?.paid ?? 0)) + p.owing;
  if (r.money < price) return { ok: false, reply: `Mr Lim wants ${formatMoney(price)} for ${placeLabel(id)}${p.owing ? ', with what you owe' : ''}. You haven't that much.` };
  w.transfer(r.id, FUND_ID, price, `bought ${placeLabel(id)}`);
  w.state.fund += price;
  p.owned = true;
  p.owing = 0;
  p.since = null;
  p.rentToOwn = null;
  w.emit({ type: 'bought_place', who: r.id, place: id, cents: price });
  return { ok: true, reply: `You pay Mr Lim ${formatMoney(price)}. ${cap(placeLabel(id))} is yours now, and nobody can take it.` };
}

export function rentToOwn(w: World, r: Resident, item: unknown): { ok: boolean; reply: string } {
  if (!w.isAt(r, 'village-head')) return { ok: false, reply: "You'd have to see Mr Lim at the village head's house about that." };
  const held = placeMeant(w, r, item);
  if (!held) return { ok: false, reply: "You don't rent anything like that from Mr Lim." };
  const [id, p] = held;
  if (p.owned) return { ok: false, reply: `${cap(placeLabel(id))} is already yours.` };
  if (p.rentToOwn) return { ok: false, reply: `You're already buying ${placeLabel(id)} week by week.` };
  p.rentToOwn = { paid: 0, of: rentToOwnPrice(p.rent) };
  return { ok: true, reply: `Mr Lim agrees: ${formatMoney(weekly(p))} a week instead of ${formatMoney(p.rent)}, and after ${RENT_TO_OWN_WEEKS} weeks ${placeLabel(id)} is yours.` };
}

export function rentHouse(w: World, r: Resident): { ok: boolean; reply: string } {
  if (!w.isAt(r, 'village-head')) return { ok: false, reply: "You'd have to see Mr Lim at the village head's house about that." };
  // A house of your own is one you live in and hold (living with family, or sleeping rough, you can take one).
  if (w.state.property[r.homeId]?.holder === r.id) return { ok: false, reply: 'You already have a house of your own.' };
  const arrears = w.state.arrears[r.id] ?? 0;
  if (arrears > 0) return { ok: false, reply: `Mr Lim won't let you a house while you still owe Mr Lim ${formatMoney(arrears)}.` };
  const free = Object.entries(w.state.property).find(([id, p]) => id.startsWith('house-') && p.holder === null);
  if (!free) return { ok: false, reply: 'Mr Lim has no house free just now.' };
  const [id, p] = free;
  if (r.money < p.rent) return { ok: false, reply: `Mr Lim wants a week's rent, ${formatMoney(p.rent)}, before letting you a house.` };
  w.transfer(r.id, FUND_ID, p.rent, 'a week\'s rent for a house, up front');
  w.state.fund += p.rent;
  p.holder = r.id;
  p.owing = 0;
  p.since = null;
  p.rentToOwn = null;
  // Whoever was turned out with them comes home too.
  const family = w.state.residents.filter((o) => o.id === r.id || (o.homeId === ROUGH && w.state.evictedWith[o.id] === r.id));
  for (const o of family) {
    o.homeId = id;
    delete w.state.evictedWith[o.id];
    w.learnPlace(o, id);
    if (o.id !== r.id) w.remember(o.id, `${r.name} has a house from Mr Lim: it's home now.`);
    w.emit({ type: 'moved_in', who: o.id, place: id });
  }
  return { ok: true, reply: `You pay Mr Lim a week's rent, ${formatMoney(p.rent)}, and Mr Lim lets you a house. It's your home now.` };
}
