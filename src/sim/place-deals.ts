/**
 * Houses between residents (households-build.md "Housing market" item 4): a
 * house someone owns they may sell, or let, to another at any price the two
 * agree, offered and agreed in person like a trade. A sale moves the buyer's
 * household in and the seller's out; a house sold while it's let keeps its
 * sitting tenant, the buyer their landlord on the same rent. A tenant pays
 * their landlord at Mr Lim's Monday round, and a landlord changes the rent as
 * Mr Lim does: a week's notice, agreed, or the tenant leaves when it starts.
 * Only houses as yet: a stall changes hands with its shop later.
 */
import { formatMoney, type Cents } from './money.ts';
import { GROWN_AGE, type PlaceDeal, type Property, type Resident, type World } from './state.ts';
import { type ActionResult, type Intent, moneyOf, no, ok, personNearby } from './actions/common.ts';
import { addDebt } from './actions/debts.ts';
import { TRADE_OFFER_MINUTES } from './actions/everyone.ts';
import { fromDay, moveIn, moveOut, noticeLine } from './households.ts';
import { RENT_NOTICE_DAYS } from './mr-lim.ts';
import { dayIndex } from './time.ts';

/** Who owns a place, if a resident does: its landlord, or a holder who bought it. */
export const ownerOf = (p: Property): string | null => p.landlord ?? (p.owned ? p.holder : null);

/** The houses someone owns: lived in, standing empty, or let; their home first. */
export function ownedBy(w: World, r: Resident): [string, Property][] {
  return Object.entries(w.state.property).filter(([id, p]) => id.startsWith('house-') && ownerOf(p) === r.id)
    .sort(([a], [b]) => Number(b === r.homeId) - Number(a === r.homeId));
}

/** Whose house they mean: "my house", "your house", or whichever of the two owns one. */
function houseMeant(w: World, r: Resident, o: Resident, item: unknown): { placeId: string; p: Property; owner: Resident; other: Resident } | string {
  const s = typeof item === 'string' ? item.toLowerCase() : '';
  const yours = /\b(your|yours)\b/.test(s);
  const mine = /\b(my|mine|our|ours)\b/.test(s);
  const order = yours ? [o] : mine ? [r] : [r, o];
  for (const owner of order) {
    const [first] = ownedBy(w, owner);
    if (first) return { placeId: first[0], p: first[1], owner, other: owner === r ? o : r };
  }
  const who = order.length === 1 ? order[0]! : null;
  const fromLim = (x: Resident) => Object.values(w.state.property).some((p) => p.holder === x.id && !p.owned && !p.landlord);
  if (who) {
    const whose = who === r ? 'yours' : `${o.name}'s`;
    return fromLim(who) ? `That house is Mr Lim's: it isn't ${whose} to sell or let.` : `${who === r ? "You haven't" : `${o.name} hasn't`} a house of ${who === r ? 'your' : 'their'} own.`;
  }
  return fromLim(r) || fromLim(o) ? "The houses you two live in are Mr Lim's: neither is yours to sell or let." : 'Neither of you has a house of your own.';
}

/** The offer in words, as `forId` sees it. */
export function dealWords(w: World, d: PlaceDeal, forId: string): string {
  const p = w.state.property[d.placeId]!;
  const owner = ownerOf(p);
  const from = d.fromId === forId ? 'You' : w.nameOf(d.fromId);
  const to = d.toId === forId ? 'you' : w.nameOf(d.toId);
  const house = owner === forId ? 'your house' : owner === d.fromId ? 'their house' : `${w.nameOf(owner ?? d.toId)}'s house`;
  const money = formatMoney(d.cents);
  if (d.kind === 'sale') return owner === d.fromId ? `${from} offer${from === 'You' ? '' : 's'} to sell ${to} ${house} for ${money}` : `${from} offer${from === 'You' ? '' : 's'} ${to} ${money} for ${house}`;
  return owner === d.fromId ? `${from} offer${from === 'You' ? '' : 's'} to let ${to} ${house} for ${money} a week` : `${from} offer${from === 'You' ? '' : 's'} ${to} ${money} a week to rent ${house}`;
}

