/**
 * Houses between residents (households-build.md "Housing market" item 4): a
 * house someone owns they may sell, or let, to another at any price the two
 * agree, offered and agreed in person like a trade. A sale moves the buyer's
 * household in and the seller's out; a house sold while it's let keeps its
 * sitting tenant, the buyer their landlord on the same rent. A tenant pays
 * their landlord at Mr Lim's Monday round, and a landlord changes the rent as
 * Mr Lim does: a week's notice, agreed, or the tenant leaves when it starts.
 * A stall someone owns goes the same way, its keeper changing to the buyer or
 * tenant (households.ts handOverStall); nobody moves house for a stall.
 */
import { formatMoney } from './money.ts';
import { GROWN_AGE, type PlaceDeal, type Property, type Resident, type World } from './state.ts';
import { type ActionResult, type Intent, moneyOf, no, ok, personNearby } from './actions/common.ts';
import { addDebt } from './actions/debts.ts';
import { TRADE_OFFER_MINUTES } from './actions/everyone.ts';
import { fromDay, handOverStall, keepsStall, mondayOnOrAfter, moveIn, moveOut, noticeLine, STALL_WORDS } from './households.ts';
import { PLACE_BY_ID } from './map.ts';
import { RENT_NOTICE_DAYS } from './mr-lim.ts';
import { dayIndex } from './time.ts';

/** Who owns a place, if a resident does: its landlord, or a holder who bought it. */
export const ownerOf = (p: Property): string | null => p.landlord ?? (p.owned ? p.holder : null);

/** "house", or a stall's own name ("market stall"). */
const nounOf = (placeId: string) => (placeId.startsWith('house-') ? 'house' : (PLACE_BY_ID.get(placeId)?.name ?? 'stall').replace(/^the /, ''));

/** The houses (or stalls) someone owns: lived in, standing empty, or let; their home first. */
export function ownedBy(w: World, r: Resident, stalls = false): [string, Property][] {
  return Object.entries(w.state.property).filter(([id, p]) => id.startsWith('house-') !== stalls && ownerOf(p) === r.id)
    .sort(([a], [b]) => Number(b === r.homeId) - Number(a === r.homeId));
}

const lives = (w: World, id: string) => w.state.residents.some((x) => x.homeId === id);

/** Who lives in a house, its owner first. */
const livers = (w: World, id: string, owner: Resident) => w.state.residents.filter((x) => x.homeId === id).sort((a, b) => Number(b === owner) - Number(a === owner));

/** Which house, in words they'd know it by (as `forId` sees it), and could answer with. */
function houseWords(w: World, id: string, p: Property, owner: Resident, forId: string): string {
  if (!id.startsWith('house-')) return `the ${nounOf(id)}`;
  if (p.landlord) return p.holder === forId ? 'the one you rent' : `the one ${w.nameOf(p.holder!)} rents`;
  const here = livers(w, id, owner);
  if (here.some((x) => x.id === forId)) return 'the one you live in';
  return here.length ? `the one ${here[0]!.name} lives in` : 'the one standing empty';
}

/** A Mr Lim house they're buying week by week, and would lose by moving. */
const buyingFromLim = (w: World, r: Resident) => { const p = w.state.property[r.homeId]; return !!p && p.holder === r.id && !!p.rentToOwn; };
const BUYING_FROM_LIM = "You're buying your house from Mr Lim week by week: you'd lose it if you moved.";

