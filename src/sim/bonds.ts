/**
 * Trust and fondness (docs/design/relationships.md): each resident's view of
 * each person they know, kept one way per pair, moved only by deeds. Scripted
 * and free. Residents see it in words, never numbers.
 */
import { CAST, kinOf } from '../seed/cast.ts';
import type { GameEvent } from './events.ts';
import type { Bond, World, WorldState } from './state.ts';
import { dayIndex, isNight, minuteOfDay } from './time.ts';

const LIMIT = 100;
/** A talked-of deal that nothing has backed for this many waking minutes costs the speaker trust. */
export const BROKEN_WORD_MINUTES = 60;
/** The least a gift is worth to count (a cent or two is no gift). */
export const GIFT_FLOOR = 10;
/** Shown for at most this many people nearby, the strongest feelings first. */
export const FEELINGS_SHOWN = 4;
/** Fondness from talk, a day, at most. */
export const TALK_WARMTH_A_DAY = 3;

const keyOf = (a: string, b: string) => `${a}>${b}`;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Old friends their cards name, both ways. */
const FRIENDS: readonly [string, string][] = CAST.flatMap((c) => (c.friends ?? []).map((f) => [slug(c.name), slug(f)] as [string, string]));

/** Where a's view of b starts: family dear and trusted, old friends friends, anyone else neutral. */
export function startingBond(a: string, b: string): Bond {
  if (kinOf(a).some((k) => k.id === b)) return { trust: 50, fondness: 60, day: 0, talk: 0, counted: [] };
  if (FRIENDS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return { trust: 40, fondness: 40, day: 0, talk: 0, counted: [] };
  return { trust: 0, fondness: 0, day: 0, talk: 0, counted: [] };
}

/** Every view a town starts with: one for each person each resident already knows. */
export function seedBonds(state: Pick<WorldState, 'residents'>): Record<string, Bond> {
  const out: Record<string, Bond> = {};
  for (const r of state.residents) for (const b of r.knownPeople) out[keyOf(r.id, b)] = startingBond(r.id, b);
  return out;
}

/** a's view of b, made when first needed (someone just met starts at nothing either way). */
export function bondOf(w: World, a: string, b: string): Bond {
  const today = dayIndex(w.t);
  const bond = ((w.state.bonds ??= {})[keyOf(a, b)] ??= startingBond(a, b));
  if (bond.day !== today) {
    bond.day = today;
    bond.talk = 0;
    bond.counted = [];
  }
  return bond;
}

/** Moves a's view of b, within bounds. */
export function feel(w: World, a: string, b: string, trust: number, fondness: number): void {
  if (a === b || !w.state.residents.some((r) => r.id === a) || !w.state.residents.some((r) => r.id === b)) return;
  const bond = bondOf(w, a, b);
  bond.trust = Math.max(-LIMIT, Math.min(LIMIT, bond.trust + trust));
  bond.fondness = Math.max(-LIMIT, Math.min(LIMIT, bond.fondness + fondness));
}

/** A deed of a kind counts once a day for each pair, so a stream of small ones can't buy trust. */
function once(w: World, a: string, b: string, kind: string, trust: number, fondness: number): void {
  if (a === b || !w.state.residents.some((r) => r.id === a) || !w.state.residents.some((r) => r.id === b)) return;
  const bond = bondOf(w, a, b);
  if (bond.counted.includes(kind)) return;
  bond.counted.push(kind);
  feel(w, a, b, trust, fondness);
}

/** A trade or sale between two: trust both ways, once a day. */
function dealt(w: World, a: string, b: string): void {
  once(w, a, b, 'deal', 3, 0);
  once(w, b, a, 'deal', 3, 0);
}

/** What a deed does to the views of those it was done to (the table in relationships.md). */
export function deed(w: World, e: GameEvent): void {
  switch (e.type) {
    case 'gave': {
      const worth = e.cents + e.qty * 30;
      if (worth >= GIFT_FLOOR) once(w, e.to, e.who, 'gift', 2, Math.max(3, Math.min(10, 3 + Math.floor(worth / 50))));
      return;
    }
    case 'helped': once(w, e.to, e.who, 'help', 2, 5); return;
    case 'chore_done': if (e.for) once(w, e.for, e.who, 'help', 2, 5); return;
    case 'errand_done': once(w, e.for, e.who, 'errand', 2, 5); return;
    case 'traded': dealt(w, e.who, e.with); return;
    case 'bought': dealt(w, e.who, e.from); return;
    case 'sold': dealt(w, e.who, e.to); return;
    // The full warmth when it's all paid back; a little for paying some.
    case 'repaid': once(w, e.to, e.who, 'repaid', e.stillOwed === 0 ? 10 : 3, e.stillOwed === 0 ? 2 : 0); return;
    case 'wages_paid': once(w, e.to, e.who, 'wages', e.stillOwed === 0 ? 5 : 2, 1); return;
    case 'lesson_agreed': once(w, e.who, e.from, 'lesson', 2, 5); return;
    case 'debt_refused': if (e.kind === 'borrow') feel(w, e.from, e.who, 0, -3); return;
    case 'said': {
      if (!e.to || e.to === e.who || !w.state.residents.some((r) => r.id === e.to)) return;
      const bond = bondOf(w, e.to, e.who);
      if (bond.talk >= TALK_WARMTH_A_DAY) return;
      bond.talk += 1;
      feel(w, e.to, e.who, 0, 1);
      return;
    }
    default:
  }
}

/** What time does: wages left unpaid a whole waking day, and deals talked of that nothing backed. */
export function bondsMinute(w: World): void {
  const mod = minuteOfDay(w.t);
  // At midnight: wages owed since before yesterday (a whole day in which they could have been paid).
  if (mod === 0) {
    const today = dayIndex(w.t);
    for (const o of w.state.owed) if (o.cents > 0 && o.since !== undefined && o.since <= today - 2) feel(w, o.workerId, o.employerId, -10, -3);
  }
  // Waking minutes only: nothing can be put right in the night or while the town was away.
  if (isNight(w.t)) return;
  for (const [key, rec] of Object.entries(w.state.talk)) {
    const word = rec.word;
    if (!word || word.broken) continue;
    word.awake = (word.awake ?? 0) + 1;
    if (word.awake < BROKEN_WORD_MINUTES) continue;
    word.broken = true;
    // "All paid" may come from the one who was owed: no telling who let whom down, so nobody's trust moves.
    if (word.kind === 'paying') continue;
    const [a, b] = key.split('|') as [string, string];
    feel(w, word.by === a ? b : a, word.by, -5, 0);
  }
}

const TRUST_WORDS: [number, (n: string) => string][] = [
  [70, (n) => `you'd trust ${n} with anything`], [30, (n) => `you trust ${n}`],
  [-29, () => ''], [-69, (n) => `you're wary of ${n}`], [-LIMIT, (n) => `you don't trust ${n}`],
];
const FONDNESS_WORDS: [number, (n: string) => string][] = [
  [70, (n) => `${n} is dear to you`], [30, (n) => `you're fond of ${n}`],
  [-29, () => ''], [-69, (n) => `you don't much like ${n}`], [-LIMIT, (n) => `you can't stand ${n}`],
];

/** a's feelings about b in one line ("Rahim is dear to you, and you trust Rahim."); null for the middle of both. */
export function feelingLine(bond: Bond, name: string): string | null {
  const pick = (v: number, words: [number, (n: string) => string][]) => words.find(([at]) => v >= at)![1](name);
  const parts = [pick(bond.fondness, FONDNESS_WORDS), pick(bond.trust, TRUST_WORDS)].filter(Boolean);
  if (!parts.length) return null;
  const text = parts.join(', and ');
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
}

/** How strongly a's feelings run either way, to show the strongest first. */
export const strength = (b: Bond) => Math.abs(b.trust) + Math.abs(b.fondness);
