import { atHomeForCallers } from '../../village/head.ts';
import {
  STALL_DEPOSIT, isStall, leaseOf, leasesOf, payAtDoor, rentOf, takeBack, takeHouse, takeStall, toLet,
} from '../../village/lets.ts';
import { VILLAGE_HEAD } from '../../village/village.ts';
import { PLACE_BY_ID } from '../map.ts';
import { formatMoney } from '../money.ts';
import { PLACE_WORDS } from '../places.ts';
import type { Resident, World } from '../state.ts';
import { isNight } from '../time.ts';
import { type ActionResult, type Intent, no, ok, qtyOf, textOf } from './common.ts';

const DOOR = VILLAGE_HEAD.homeId;

/** At his door, and he's in: the only place these work. */
function atDoor(w: World, r: Resident): string | null {
  if (!w.isAt(r, DOOR)) return "You'd have to go to Mr Lim's house for that.";
  if (isNight(w.t)) return 'The house is dark. Better not knock at this hour.';
  if (!atHomeForCallers(w)) return "The door's shut and the house is quiet. Mr Lim must be out.";
  return null;
}

/** "attap house 4", "house 4", "number 4", "the corner stall": the house or stall meant, if any. */
export function letPlaceNamed(w: World, where: unknown): string | null {
  if (typeof where !== 'string') return null;
  const s = where.trim().toLowerCase().replace(/^the\s+/, '').replace(/[.!?]+$/, '');
  const n = /(?:attap\s+)?(?:house|number|no\.?)\s*(\d+)$/.exec(s)?.[1];
  if (n && PLACE_BY_ID.has(`house-${n}`)) return `house-${n}`;
  for (const [id, words] of Object.entries(PLACE_WORDS)) if (isStall(id) && words.includes(s)) return id;
  const exact = [...PLACE_BY_ID.values()].find((p) => (p.kind === 'house' || p.kind === 'stall') && (p.name.replace(/^the /, '') === s || w.placeName(p).toLowerCase() === s));
  return exact?.id ?? null;
}

/** Knock and say something: in this build he answers in a few set words (his own voice comes later). */
export function knock(w: World, r: Resident, i: Intent): ActionResult {
  if (!w.isAt(r, DOOR)) return no("You'd have to go to Mr Lim's house for that.");
  if (isNight(w.t)) return no('The house is dark. Better not knock at this hour.');
  if (!atHomeForCallers(w)) return no('Nobody answers. Mr Lim must be out.');
  const said = textOf(i.text);
  w.emit({ type: 'knocked', who: r.id, text: said ?? '' });
  w.notify(r.id, 'Mr Lim says through the door: "Rent and lettings I can help with. For anything else, come back another day."', true);
  return ok('You knock on Mr Lim\'s door.');
}

/** Rent a house he has to let, or ask for a stall (or take the stall he's offered you). */
export function rentPlace(w: World, r: Resident, i: Intent): ActionResult {
  const shut = atDoor(w, r);
  if (shut) return no(shut);
  const id = letPlaceNamed(w, i.where);
  const { houses, stalls } = toLet(w);
  if (!id || (!houses.includes(id) && !stalls.includes(id))) return no(`Mr Lim says that isn't to let.`);
  const name = w.placeName(PLACE_BY_ID.get(id)!);
  if (!isStall(id)) {
    const rent = rentOf(w, id);
    if (r.money < rent) return no(`Mr Lim wants the first week's ${formatMoney(rent)} now. You have ${formatMoney(r.money)}.`);
    takeHouse(w, r, id);
    return ok(`You pay Mr Lim ${formatMoney(rent)}, and ${name} is yours to live in.`);
  }
  if (w.shopOf(r.id)) return no('Mr Lim says you already have a business to run.');
  const call = w.state.stallCalls.find((c) => c.placeId === id);
  if (call?.offeredTo === r.id) {
    const due = STALL_DEPOSIT + rentOf(w, id);
    if (r.money < due) return no(`Mr Lim wants ${formatMoney(STALL_DEPOSIT)} down and the first week's ${formatMoney(rentOf(w, id))}. You have ${formatMoney(r.money)}.`);
    takeStall(w, r, id);
    return ok(`You pay Mr Lim ${formatMoney(due)}. ${name[0]!.toUpperCase()}${name.slice(1)} is yours to trade from.`);
  }
  if (!call) return no(`Mr Lim says that isn't to let.`);
  if (call.applicants.includes(r.id)) return no(`You've already asked Mr Lim for ${name}.`);
  call.applicants.push(r.id);
  w.emit({ type: 'stall_asked', who: r.id, place: id });
  return ok(`Mr Lim writes your name down for ${name}. He'll send word when he has chosen.`);
}

/** Pay rent at his door: anything owed first, then weeks ahead. */
export function payRent(w: World, r: Resident, i: Intent): ActionResult {
  const shut = atDoor(w, r);
  if (shut) return no(shut);
  const mine = leasesOf(w, r);
  if (!mine.length) return no("You don't rent anything from Mr Lim.");
  const named = letPlaceNamed(w, i.where);
  const lease = named ? mine.find((l) => l.placeId === named) : mine.find((l) => l.owed > 0) ?? mine[0];
  if (!lease) return no("You don't rent that from Mr Lim.");
  const weeks = qtyOf(i.qty, 1);
  if (weeks === null) return no('How many weeks?');
  const owedBefore = lease.owed;
  const why = payAtDoor(w, r, lease, weeks);
  if (why) return no(why);
  return ok(owedBefore > 0 && weeks === 1 ? 'You pay Mr Lim what you owed him.' : 'You pay Mr Lim the rent.');
}

/** Hand back a house or stall you rent from him. */
export function handBack(w: World, r: Resident, i: Intent): ActionResult {
  const shut = atDoor(w, r);
  if (shut) return no(shut);
  const id = letPlaceNamed(w, i.where);
  const lease = id ? leaseOf(w, id) : null;
  if (!lease || lease.tenantId !== r.id) return no("You don't rent that from Mr Lim.");
  takeBack(w, lease, 'handed');
  return ok(`You hand ${w.placeName(PLACE_BY_ID.get(lease.placeId)!)} back to Mr Lim.`);
}

/** For the action list: at his door. */
export const atHisDoor = (w: World, r: Resident) => w.isAt(r, DOOR) && atHomeForCallers(w);
export const canRentHere = (w: World, r: Resident) => {
  const { houses, stalls } = toLet(w);
  return atHisDoor(w, r) && (houses.length > 0 || stalls.length > 0);
};
export const rentsHere = (w: World, r: Resident) => atHisDoor(w, r) && leasesOf(w, r).length > 0;