/** Whose house, and which, they mean: "my house", "your house", or whichever of the two owns one; a let takes one not let already. */
function houseMeant(w: World, r: Resident, o: Resident, item: unknown, kind: PlaceDeal['kind']): { placeId: string; p: Property; owner: Resident; other: Resident } | string {
  const s = typeof item === 'string' ? item.toLowerCase() : '';
  const yours = /\b(your|yours)\b/.test(s);
  const mine = /\b(my|mine|our|ours)\b/.test(s);
  // A stall if they say so; a house otherwise.
  const stalls = STALL_WORDS.test(s);
  const noun = stalls ? 'stall' : 'house';
  const fromLim = (x: Resident) => Object.entries(w.state.property).some(([id, p]) => id.startsWith('house-') !== stalls && p.holder === x.id && !p.owned && !p.landlord);
  let owner: Resident;
  if (yours || mine) {
    owner = yours ? o : r;
    if (!ownedBy(w, owner, stalls).length) {
      const whose = owner === r ? 'yours' : `${o.name}'s`;
      return fromLim(owner) ? `That ${noun} is Mr Lim's: it isn't ${whose} to sell or let.` : `${owner === r ? "You haven't" : `${o.name} hasn't`} a ${noun} of ${owner === r ? 'your' : 'their'} own.`;
    }
  } else {
    const owners = [r, o].filter((x) => ownedBy(w, x, stalls).length > 0);
    if (owners.length === 2) return `You both have a ${noun} of your own. Whose do you mean: say my ${noun}, or your ${noun}.`;
    if (!owners.length) return fromLim(r) || fromLim(o) ? `The ${noun}s you two have are Mr Lim's: neither is yours to sell or let.` : `Neither of you has a ${noun} of your own.`;
    owner = owners[0]!;
  }
  const other = owner === r ? o : r;
  let houses = ownedBy(w, owner, stalls);
  if (kind === 'let') {
    houses = houses.filter(([, p]) => !p.landlord);
    if (!houses.length) return `${owner === r ? 'Your' : `${owner.name}'s`} ${noun} is let already.`;
  }
  // What they say of it: who lives there (or rents it), standing empty, let, or the owner's home.
  const named = houses.filter(([id, p]) => [...livers(w, id, owner), ...(p.landlord && p.holder ? [w.resident(p.holder)] : [])].some((x) => s.includes(x.name.toLowerCase())));
  const said = named.length ? named : houses.filter(([id, p]) => (/\b(empty|free|spare)\b/.test(s) && !lives(w, id))
    || (/\b(let|rent|rents|rented|tenant)\b/.test(s) && !!p.landlord) || (/\b(live|lives|living|home)\b/.test(s) && id === owner.homeId));
  if (said.length) houses = said;
  // A sale to the one who rents it: that house, unless they said another.
  const theirs = houses.find(([, p]) => p.landlord && p.holder === other.id);
  if (theirs && kind === 'sale' && !said.length) houses = [theirs];
  // A let: rather one standing empty than the owner's own home.
  if (kind === 'let' && houses.length > 1) {
    const empty = houses.filter(([id]) => !lives(w, id));
    if (empty.length) houses = empty;
  }
  if (houses.length > 1) return `Which ${noun} do you mean: ${houses.map(([id, p]) => houseWords(w, id, p, owner, r.id)).join(', or ')}?`;
  const [placeId, p] = houses[0]!;
  return { placeId, p, owner, other };
}

/** The offer in words, as `forId` sees it. */
export function dealWords(w: World, d: PlaceDeal, forId: string): string {
  const owner = d.ownerId;
  const from = d.fromId === forId ? 'You' : w.nameOf(d.fromId);
  const to = d.toId === forId ? 'you' : w.nameOf(d.toId);
  const noun = nounOf(d.placeId);
  const house = owner === forId ? `your ${noun}` : owner === d.fromId ? `their ${noun}` : `${w.nameOf(owner)}'s ${noun}`;
  const money = formatMoney(d.cents);
  const s = from === 'You' ? '' : 's';
  if (d.kind === 'sale') return owner === d.fromId ? `${from} offer${s} to sell ${to} ${house} for ${money}` : `${from} offer${s} ${to} ${money} for ${house}`;
  return owner === d.fromId ? `${from} offer${s} to let ${to} ${house} for ${money} a week` : `${from} offer${s} ${to} ${money} a week to rent ${house}`;
}

/** Whether the payer would move in (and so leave their home): a house, not let, or to rent. */
const movesIn = (d: Pick<PlaceDeal, 'kind' | 'wasLet' | 'placeId'>) => d.placeId.startsWith('house-') && (d.kind === 'let' || !d.wasLet);
/** Whether the payer would keep a stall, and keeps another already. */
const keepsAnother = (w: World, payer: Resident, placeId: string) => !placeId.startsWith('house-') && keepsStall(w, payer) && w.shop(placeId)?.ownerId !== payer.id;

