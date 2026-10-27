/**
 * Houses, stalls and rent (docs/design/households.md, households-build.md):
 * Mr Lim the village head owns every house and stall; each household pays
 * him rent on his Monday round, into the village fund. A place is let or sold
 * for what someone offers and Mr Lim accepts (src/sim/mr-lim.ts); once bought,
 * it's never taken, and a rent-to-own already running finishes on its terms.
 * Rent unpaid for over a week, and the household is out, sleeping rough at the
 * jetty. A sitting tenant's rent changes only with a week's notice: they agree
 * to it at his door, or leave when it starts. A house a resident owns they may
 * sell or let to another (src/sim/place-deals.ts); a tenant of theirs pays them
 * at the same Monday round, on the same terms.
 */
import { dateAt, dateLabel, weekdayAt } from './calendar.ts';
import { PLACES, PLACE_BY_ID } from './map.ts';
import { formatMoney, type Cents } from './money.ts';
import { FUND_ID, type PlaceOffer, type Property, type Resident, type World, type WorldState } from './state.ts';
import { addDebt } from './actions/debts.ts';
import { dayIndex, minuteOfDay, SGT_OFFSET_MIN, MINUTES_PER_DAY } from './time.ts';

export const HOUSE_RENT: Cents = 50;
export const STALL_RENT: Cents = 100;
/** How Mr Lim weighs a price to buy against a rent: a year of it. */
export const BUY_WEEKS = 52;
/** Rent-to-own, no longer offered: a deal already running pays one and a half times the rent a week until it's paid. */
export const RENT_TO_OWN_RATE = 1.5;
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

/** Every house and stall with who holds it: a house's first resident (in the order the kampung knows them), a stall's shopkeeper; the rest free from today. */
export function startingProperty(state: Pick<WorldState, 'residents' | 'shops'>, today: number): Record<string, Property> {
  const out: Record<string, Property> = {};
  for (const p of PLACES) {
    if (p.kind !== 'house') continue;
    const holder = state.residents.find((r) => r.homeId === p.id)?.id ?? null;
    out[p.id] = { holder, rent: HOUSE_RENT, owned: false, rentToOwn: null, owing: 0, since: null, grace: null, freeSince: holder ? null : today, notice: null, landlord: null };
  }
  for (const s of state.shops) if (SHOP_IDS.includes(s.id)) out[s.id] = { holder: s.ownerId, rent: STALL_RENT, owned: false, rentToOwn: null, owing: 0, since: null, grace: null, freeSince: null, notice: null, landlord: null };
  return out;
}

/** "the house", or a stall's name. */
function placeLabel(id: string): string {
  return id.startsWith('house-') ? 'the house' : PLACE_BY_ID.get(id)?.name ?? id;
}

/** What an offer is for, as the one who made it thinks of it. */
export const placeWords = (o: Pick<PlaceOffer, 'placeId'>) => (o.placeId === null ? 'a house' : o.placeId.startsWith('house-') ? 'your house' : `your ${(PLACE_BY_ID.get(o.placeId)?.name ?? 'stall').replace(/^the /, '')}`);
/** "50¢ a week for a house", "$20.00 to buy your house". */
export const offerWords = (o: Pick<PlaceOffer, 'placeId' | 'kind' | 'cents'>) => (o.kind === 'rent' ? `${formatMoney(o.cents)} a week for ${placeWords(o)}` : `${formatMoney(o.cents)} to buy ${placeWords(o)}`);

/** What a week costs for a place: its rent, or the rent-to-own instalment. */
export function weekly(p: Property): Cents {
  return p.rentToOwn ? Math.round(p.rent * RENT_TO_OWN_RATE) : p.rent;
}

/** The places someone holds from Mr Lim and hasn't bought. */
export function heldBy(w: World, id: string): [string, Property][] {
  return Object.entries(w.state.property).filter(([, p]) => p.holder === id && !p.owned && !p.landlord);
}

/** Who a tenant pays: their landlord, or Mr Lim. */
export const landlordName = (w: World, p: Property) => (p.landlord ? w.nameOf(p.landlord) : 'Mr Lim');

/** Everyone whose home a house is. */
const household = (w: World, placeId: string) => w.state.residents.filter((r) => r.homeId === placeId);

