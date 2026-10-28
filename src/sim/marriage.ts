/**
 * Marriage (docs/design/households.md, Marriage; the details agreed for the
 * owner on 2026-10-28). Two grown, unmarried residents who aren't family, each
 * fond enough of the other and trusting enough: one asks, the other says yes
 * or no. Each is gated only by their own feelings, so nobody learns the
 * other's. Married, either can move in with the other. Purses stay separate;
 * no divorce and no children yet.
 */
import { kinOf } from '../seed/cast.ts';
import { type ActionResult, type Intent, no, ok, personNearby } from './actions/common.ts';
import { bondOf } from './bonds.ts';
import { moveIn, ROUGH } from './households.ts';
import type { Resident, World } from './state.ts';
import { dayIndex, MINUTES_PER_DAY, SGT_OFFSET_MIN } from './time.ts';

/** Old enough to marry. */
export const MARRY_AGE = 18;
/** How fond of, and how much trust in, the other each must feel. */
export const FOND_TO_MARRY = 70;
export const TRUST_TO_MARRY = 50;

export interface Proposal { id: number; fromId: string; toId: string; expires: number }

const family = (a: string, b: string) => kinOf(a).some((k) => k.id === b) || kinOf(b).some((k) => k.id === a);

/** Whether a feels enough for b to marry them. */
function feelsEnough(w: World, a: Resident, b: Resident): boolean {
  const bond = bondOf(w, a.id, b.id);
  return bond.fondness >= FOND_TO_MARRY && bond.trust >= TRUST_TO_MARRY;
}

/** Why r couldn't marry o, as r would see it; null if nothing stands in the way but feelings. */
function bar(w: World, r: Resident, o: Resident): string | null {
  if (w.ageOf(r) < MARRY_AGE) return "You're too young to think of marrying.";
  if (r.spouseId) return "You're married already.";
  if (w.ageOf(o) < MARRY_AGE) return `${o.name} is far too young for that.`;
  if (o.spouseId) return `${o.name} is married already.`;
  if (family(r.id, o.id)) return `${o.name} is family.`;
  return null;
}

/** Someone nearby r could ask: offered only then. */
export function someoneToAsk(w: World, r: Resident): boolean {
  return w.nearby(r).some((o) => !w.isAsleep(o) && bar(w, r, o) === null && feelsEnough(w, r, o)
    && !w.state.proposals.some((p) => p.fromId === r.id && p.toId === o.id));
}

/** The start of the next day: when an unanswered proposal lapses. */
function endOfDay(t: number): number {
  return (dayIndex(t) + 1) * MINUTES_PER_DAY - SGT_OFFSET_MIN;
}

export function propose(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const why = bar(w, r, o);
  if (why) return no(why);
  if (!feelsEnough(w, r, o)) return no(`You don't feel you know ${o.name} well enough for that yet.`);
  if (w.state.proposals.some((p) => p.fromId === o.id && p.toId === r.id)) return no(`${o.name} has already asked you: say yes or no.`);
  w.state.proposals = w.state.proposals.filter((p) => !(p.fromId === r.id && p.toId === o.id));
  w.state.proposals.push({ id: w.nextId(), fromId: r.id, toId: o.id, expires: endOfDay(w.t) });
  w.emit({ type: 'proposed', who: r.id, to: o.id });
  w.notify(o.id, `${r.name} asks you to marry them.`);
  return ok(`You ask ${o.name} to marry you.`);
}

/** The proposal someone named has made r, if any. */
export function proposalFrom(w: World, r: Resident, from: unknown): Proposal | null {
  const o = w.residentByName(from, r);
  return o ? w.state.proposals.find((p) => p.fromId === o.id && p.toId === r.id) ?? null : null;
}

export function acceptProposal(w: World, r: Resident, x: Proposal): ActionResult {
  const o = w.resident(x.fromId);
  const near = personNearby(w, r, o.name);
  if (typeof near === 'string') return no(near);
  const why = bar(w, r, o);
  if (why) return no(why);
  if (!feelsEnough(w, r, o)) return no("You're not ready to say yes to that.");
  w.state.proposals = w.state.proposals.filter((p) => ![p.fromId, p.toId].some((id) => id === r.id || id === o.id));
  r.spouseId = o.id;
  o.spouseId = r.id;
  w.emit({ type: 'married', who: r.id, to: o.id });
  w.notify(o.id, `${r.name} says yes. You're married now.`);
  // Kin hear of it wherever they are; anyone there saw it.
  const told = new Set([r.id, o.id]);
  const news = `${o.name} and ${r.name} are married.`;
  for (const k of [...kinOf(r.id), ...kinOf(o.id)]) {
    if (told.has(k.id) || !w.state.residents.some((x) => x.id === k.id)) continue;
    told.add(k.id);
    w.remember(k.id, news);
  }
  for (const x of w.nearby(r)) {
    if (told.has(x.id) || w.isAsleep(x)) continue;
    told.add(x.id);
    w.remember(x.id, news);
  }
  return ok(`You say yes. You and ${o.name} are married now.`);
}

export function refuseProposal(w: World, r: Resident, x: Proposal): ActionResult {
  const o = w.resident(x.fromId);
  w.state.proposals = w.state.proposals.filter((p) => p.id !== x.id);
  w.emit({ type: 'proposal_refused', who: r.id, from: o.id });
  w.notify(o.id, `${r.name} says no to marrying you.`);
  return ok(`You tell ${o.name} no.`);
}

/** Married and living apart, with a home to go to: they could move in together. */
export function canMoveIn(w: World, r: Resident): boolean {
  const s = r.spouseId ? w.resident(r.spouseId) : null;
  return !!s && s.homeId !== r.homeId && s.homeId !== ROUGH;
}

export function moveInWith(w: World, r: Resident, _i: Intent): ActionResult {
  const s = r.spouseId ? w.resident(r.spouseId) : null;
  if (!s) return no("You're not married.");
  if (s.homeId === r.homeId) return no(`You and ${s.name} already live together.`);
  if (s.homeId === ROUGH) return no(`${s.name} has no home to move into.`);
  const place = w.placeName(w.home(s));
  moveIn(w, r, s.homeId, `${r.name} moves in with ${s.name}: ${place} is home now.`);
  w.notify(s.id, `${r.name} moves in with you.`);
  return ok(`You move in with ${s.name}: ${place} is home now.`);
}

/** Proposals lapse unanswered at the end of the day. */
export function lapseProposals(w: World): void {
  for (const p of w.state.proposals.filter((x) => x.expires <= w.t)) {
    w.notify(p.fromId, `${w.resident(p.toId).name} never gave you an answer about marrying.`);
  }
  w.state.proposals = w.state.proposals.filter((x) => x.expires > w.t);
}

/** What r knows of marriage just now, in words. */
export function marriageLines(w: World, r: Resident): string[] {
  const out: string[] = [];
  if (r.spouseId) out.push(`You're married to ${w.resident(r.spouseId).name}.`);
  for (const p of w.state.proposals) {
    if (p.toId === r.id) out.push(`${w.resident(p.fromId).name} has asked you to marry them.`);
    if (p.fromId === r.id) out.push(`You've asked ${w.resident(p.toId).name} to marry you.`);
  }
  return out;
}