export function offerPlace(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  if (w.ageOf(r) < GROWN_AGE || w.ageOf(o) < GROWN_AGE) return no('Houses are for grown-ups to settle between them.');
  const cents = moneyOf(i.money);
  if (cents === null || cents === 0) return no("That doesn't sound like money.");
  const kind = i.renting === true ? 'let' : 'sale';
  const found = houseMeant(w, r, o, i.item, kind);
  if (typeof found === 'string') return no(found);
  const { placeId, p, owner, other } = found;
  const deal: PlaceDeal = { id: w.nextId(), fromId: r.id, toId: o.id, placeId, kind, cents, expires: w.t + TRADE_OFFER_MINUTES, ownerId: owner.id, wasLet: !!p.landlord };
  if (keepsAnother(w, other, placeId)) return no(other === r ? 'You keep a stall already.' : `${other.name} keeps a stall already.`);
  if (kind === 'let' && other.homeId === placeId) return no(other === r ? 'You live there already.' : `${other.name} lives there already.`);
  if (other === r && movesIn(deal) && buyingFromLim(w, r)) return no(BUYING_FROM_LIM);
  // Whoever pays must have it now: the price, or the first week.
  if (other === r && r.money < cents) return no(`You haven't ${formatMoney(cents)}.`);
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
  // The house must stand as it did when offered: the same owner, let or not.
  if (ownerOf(p) !== d.ownerId || !!p.landlord !== d.wasLet) {
    w.state.placeDeals = w.state.placeDeals.filter((x) => x.id !== d.id);
    return no(`That offer doesn't stand now: the ${nounOf(d.placeId)} has changed hands since.`);
  }
  const owner = w.resident(d.ownerId);
  const payer = owner === r ? o : r;
  if (keepsAnother(w, payer, d.placeId)) return no(payer === r ? 'You keep a stall already.' : `${payer.name} keeps a stall already.`);
  if (d.kind === 'let' && payer.homeId === d.placeId) return no(payer === r ? 'You live there already.' : `${payer.name} lives there already.`);
  if (movesIn(d) && buyingFromLim(w, payer)) return no(payer === r ? BUYING_FROM_LIM : `${payer.name} is buying their house from Mr Lim week by week, and can't move.`);
  if (payer.money < d.cents) return no(payer === r ? `You haven't ${formatMoney(d.cents)}.` : `${payer.name} hasn't the money now.`);
  // This house changes hands: no other offer for it stands.
  w.state.placeDeals = w.state.placeDeals.filter((x) => x.placeId !== d.placeId);
  const money = formatMoney(d.cents);
  const noun = nounOf(d.placeId);
  const house = d.placeId.startsWith('house-');
  if (d.kind === 'sale') {
    w.transfer(payer.id, owner.id, d.cents, `bought the ${noun}`);
    w.emit({ type: 'bought_place', who: payer.id, place: d.placeId, cents: d.cents, from: owner.id });
    if (p.landlord && p.holder === payer.id) {
      // The tenant buys the house they live in: what they owed their landlord stays owed.
      if (p.owing > 0) addDebt(w, payer.id, owner.id, 'iou', p.owing, 'rent');
      Object.assign(p, { holder: payer.id, owned: true, landlord: null, owing: 0, since: null, notice: null });
    } else if (p.landlord) {
      // Let: the sitting tenant stays, on the same rent, the buyer their landlord now.
      if (p.owing > 0) addDebt(w, p.holder!, owner.id, 'iou', p.owing, 'rent');
      Object.assign(p, { landlord: payer.id, owing: 0, since: null, notice: null });
      w.notify(p.holder!, `${owner.name} has sold the ${noun} you rent to ${payer.name}: you rent it from ${payer.name} now, at the same ${formatMoney(p.rent)} a week.`);
    } else if (!house) {
      handOverStall(w, d.placeId, payer.id);
      Object.assign(p, { holder: payer.id, owned: true, owing: 0, since: null, notice: null, grace: null });
    } else {
      moveOut(w, d.placeId, owner.id, `has been sold to ${payer.name}`, payer.id);
      Object.assign(p, { holder: payer.id, owned: true, owing: 0, since: null, notice: null, grace: null });
      moveIn(w, payer, d.placeId, `${payer.name} has bought a house from ${owner.name}: it's home now.`);
    }
    w.notify(o.id, `${r.name} agrees: ${payer === o ? `you pay ${money}, and the ${noun} is yours` : `you're paid ${money} for the ${noun}`}.`);
    return ok(payer === r ? `You pay ${o.name} ${money}: the ${noun} is yours now, and nobody can take it.` : `${o.name} pays you ${money}: the ${noun} is theirs now.`);
  }
  // A let: the first week paid now; the household of the owner out, the tenant's in.
  w.transfer(payer.id, owner.id, d.cents, "a week's rent up front");
  w.emit({ type: 'rent_paid', who: payer.id, place: d.placeId, cents: d.cents, to: owner.id });
  if (house) moveOut(w, d.placeId, owner.id, `is let to ${payer.name}`);
  else handOverStall(w, d.placeId, payer.id);
  Object.assign(p, { holder: payer.id, owned: false, landlord: owner.id, rent: d.cents, owing: 0, since: null, grace: null, notice: null });
  if (house) moveIn(w, payer, d.placeId, `${payer.name} rents a house from ${owner.name}: it's home now.`);
  const theirs = house ? 'the house is your home' : `the ${noun} is yours to keep`;
  w.notify(o.id, `${r.name} agrees: ${payer === o ? `you pay the first week, ${money}, and ${theirs}` : `the first week's ${money} is paid, and the ${noun} is let`}.`);
  return ok(payer === r ? `You pay ${o.name} the first week, ${money}: ${theirs} now. The rent is due each Monday.` : `${o.name} pays you the first week, ${money}: the ${noun} is let to them.`);
}

export function refuseDeal(w: World, r: Resident, o: Resident, d: PlaceDeal): ActionResult {
  w.state.placeDeals = w.state.placeDeals.filter((x) => x.id !== d.id);
  w.notify(o.id, `${r.name} turned down your offer for the ${nounOf(d.placeId)}.`);
  return ok(`You turn down ${o.name}'s offer.`);
}

/** A landlord gives their tenant notice of a new rent, in person: from the Monday round a week or more on, agreed, or they leave. */
export function changeRent(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const let_ = Object.entries(w.state.property).find(([, p]) => p.landlord === r.id && p.holder === o.id);
  if (!let_) return no(`${o.name} doesn't rent anything from you.`);
  const [id, p] = let_;
  const cents = moneyOf(i.money);
  if (cents === null || cents === 0) return no("That doesn't sound like money.");
  if (p.notice) return no(`You've given ${o.name} notice of a new rent already.`);
  if (cents === p.rent) return no(`${o.name} pays ${formatMoney(cents)} a week already.`);
  p.notice = { rent: cents, from: mondayOnOrAfter(w, dayIndex(w.t) + RENT_NOTICE_DAYS), agreed: cents < p.rent };
  w.notify(o.id, noticeLine(w, id, p));
  for (const x of w.state.residents) if (x.homeId === id && x.id !== o.id) w.notify(x.id, noticeLine(w, id, p, x.id));
  return ok(`You give ${o.name} notice: ${fromDay(w, p.notice.from)}, the rent for your ${nounOf(id)} is ${formatMoney(cents)} a week.${cents > p.rent ? ` If ${o.name} won't pay it, they'll have to leave.` : ''}`);
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

/** Offers waiting on r's word, in their words. */
export function dealLines(w: World, r: Resident): string[] {
  return w.state.placeDeals.filter((d) => d.toId === r.id).map((d) => `${dealWords(w, d, r.id)}; you could agree, or refuse.`);
}

/** Whether anything about a house waits on r's word. */
export const somethingAboutHouses = (w: World, r: Resident) => w.state.placeDeals.some((d) => d.toId === r.id)
  || Object.values(w.state.property).some((p) => p.landlord && p.holder === r.id && p.notice && !p.notice.agreed);