function pay(w: World, r: Resident, placeId: string, p: Property, cents: Cents, why: string): Cents {
  const amount = Math.min(cents, r.money);
  if (amount > 0) {
    // A landlord's tenant pays the landlord; everyone else, the fund.
    w.transfer(r.id, p.landlord ?? FUND_ID, amount, why);
    if (!p.landlord) w.state.fund += amount;
    // Every cent paid while buying week by week counts towards it.
    if (p.rentToOwn) p.rentToOwn.paid += amount;
    w.emit(p.landlord ? { type: 'rent_paid', who: r.id, place: placeId, cents: amount, to: p.landlord } : { type: 'rent_paid', who: r.id, place: placeId, cents: amount });
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

/**
 * The tenancy ends: the household out for the rent owing, or a new rent never
 * agreed, or (moved) a place they've left for another. A landlord's house goes
 * back to its owner; Mr Lim's stands free.
 */
function evict(w: World, placeId: string, p: Property, why: 'owing' | 'new rent' | 'moved' = 'owing'): void {
  const by = landlordName(w, p);
  // What was owed stays owed, by the one who held it: to a landlord as a debt; to Mr Lim, no house again until it's paid.
  if (p.holder && p.owing > 0) {
    if (p.landlord) addDebt(w, p.holder, p.landlord, 'iou', p.owing, 'rent');
    else w.state.arrears[p.holder] = (w.state.arrears[p.holder] ?? 0) + p.owing;
  }
  for (const r of household(w, placeId)) {
    r.homeId = ROUGH;
    w.remember(r.id, why === 'owing'
      ? `${by} has ${p.landlord ? 'taken back' : 'let go'} ${placeLabel(placeId)} for the rent owing: it's no longer your home. You'll have to sleep where you can.`
      : `The new rent for ${placeLabel(placeId)} was never agreed, so you've had to leave it: it's no longer your home. You'll have to sleep where you can.`);
    const type = why === 'owing' ? 'evicted' as const : 'left_home' as const;
    w.emit(p.landlord ? { type, who: r.id, place: placeId, owner: p.landlord } : { type, who: r.id, place: placeId });
    w.state.evictedWith[r.id] = p.holder ?? r.id;
  }
  if (p.landlord && p.holder && why !== 'moved') w.notify(p.landlord, `${w.nameOf(p.holder)} is out of your house${why === 'owing' ? ', for the rent owing' : ': they never agreed the new rent'}. It's yours again.`);
  else if (p.landlord && p.holder) w.notify(p.landlord, `${w.nameOf(p.holder)} has moved out of your house. It's yours again.`);
  p.owing = 0;
  p.since = null;
  p.rentToOwn = null;
  p.notice = null;
  p.grace = null;
  if (p.landlord) {
    const owner = w.resident(p.landlord);
    Object.assign(p, { holder: owner.id, owned: true, landlord: null, freeSince: null });
    // An owner with no home of their own comes home to it, and their family with them.
    if (w.state.property[owner.homeId]?.holder !== owner.id) moveIn(w, owner, placeId, `${owner.name} has their house back: it's home again.`);
    return;
  }
  p.holder = null;
  p.freeSince = dayIndex(w.t);
}

/** The first Monday on or after a day: when Mr Lim comes round. */
export function mondayOnOrAfter(w: World, day: number): number {
  let d = day;
  while (weekdayAt(w.state, dayStart(d)) !== 'Monday') d++;
  return d;
}

/** "from Monday, 9 November, Year 1": the day a new rent starts. */
export const fromDay = (w: World, day: number) => `from ${dateLabel(dateAt(w.state, dayStart(day)))}`;

/** What a tenant knows of a new rent their landlord (Mr Lim, or a resident) has given notice of (`forId` the tenant, or someone living with them). */
export function noticeLine(w: World, placeId: string, p: Property, forId = p.holder!): string {
  const n = p.notice!;
  const mine = forId === p.holder;
  const name = w.nameOf(p.holder!);
  const by = landlordName(w, p);
  const what = `${by} has given ${mine ? 'you' : name} notice: ${fromDay(w, n.from)}, the rent for ${placeWords({ placeId })} ${n.rent < p.rent ? 'comes down' : 'goes up'} to ${formatMoney(n.rent)} a week.`;
  if (n.rent < p.rent) return what;
  if (n.agreed) return `${what} ${mine ? `You've told ${p.landlord ? by : 'him'} you'll pay it.` : `${name} has agreed to pay it.`}`;
  const where = p.landlord ? `with ${by}` : 'at his door';
  return `${what} ${mine ? `If you don't agree to it ${where} by then, you'll have to leave.` : `If ${name} doesn't agree to it ${where} by then, you'll all have to leave.`}`;
}

/** New rents whose Monday has come, at that Monday's round (before it's charged): agreed, or the household leaves. */
function startNewRents(w: World, monday: number): void {
  for (const [id, p] of Object.entries(w.state.property)) {
    if (!p.notice || p.notice.from > monday) continue;
    if (p.notice.agreed) {
      p.rent = p.notice.rent;
      p.notice = null;
    } else evict(w, id, p, 'new rent');
  }
}

/** A quiet spell (downtime) that swallowed part of a notice week: the tenant gets that time back, in whole weeks, to agree in. */
export function quietNotices(w: World, from: number, to: number): void {
  for (const p of Object.values(w.state.property)) {
    if (!p.notice || p.notice.agreed) continue;
    const lost = Math.min(to, dayStart(p.notice.from) + ROUND_MINUTE) - Math.max(from, dayStart(p.notice.from - 7));
    if (lost >= MINUTES_PER_DAY) p.notice.from += 7 * Math.ceil(lost / (7 * MINUTES_PER_DAY));
  }
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
    // Unless Mr Lim has given them a week's grace (hardship help).
    const graced = p.grace !== null && today <= p.grace.until;
    if (id.startsWith('house-') && oldLeft > 0 && oldSince !== null && today - oldSince >= GRACE_DAYS && !graced) {
      // Only the old debt follows them, not this week's rent on a house they're leaving.
      p.owing = oldLeft;
      evict(w, id, p);
      continue;
    }
    // The old debt paid off, what's left is this week's: its grace starts today.
    p.since = short === 0 ? null : oldLeft === 0 ? today : oldSince;
    if (ownIfPaid(w, r, id, p)) continue;
    if (short > 0) w.emit(p.landlord ? { type: 'rent_owed', who: r.id, place: id, cents: short, to: p.landlord } : { type: 'rent_owed', who: r.id, place: id, cents: short });
    const by = landlordName(w, p);
    w.remember(r.id, short === 0
      ? `${by} comes round for the rent: you pay ${formatMoney(paid)} for ${placeLabel(id)}.`
      : `${by} comes round for the rent. You can't pay it all: you owe ${by} ${formatMoney(short)} for ${placeLabel(id)}.`);
    if (p.landlord) w.remember(p.landlord, `${r.name} pays you ${formatMoney(paid)} in rent for your house${short > 0 ? `, and owes you ${formatMoney(short)}` : ''}.`);
  }
  // His loans: a little back each round, into the fund, as they can.
  for (const loan of w.state.loans) {
    const r = w.state.residents.find((x) => x.id === loan.who);
    const amount = r ? Math.min(loan.owed, loan.weekly, r.money) : 0;
    if (!r || amount <= 0) continue;
    w.transfer(r.id, FUND_ID, amount, "paying back Mr Lim's loan");
    w.state.fund += amount;
    loan.owed -= amount;
    w.remember(r.id, `You pay Mr Lim back ${formatMoney(amount)} of his loan.${loan.owed > 0 ? ` You still owe ${formatMoney(loan.owed)}.` : ' It is paid off.'}`);
  }
  w.state.loans = w.state.loans.filter((l) => l.owed > 0);
}


/** Each minute: the notice of rent (once), new rents as they start, and Mr Lim's Monday round. */
export function householdsMinute(w: World): void {
  const mod = minuteOfDay(w.t);
  // Word of the rent goes round from eight, before it starts: each holder hears it once, awake, of all they hold.
  if (!w.state.rentNoticed && mod >= 8 * 60 && dayIndex(w.t) < w.state.rentFrom) {
    const when = dateLabel(dateAt(w.state, dayStart(w.state.rentFrom)));
    const held = new Map<string, string[]>();
    for (const [id, p] of Object.entries(w.state.property)) {
      if (p.holder && !p.owned && !p.landlord) held.set(p.holder, [...(held.get(p.holder) ?? []), `${formatMoney(p.rent)} a week for ${placeLabel(id)}`]);
    }
    for (const [holder, rents] of held) {
      if (w.state.rentToldTo.includes(holder) || w.isAsleep(w.resident(holder))) continue;
      w.state.rentToldTo.push(holder);
      w.remember(holder, `Mr Lim, the village head, has let it be known: from ${when}, rent is due each Monday. ${rents.join(', and ')}.`);
    }
    w.state.rentNoticed = [...held.keys()].every((h) => w.state.rentToldTo.includes(h));
  }
  // Every Monday round due since the last (one missed while the kampung was away is caught up).
  const today = dayIndex(w.t);
  // The kampung's first day was a Monday: the latest Monday is a whole number of weeks on from it.
  let monday = today - ((((today - w.state.calendar.firstDay) % 7) + 7) % 7);
  if (monday === today && mod < ROUND_MINUTE) monday -= 7;
  if (monday < w.state.rentFrom || monday <= w.state.lastRoundDay) return;
  w.state.lastRoundDay = monday;
  startNewRents(w, monday);
  rentRound(w);
}

/** What someone sees at the village head's house, and anywhere while they owe. */
export function householdLines(w: World, r: Resident, atHead: boolean): string[] {
  const out: string[] = [];
  const loan = w.state.loans.find((l) => l.who === r.id);
  if (loan) out.push(`You owe Mr Lim ${formatMoney(loan.owed)} on his loan.`);
  const owing = heldBy(w, r.id).reduce((n, [, p]) => n + p.owing, 0) + (w.state.arrears[r.id] ?? 0);
  if (owing > 0) out.push(`You owe Mr Lim ${formatMoney(owing)} in rent.`);
  for (const [id, p] of heldBy(w, r.id)) if (p.notice) out.push(noticeLine(w, id, p));
  const home = w.state.property[r.homeId];
  if (home?.notice && home.holder !== null && home.holder !== r.id) out.push(noticeLine(w, r.homeId, home, r.id));
  // Houses let between residents: as tenant, and as landlord.
  for (const [id, p] of Object.entries(w.state.property).filter(([, p]) => p.landlord && p.holder === r.id)) {
    const by = w.nameOf(p.landlord!);
    out.push(`You rent ${placeWords({ placeId: id })} from ${by} for ${formatMoney(p.rent)} a week${p.owing > 0 ? `, and owe ${by} ${formatMoney(p.owing)}` : ''}.`);
    if (p.notice) out.push(noticeLine(w, id, p));
  }
  for (const [id, p] of Object.entries(w.state.property).filter(([, p]) => p.landlord === r.id && p.holder)) {
    const t = w.nameOf(p.holder!);
    out.push(`You let ${placeWords({ placeId: id })} to ${t} for ${formatMoney(p.rent)} a week${p.owing > 0 ? `; ${t} owes you ${formatMoney(p.owing)}` : ''}.`);
    if (p.notice) out.push(`You've given ${t} notice of a new rent, ${formatMoney(p.notice.rent)} a week ${fromDay(w, p.notice.from)}${p.notice.agreed ? `, and ${t} has agreed to it` : ''}.`);
  }
  const offered = w.state.placeOffers.find((o) => o.who === r.id);
  if (offered) out.push(`You've offered Mr Lim ${offerWords(offered)}; he gives his answers in the evening.`);
  if (!atHead) return out;
  out.push("This is Mr Lim's house. Mr Lim is the village head; the houses and stalls are Mr Lim's to let.");
  const arrears = w.state.arrears[r.id] ?? 0;
  if (arrears > 0) out.push(`You still owe Mr Lim ${formatMoney(arrears)} from the house you lost.`);
  for (const [id, p] of Object.entries(w.state.property).filter(([, p]) => p.holder === r.id && !p.landlord)) {
    if (p.owned) out.push(`${cap(placeLabel(id))} is yours: you own it.`);
    else if (p.rentToOwn) out.push(`You're buying ${placeLabel(id)} week by week: ${formatMoney(p.rentToOwn.paid)} of ${formatMoney(p.rentToOwn.of)} paid, ${formatMoney(weekly(p))} a week.`);
    else out.push(`You rent ${placeLabel(id)} for ${formatMoney(p.rent)} a week.`);
  }
  const free = Object.entries(w.state.property).filter(([id, p]) => id.startsWith('house-') && p.holder === null);
  if (free.length) out.push(`${free.length === 1 ? 'A house stands free' : `${free.length} houses stand free`}: Mr Lim takes offers, a rent a week or a price to buy.`);
  if (dayIndex(w.t) < w.state.rentFrom) out.push(`Rent is due each Monday from ${dateLabel(dateAt(w.state, dayStart(w.state.rentFrom)))}.`);
  return out;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Words that mean a stall, not a house. */
export const STALL_WORDS = /stall|shop|kopitiam|market/;

/** Which of their places they mean: a house by default, a stall if they say so. */
export function placeMeant(w: World, r: Resident, item: unknown): [string, Property] | null {
  const held = Object.entries(w.state.property).filter(([, p]) => p.holder === r.id && !p.landlord);
  const s = typeof item === 'string' ? item.toLowerCase() : '';
  const stall = STALL_WORDS.test(s);
  return held.find(([id]) => (stall ? !id.startsWith('house-') : id.startsWith('house-'))) ?? null;
}

export function payRent(w: World, r: Resident, money: Cents | null): { ok: boolean; reply: string } {
  if (!w.isAt(r, 'village-head')) return { ok: false, reply: "You pay rent at the village head's house." };
  const owed = heldBy(w, r.id).filter(([, p]) => p.owing > 0);
  const arrears = w.state.arrears[r.id] ?? 0;
  const loan = w.state.loans.find((l) => l.who === r.id);
  const total = owed.reduce((n, [, p]) => n + p.owing, 0) + arrears + (loan?.owed ?? 0);
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
  // Then his loan, early, if they've money over.
  if (loan && left > 0) {
    const amount = Math.min(left, loan.owed);
    w.transfer(r.id, FUND_ID, amount, "paying back Mr Lim's loan");
    w.state.fund += amount;
    loan.owed -= amount;
    if (loan.owed === 0) w.state.loans = w.state.loans.filter((l) => l !== loan);
    left -= amount;
    paid += amount;
  }
  const still = total - paid;
  return { ok: true, reply: `You pay Mr Lim ${formatMoney(paid)}.${still > 0 ? ` You still owe Mr Lim ${formatMoney(still)}.` : ' You owe Mr Lim nothing now.'}` };
}

/** Mr Lim lets or sells a place on an offer he's taken: the first week's rent, or the price, paid into the fund now; a new house is home to the household. Who moved in. */
export function letTo(w: World, r: Resident, placeId: string, kind: 'rent' | 'buy', cents: Cents): string[] {
  const p = w.state.property[placeId]!;
  const moving = p.holder !== r.id;
  if (cents > 0) {
    w.transfer(r.id, FUND_ID, cents, kind === 'buy' ? `bought ${placeLabel(placeId)}` : `a week's rent for ${placeLabel(placeId)}, up front`);
    w.state.fund += cents;
  }
  w.emit(kind === 'buy' ? { type: 'bought_place', who: r.id, place: placeId, cents } : { type: 'rent_paid', who: r.id, place: placeId, cents });
  Object.assign(p, { holder: r.id, owned: kind === 'buy', rentToOwn: null, owing: 0, since: null, grace: null, freeSince: null, notice: null, landlord: null });
  if (kind === 'rent') p.rent = cents;
  if (!moving || !placeId.startsWith('house-')) return [];
  return moveIn(w, r, placeId, `${r.name} has a house from Mr Lim: it's home now.`);
}

/**
 * r's household makes a house home: whoever was turned out with them (from the
 * same house), and everyone living in a house r holds. A house r rented and
 * leaves empty goes back (to Mr Lim, or its owner). Who moved.
 */
export function moveIn(w: World, r: Resident, placeId: string, heard: string): string[] {
  const old = r.homeId;
  const oldPlace = old !== placeId ? w.state.property[old] : undefined;
  const theirs = oldPlace?.holder === r.id;
  const group = w.state.evictedWith[r.id] ?? r.id;
  const family = w.state.residents.filter((o) => o.id === r.id || (theirs && o.homeId === old)
    || (o.homeId === ROUGH && (w.state.evictedWith[o.id] === group || w.state.evictedWith[o.id] === r.id)));
  for (const o of family) {
    o.homeId = placeId;
    delete w.state.evictedWith[o.id];
    w.learnPlace(o, placeId);
    if (o.id !== r.id) w.remember(o.id, heard);
    w.emit({ type: 'moved_in', who: o.id, place: placeId });
  }
  if (theirs && !oldPlace.owned && household(w, old).length === 0) {
    const by = landlordName(w, oldPlace);
    const owing = oldPlace.owing;
    evict(w, old, oldPlace, 'moved');
    w.remember(r.id, `You give ${placeLabel(old)} you rented back to ${by}${owing > 0 ? `, still owing ${by} ${formatMoney(owing)}` : ''}.`);
  }
  return family.map((o) => o.id);
}

/** Everyone living in a house its owner has sold or let moves out: to another house the owner holds, or to sleep rough together. */
export function moveOut(w: World, placeId: string, ownerId: string, why: string): void {
  const other = Object.entries(w.state.property).find(([id, p]) => id !== placeId && id.startsWith('house-') && p.holder === ownerId)?.[0] ?? null;
  for (const o of household(w, placeId)) {
    o.homeId = other ?? ROUGH;
    if (other) w.learnPlace(o, other);
    else w.state.evictedWith[o.id] = ownerId;
    w.remember(o.id, `${cap(placeLabel(placeId))} ${why}: it's no longer your home. ${other ? `Home is ${w.nameOf(ownerId) === o.name ? 'your' : `${w.nameOf(ownerId)}'s`} other house now.` : "You'll have to sleep where you can."}`);
    w.emit({ type: 'moved_out', who: o.id, place: placeId });
  }
}
