/**
 * Households (owner decisions, 2026-10-25): who lives where, who heads each
 * house, sleeping rough, growing close and marriage. Residents are free: a
 * household head can tell someone to leave, and anyone can offer someone a
 * home. See docs/design/households.md.
 */
import { distance, type Point } from './map.ts';
import { talkKey, type House, type Resident, type World } from './state.ts';
import { dayIndex } from './time.ts';

/** Game days on which both have spoken to the other before two people count as close. */
export const CLOSE_DAYS = 5;
export const PROPOSAL_MINUTES = 30;
export const HOME_OFFER_MINUTES = 120;
/** Sleeping rough rests 2 a minute instead of 3, and never past this. */
export const ROUGH_REST = 2;
export const ROUGH_REST_CAP = 750;

/** Where someone with no home can lie down: the jetty's landward end, the kopitiam bench, under the eaves past the last house. */
export const ROUGH_SPOTS: readonly { at: Point; name: string }[] = [
  { at: { x: 31, y: 22 }, name: 'on the jetty' },
  { at: { x: 6, y: 12 }, name: 'on the kopitiam bench' },
  { at: { x: 0, y: 3 }, name: 'under the eaves by the houses' },
];

/** Close family, who can't marry (by resident id, as the cast was written). */
const KIN: readonly [string, string, string][] = [
  ['ah-huat', 'ah-seng', 'your son'],
  ['ah-seng', 'ah-huat', 'your father'],
  ['mdm-tan', 'mei-ling', 'your niece'],
  ['mei-ling', 'mdm-tan', 'your aunt'],
  ['muthu', 'raju', 'your cousin'],
  ['raju', 'muthu', 'your cousin'],
];

export function houseOf(w: World, id: string): House | null {
  return w.state.houses.find((h) => h.id === id) ?? null;
}

/** The house this resident heads, if any. */
export function heldBy(w: World, r: Resident): House | null {
  return w.state.houses.find((h) => h.holderId === r.id) ?? null;
}

/** Everyone else living in a house. */
export function livingIn(w: World, houseId: string, except?: string): Resident[] {
  return w.state.residents.filter((x) => x.homeId === houseId && x.id !== except);
}

/** Someone leaves where they live: back to a house they head, or to nowhere. */
export function rehome(w: World, r: Resident): void {
  r.homeId = heldBy(w, r)?.id ?? null;
}

/** How a resident is related to another, if they're close kin ("your cousin"). */
export function kinOf(a: Resident, b: Resident): string | null {
  return KIN.find(([x, y]) => x === a.id && y === b.id)?.[2] ?? null;
}

export function isClose(w: World, a: Resident, b: Resident): boolean {
  return (w.state.bonds[talkKey(a.id, b.id)]?.days ?? 0) >= CLOSE_DAYS;
}

/** Someone spoke to someone: a day on which both spoke to the other brings them a little closer (once a day, however much they talk). */
export function noteSpoken(w: World, speaker: Resident, listener: Resident): void {
  const key = talkKey(speaker.id, listener.id);
  const today = dayIndex(w.t);
  const bond = w.state.bonds[key] ?? { days: 0, day: today, a: false, b: false };
  if (bond.day !== today) {
    bond.day = today;
    bond.a = false;
    bond.b = false;
  }
  const first = speaker.id < listener.id;
  const before = bond.a && bond.b;
  if (first) bond.a = true;
  else bond.b = true;
  if (!before && bond.a && bond.b) bond.days += 1;
  w.state.bonds[key] = bond;
}

/** The nearest place to sleep rough. */
export function nearestRough(at: Point): (typeof ROUGH_SPOTS)[number] {
  return ROUGH_SPOTS.reduce((best, s) => (distance(at, s.at) < distance(at, best.at) ? s : best));
}

/** Whether they're somewhere to sleep rough: anywhere on the jetty or in the kopitiam, or under the eaves. */
export function atRoughSpot(w: World, r: Resident): boolean {
  return w.isAt(r, 'jetty') || w.isAt(r, 'kopitiam') || distance(r.pos, ROUGH_SPOTS[2]!.at) <= 1;
}

/** Where they'd lie down: home, or with none, somewhere sheltered. */
export function canSleepHere(w: World, r: Resident): boolean {
  return r.homeId ? w.isAt(r, r.homeId) : atRoughSpot(w, r);
}

/** Lines about their household, marriage and open offers, for what they perceive. Only what applies. */
export function householdLines(w: World, r: Resident): string[] {
  const lines: string[] = [];
  const name = (id: string) => w.resident(id).name;
  if (!r.homeId) lines.push("You've nowhere of your own to sleep.");
  else {
    const house = houseOf(w, r.homeId);
    if (house?.holderId && house.holderId !== r.id) {
      const head = w.resident(house.holderId);
      const kin = kinOf(r, head);
      lines.push(`You live in ${kin ? `${kin} ${head.name}'s` : `${head.name}'s`} house.`);
    }
    const others = livingIn(w, r.homeId, r.id).filter((o) => o.id !== house?.holderId);
    if (others.length) lines.push(`${others.map((o) => o.name).join(' and ')} ${others.length > 1 ? 'live' : 'lives'} with you.`);
  }
  if (r.spouseId) lines.push(`You're married to ${name(r.spouseId)}.`);
  for (const o of w.state.homeOffers.filter((x) => x.toId === r.id)) {
    lines.push(`${name(o.fromId)} says you can come and live in ${w.placeName(w.home({ ...r, homeId: o.houseId })!)}.`);
  }
  for (const p of w.state.proposals.filter((x) => x.toId === r.id)) lines.push(`${name(p.fromId)} has asked to marry you.`);
  return lines;
}