export function offerPlace(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  if (w.ageOf(r) < GROWN_AGE || w.ageOf(o) < GROWN_AGE) return no('Houses are for grown-ups to settle between them.');
  const cents = moneyOf(i.money);
  if (cents === null || cents === 0) return no("That doesn't sound like money.");
  const found = houseMeant(w, r, o, i.item);
  if (typeof found === 'string') return no(found);
  const { placeId, p, owner, other } = found;
  const kind = i.renting === true ? 'let' : 'sale';
  if (kind === 'let' && p.landlord) return no(`${owner === r ? 'Your' : `${owner.name}'s`} house is let to ${p.holder === other.id ? (other === r ? 'you' : other.name) : w.nameOf(p.holder!)} already.`);
  // Whoever pays must have it now: the price, or the first week.
  if (other === r && r.money < cents) return no(`You haven't ${formatMoney(cents)}.`);
  const deal: PlaceDeal = { id: w.nextId(), fromId: r.id, toId: o.id, placeId, kind, cents, expires: w.t + TRADE_OFFER_MINUTES };
  // One offer from one to another: a new one takes the place of the last.
  w.state.placeDeals = [...w.state.placeDeals.filter((d) => !(d.fromId === r.id && d.toId === o.id)), deal];
  w.notify(o.id, `${dealWords(w, deal, o.id)}.`);
  return ok(`${dealWords(w, deal, r.id)}.`);
}

/** The house offer from o to r, if any. */
export const dealFrom = (w: World, r: Resident, o: Resident) => w.state.placeDeals.find((d) => d.fromId === o.id && d.toId === r.id) ?? null;

export function agreeDeal(w: World, r: Resident, o: Resident, d: PlaceDeal): ActionResult {
  const near = personNearby(w, r, o.name);
  if (typeof near === 'string') return no(near);
  const p = w.state.property[d.placeId]!;
  const ownerId = ownerOf(p);
  // The house must still be the owner's (and, to let, not let meanwhile).
  if (!ownerId || ![d.fromId, d.toId].includes(ownerId) || (d.kind === 'let' && p.landlord)) {
    w.state.placeDeals = w.state.placeDeals.filter((x) => x.id !== d.id);
    return no("That offer doesn't stand now: the house isn't theirs to sell or let any more.");
  }
  const owner = w.resident(ownerId);
  const payer = owner === r ? o : r;
  if (payer.money < d.cents) return no(payer === r ? `You haven't ${formatMoney(d.cents)}.` : `${payer.name} hasn't the money now.`);
  w.state.placeDeals = w.state.placeDeals.filter((x) => x.id !== d.id);
  const money = formatMoney(d.cents);
  if (d.kind === 'sale') {
    w.transfer(payer.id, owner.id, d.cents, 'bought a house');
    w.emit({ type: 'bought_place', who: payer.id, place: d.placeId, cents: d.cents, from: owner.id });
    if (p.landlord && p.holder === payer.id) {
      // The tenant buys the house they live in: what they owed their landlord stays owed.
      if (p.owing > 0) addDebt(w, payer.id, owner.id, 'iou', p.owing, 'rent');
      Object.assign(p, { holder: payer.id, owned: true, landlord: null, owing: 0, since: null, notice: null });
    } else if (p.landlord) {
      // Let: the sitting tenant stays, on the same rent, the buyer their landlord now.
      if (p.owing > 0) addDebt(w, p.holder!, owner.id, 'iou', p.owing, 'rent');
      Object.assign(p, { landlord: payer.id, owing: 0, since: null, notice: null });
      w.notify(p.holder!, `${owner.name} has sold the house you rent to ${payer.name}: you rent it from ${payer.name} now, at the same ${formatMoney(p.rent)} a week.`);
    } else {
      moveOut(w, d.placeId, owner.id, `has been sold to ${payer.name}`);
      Object.assign(p, { holder: payer.id, owned: true, owing: 0, since: null, notice: null, grace: null });
      moveIn(w, payer, d.placeId, owner.name);
    }
    w.notify(o.id, `${r.name} agrees: ${payer === o ? `you pay ${money}, and the house is yours` : `you're paid ${money} for the house`}.`);
    return ok(payer === r ? `You pay ${o.name} ${money}: the house is yours now, and nobody can take it.` : `${o.name} pays you ${money}: the house is theirs now.`);
  }
  // A let: the first week paid now; the household of the owner out, the tenant's in.
  w.transfer(payer.id, owner.id, d.cents, "a week's rent up front");
  w.emit({ type: 'rent_paid', who: payer.id, place: d.placeId, cents: d.cents, to: owner.id });
  moveOut(w, d.placeId, owner.id, `is let to ${payer.name}`);
  Object.assign(p, { holder: payer.id, owned: false, landlord: owner.id, rent: d.cents, owing: 0, since: null, grace: null, notice: null });
  moveIn(w, payer, d.placeId, owner.name);
  w.notify(o.id, `${r.name} agrees: ${payer === o ? `you pay the first week, ${money}, and the house is your home` : `the first week's ${money} is paid, and the house is let`}.`);
  return ok(payer === r ? `You pay ${o.name} the first week, ${money}: the house is your home now. The rent is due each Monday.` : `${o.name} pays you the first week, ${money}: the house is let to them.`);
}

export function refuseDeal(w: World, r: Resident, o: Resident, d: PlaceDeal): ActionResult {
  w.state.placeDeals = w.state.placeDeals.filter((x) => x.id !== d.id);
  w.notify(o.id, `${r.name} turned down your offer for the house.`);
  return ok(`You turn down ${o.name}'s offer.`);
}

/** A landlord gives their tenant notice of a new rent, in person: a week on, agreed, or they leave. */
export function changeRent(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const let_ = Object.entries(w.state.property).find(([, p]) => p.landlord === r.id && p.holder === o.id);
  if (!let_) return no(`${o.name} doesn't rent a house from you.`);
  const [id, p] = let_;
  const cents = moneyOf(i.money);
  if (cents === null || cents === 0) return no("That doesn't sound like money.");
  if (p.notice) return no(`You've given ${o.name} notice of a new rent already.`);
  if (cents === p.rent) return no(`${o.name} pays ${formatMoney(cents)} a week already.`);
  p.notice = { rent: cents, from: dayIndex(w.t) + RENT_NOTICE_DAYS, agreed: cents < p.rent };
  w.notify(o.id, noticeLine(w, id, p));
  for (const x of w.state.residents) if (x.homeId === id && x.id !== o.id) w.notify(x.id, noticeLine(w, id, p, x.id));
  return ok(`You give ${o.name} notice: ${fromDay(w, p.notice.from)}, the rent for your house is ${formatMoney(cents)} a week.${cents > p.rent ? ` If ${o.name} won't pay it, they'll have to leave.` : ''}`);
}

/** A new rent from o (r's landlord) waiting on r's word. */
export function noticeFrom(w: World, r: Resident, o: Resident): [string, Property] | null {
  return Object.entries(w.state.property).find(([, p]) => p.landlord === o.id && p.holder === r.id && p.notice && !p.notice.agreed) ?? null;
}

export function agreeRent(w: World, r: Resident, o: Resident, [, p]: [string, Property]): ActionResult {
  const near = personNearby(w, r, o.name);
  if (typeof near === 'string') return no(near);
  p.notice!.agreed = true;
  const what = `${formatMoney(p.notice!.rent)} a week ${fromDay(w, p.notice!.from)}`;
  w.notify(o.id, `${r.name} agrees to pay the new rent, ${what}.`);
  return ok(`You tell ${o.name} you'll pay ${what}.`);
}

export function refuseRent(w: World, r: Resident, o: Resident, [, p]: [string, Property]): ActionResult {
  w.notify(o.id, `${r.name} won't pay the new rent: they'll leave when it starts.`);
  return ok(`You tell ${o.name} you won't pay ${formatMoney(p.notice!.rent)} a week. You'll have to leave when it starts, ${fromDay(w, p.notice!.from).replace(/^from /, 'on ')}.`);
}

/** Offers and notices waiting on r's word, in their words. */
export function dealLines(w: World, r: Resident): string[] {
  return w.state.placeDeals.filter((d) => d.toId === r.id).map((d) => `${dealWords(w, d, r.id)}; you could agree, or refuse.`);
}

/** Whether anything about a house waits on r's word. */
export const somethingAboutHouses = (w: World, r: Resident) => w.state.placeDeals.some((d) => d.toId === r.id)
  || Object.values(w.state.property).some((p) => p.landlord && p.holder === r.id && p.notice && !p.notice.agreed);

