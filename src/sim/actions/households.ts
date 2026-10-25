import {
  HOME_OFFER_MINUTES, PROPOSAL_MINUTES, heldBy, isClose, kinOf, livingIn, rehome,
} from '../households.ts';
import type { Resident, World } from '../state.ts';
import { type ActionResult, type Intent, no, ok, personNearby } from './common.ts';

/** Offer someone a home in the house you head and live in. */
export function takeIn(w: World, r: Resident, i: Intent): ActionResult {
  const house = heldBy(w, r);
  if (!house || r.homeId !== house.id) return no("It isn't your house to offer.");
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  if (o.homeId === house.id) return no(`${o.name} already lives with you.`);
  w.state.homeOffers = w.state.homeOffers.filter((x) => !(x.fromId === r.id && x.toId === o.id));
  w.state.homeOffers.push({ id: w.nextId(), fromId: r.id, toId: o.id, houseId: house.id, expires: w.t + HOME_OFFER_MINUTES });
  const where = w.placeName(w.home(r)!);
  w.notify(o.id, `${r.name} says you can come and live in ${where}.`);
  w.emit({ type: 'home_offered', who: r.id, to: o.id, house: house.id });
  return ok(`You tell ${o.name} they can come and live with you.`);
}

/** Move into a house someone offered you a home in. */
export function moveIn(w: World, r: Resident, i: Intent): ActionResult {
  const from = w.residentByName(i.from);
  const offer = from ? w.state.homeOffers.find((x) => x.fromId === from.id && x.toId === r.id) : undefined;
  if (!from || !offer) return no(`${from?.name ?? 'Nobody by that name'} hasn't offered you a home.`);
  w.state.homeOffers = w.state.homeOffers.filter((x) => x !== offer);
  r.homeId = offer.houseId;
  w.learnPlace(r, offer.houseId);
  w.notify(from.id, `${r.name} has moved in with you.`);
  w.emit({ type: 'moved_in', who: r.id, house: offer.houseId, host: from.id });
  return ok(`You move your things into ${w.placeName(w.home(r)!)}.`);
}

/** Tell someone who lives in the house you head to leave. */
export function tellToLeave(w: World, r: Resident, i: Intent): ActionResult {
  const house = heldBy(w, r);
  const o = w.residentByName(i.to);
  if (!o) return no("You don't know anyone by that name.");
  if (o.id === r.id) return no("That's you.");
  if (!house || o.homeId !== house.id) return no(`${o.name} doesn't live in your house.`);
  const there = personNearby(w, r, i.to);
  if (typeof there === 'string') return no(`You'd have to tell ${o.name} in person.`);
  rehome(w, o);
  w.state.homeOffers = w.state.homeOffers.filter((x) => !(x.fromId === r.id && x.toId === o.id));
  w.notify(o.id, o.homeId
    ? `${r.name} has told you to leave the house. You go back to ${w.placeName(w.home(o)!)}.`
    : `${r.name} has told you to leave the house. You've nowhere to sleep tonight.`);
  w.emit({ type: 'told_to_leave', who: r.id, to: o.id, homeless: o.homeId === null });
  return ok(`You tell ${o.name} to leave.`);
}

/** Ask someone you've grown close to to marry you. */
export function propose(w: World, r: Resident, i: Intent): ActionResult {
  if (r.spouseId) return no("You're already married.");
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  if (o.spouseId) return no(`${o.name} is already married.`);
  const kin = kinOf(r, o);
  if (kin) return no(`${o.name} is ${kin}. That's family.`);
  if (!isClose(w, r, o)) return no("You don't know each other well enough for that.");
  w.state.proposals = w.state.proposals.filter((p) => !(p.fromId === r.id && p.toId === o.id));
  w.state.proposals.push({ id: w.nextId(), fromId: r.id, toId: o.id, expires: w.t + PROPOSAL_MINUTES });
  w.notify(o.id, `${r.name} has asked to marry you.`);
  w.emit({ type: 'proposed', who: r.id, to: o.id });
  return ok(`You ask ${o.name} to marry you.`);
}

/** Say yes to someone who asked to marry you. */
export function marry(w: World, r: Resident, i: Intent): ActionResult {
  const o = w.residentByName(i.to);
  const p = o ? w.state.proposals.find((x) => x.fromId === o.id && x.toId === r.id) : undefined;
  if (!o || !p) return no(`${o?.name ?? 'Nobody by that name'} hasn't asked you.`);
  if (r.spouseId || o.spouseId) return no('One of you is already married.');
  r.spouseId = o.id;
  o.spouseId = r.id;
  w.state.proposals = w.state.proposals.filter((x) => ![r.id, o.id].includes(x.fromId) && ![r.id, o.id].includes(x.toId));
  w.notify(o.id, `${r.name} said yes. You're married!`);
  w.emit({ type: 'married', who: r.id, to: o.id });
  return ok(`You say yes. You and ${o.name} are married.`);
}

/** Turn down a proposal. */
export function turnDown(w: World, r: Resident, i: Intent): ActionResult {
  const o = w.residentByName(i.to);
  const p = o ? w.state.proposals.find((x) => x.fromId === o.id && x.toId === r.id) : undefined;
  if (!o || !p) return no(`${o?.name ?? 'Nobody by that name'} hasn't asked you.`);
  w.state.proposals = w.state.proposals.filter((x) => x !== p);
  w.notify(o.id, `${r.name} turned down your proposal.`);
  w.emit({ type: 'turned_down', who: r.id, to: o.id });
  return ok(`You turn ${o.name} down, as gently as you can.`);
}

/** For the action list: someone who heads the house they live in, with someone nearby to offer it to. */
export function canTakeIn(w: World, r: Resident): boolean {
  const house = heldBy(w, r);
  return !!house && r.homeId === house.id && w.nearby(r).some((o) => !w.isAsleep(o) && o.homeId !== house.id);
}

/** For the action list: someone who heads a house with others living in it, one of them nearby. */
export function canTellToLeave(w: World, r: Resident): boolean {
  const house = heldBy(w, r);
  return !!house && livingIn(w, house.id, r.id).some((o) => w.isNear(r, o));
}

/** For the action list: unmarried, with someone close, unmarried and not kin, nearby. */
export function canPropose(w: World, r: Resident): boolean {
  return !r.spouseId && w.nearby(r).some((o) => !o.spouseId && !w.isAsleep(o) && !kinOf(r, o) && isClose(w, r, o));
}
