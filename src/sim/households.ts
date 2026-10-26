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
    w.emit({ type: 'rent_paid', who: r.id, place: placeId, cents: amount });
  }
  return amount;
}

function evict(w: World, placeId: string, p: Property): void {
  for (const r of household(w, placeId)) {
    r.homeId = ROUGH;
    w.remember(r.id, `Mr Lim has let ${placeLabel(placeId)} go for the rent owing: it's no longer your home. You'll have to sleep where you can.`);
    w.emit({ type: 'evicted', who: r.id, place: placeId });
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
    // A house: out, if what was owed has gone unpaid past the grace week (a stall is let go later, by Mr Lim himself).
    if (id.startsWith('house-') && p.owing > 0 && p.since !== null && today - p.since > GRACE_DAYS) {
      evict(w, id, p);
      continue;
    }
    const r = w.resident(p.holder);
    const due = weekly(p);
    const paid = pay(w, r, id, p, p.owing + due, `rent for ${placeLabel(id)}`);
    const short = p.owing + due - paid;
    if (p.rentToOwn && short <= p.owing) p.rentToOwn.paid += 1;
    p.owing = short;
    p.since = short > 0 ? (p.since ?? today) : null;
    if (p.rentToOwn && p.rentToOwn.paid >= p.rentToOwn.of && p.owing === 0) {
      p.owned = true;
      p.rentToOwn = null;
      w.remember(r.id, `That was the last of it: ${placeLabel(id)} is yours now.`);
      continue;
    }
    if (short > 0) w.emit({ type: 'rent_owed', who: r.id, place: id, cents: short });
    w.remember(r.id, short === 0
      ? `Mr Lim comes round for the rent: you pay ${formatMoney(paid)} for ${placeLabel(id)}.`
      : `Mr Lim comes round for the rent. You can't pay it all: you owe him ${formatMoney(short)} for ${placeLabel(id)}.`);
  }
}

/** Each minute: the notice of rent (once), and Mr Lim's Monday round. */
export function householdsMinute(w: World): void {
  const mod = minuteOfDay(w.t);
  if (!w.state.rentNoticed && mod === 8 * 60) {
    w.state.rentNoticed = true;
    const when = dateLabel(dateAt(w.state, dayStart(w.state.rentFrom)));
    for (const [id, p] of Object.entries(w.state.property)) {
      if (!p.holder || p.owned) continue;
      w.notify(p.holder, `Mr Lim, the village head, has let it be known: from ${when}, rent is due each Monday. ${formatMoney(p.rent)} a week for ${placeLabel(id)}.`);
    }
  }
  if (mod === ROUND_MINUTE && weekdayAt(w.state, w.t) === 'Monday') rentRound(w);
}

/** What someone sees at the village head's house, and anywhere while they owe. */
export function householdLines(w: World, r: Resident, atHead: boolean): string[] {
  const out: string[] = [];
  const owing = heldBy(w, r.id).reduce((n, [, p]) => n + p.owing, 0);
  if (owing > 0) out.push(`You owe Mr Lim ${formatMoney(owing)} in rent.`);
  if (!atHead) return out;
  out.push("This is Mr Lim's house. He's the village head; the houses and stalls are his to let.");
  for (const [id, p] of Object.entries(w.state.property).filter(([, p]) => p.holder === r.id)) {
    if (p.owned) out.push(`${cap(placeLabel(id))} is yours: you own it.`);
    else if (p.rentToOwn) out.push(`You're buying ${placeLabel(id)} week by week: ${p.rentToOwn.paid} of ${p.rentToOwn.of} weeks paid, ${formatMoney(weekly(p))} a week.`);
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
  const total = owed.reduce((n, [, p]) => n + p.owing, 0);
  if (total === 0) return { ok: false, reply: "You don't owe Mr Lim anything." };
  let left = Math.min(money ?? total, total, r.money);
  if (left <= 0) return { ok: false, reply: `You owe Mr Lim ${formatMoney(total)}, and you haven't the money.` };
  let paid = 0;
  for (const [id, p] of owed) {
    const amount = Math.min(left, p.owing);
    if (amount <= 0) break;
    pay(w, r, id, p, amount, `rent owing for ${placeLabel(id)}`);
    p.owing -= amount;
    if (p.owing === 0) p.since = null;
    left -= amount;
    paid += amount;
  }
  const still = total - paid;
  return { ok: true, reply: `You pay Mr Lim ${formatMoney(paid)}.${still > 0 ? ` You still owe him ${formatMoney(still)}.` : ' You owe him nothing now.'}` };
}

export function buyPlace(w: World, r: Resident, item: unknown): { ok: boolean; reply: string } {
  if (!w.isAt(r, 'village-head')) return { ok: false, reply: "You'd have to see Mr Lim at the village head's house about that." };
  const held = placeMeant(w, r, item);
  if (!held) return { ok: false, reply: "You don't rent anything like that from Mr Lim." };
  const [id, p] = held;
  if (p.owned) return { ok: false, reply: `${cap(placeLabel(id))} is already yours.` };
  const price = p.rent * BUY_WEEKS + p.owing;
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
  p.rentToOwn = { paid: 0, of: RENT_TO_OWN_WEEKS };
  return { ok: true, reply: `Mr Lim agrees: ${formatMoney(weekly(p))} a week instead of ${formatMoney(p.rent)}, and after ${RENT_TO_OWN_WEEKS} weeks ${placeLabel(id)} is yours.` };
}

export function rentHouse(w: World, r: Resident): { ok: boolean; reply: string } {
  if (!w.isAt(r, 'village-head')) return { ok: false, reply: "You'd have to see Mr Lim at the village head's house about that." };
  // A house of your own is one you live in and hold (living with family, or sleeping rough, you can take one).
  if (w.state.property[r.homeId]?.holder === r.id) return { ok: false, reply: 'You already have a house of your own.' };
  const free = Object.entries(w.state.property).find(([id, p]) => id.startsWith('house-') && p.holder === null);
  if (!free) return { ok: false, reply: 'Mr Lim has no house free just now.' };
  const [id, p] = free;
  p.holder = r.id;
  p.owing = 0;
  p.since = null;
  p.rentToOwn = null;
  r.homeId = id;
  w.learnPlace(r, id);
  w.emit({ type: 'moved_in', who: r.id, place: id });
  return { ok: true, reply: `Mr Lim lets you a house for ${formatMoney(p.rent)} a week, from Monday's round. It's your home now.` };
}
