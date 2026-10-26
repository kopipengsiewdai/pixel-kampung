/**
 * Trust and fondness (docs/design/relationships.md): each resident's view of
 * each person they know, kept one way per pair, moved only by deeds. Scripted
 * and free. Residents see it in words, never numbers.
 */
import { CAST, kinOf } from '../seed/cast.ts';
import type { GameEvent } from './events.ts';
import type { Bond, World, WorldState } from './state.ts';
import { dayIndex, minuteOfDay } from './time.ts';

const LIMIT = 100;
/** A talked-of deal that nothing has backed for this long costs the speaker trust. */
export const BROKEN_WORD_MINUTES = 60;
/** Fondness from talk, a day, at most. */
export const TALK_WARMTH_A_DAY = 3;

const keyOf = (a: string, b: string) => `${a}>${b}`;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Old friends their cards name, both ways. */
const FRIENDS: readonly [string, string][] = CAST.flatMap((c) => (c.friends ?? []).map((f) => [slug(c.name), slug(f)] as [string, string]));

/** Where a's view of b starts: family dear and trusted, old friends friends, anyone else neutral. */
export function startingBond(a: string, b: string): Bond {
  if (kinOf(a).some((k) => k.id === b)) return { trust: 50, fondness: 75, day: 0, talk: 0, traded: false };
  if (FRIENDS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return { trust: 40, fondness: 40, day: 0, talk: 0, traded: false };
  return { trust: 0, fondness: 0, day: 0, talk: 0, traded: false };
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
  const bond = (w.state.bonds[keyOf(a, b)] ??= startingBond(a, b));
  if (bond.day !== today) {
    bond.day = today;
    bond.talk = 0;
    bond.traded = false;
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

/** A trade or sale between two: trust both ways, once a day. */
function dealt(w: World, a: string, b: string): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    if (!w.state.residents.some((r) => r.id === x) || !w.state.residents.some((r) => r.id === y) || x === y) continue;
    const bond = bondOf(w, x, y);
    if (bond.traded) continue;
    bond.traded = true;
    feel(w, x, y, 3, 0);
  }
}

/** What a deed does to the views of those it was done to (the table in relationships.md). */
export function deed(w: World, e: GameEvent): void {
  switch (e.type) {
    case 'gave': {
      const worth = e.cents + e.qty * 30;
      feel(w, e.to, e.who, 2, Math.max(3, Math.min(10, 3 + Math.floor(worth / 50))));
      return;
    }
    case 'helped': feel(w, e.to, e.who, 2, 5); return;
    case 'chore_done': if (e.for) feel(w, e.for, e.who, 2, 5); return;
    case 'errand_done': feel(w, e.for, e.who, 2, 5); return;
    case 'traded': dealt(w, e.who, e.with); return;
    case 'bought': dealt(w, e.who, e.from); return;
    case 'repaid': feel(w, e.to, e.who, 10, 2); return;
    case 'wages_paid': feel(w, e.to, e.who, 5, 1); return;
    case 'lesson_agreed': feel(w, e.who, e.from, 2, 5); return;
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

/** What time does: wages owed past a day's end, and deals talked of that nothing backed. */
export function bondsMinute(w: World): void {
  const mod = minuteOfDay(w.t);
  if (mod === 0) for (const o of w.state.owed) feel(w, o.workerId, o.employerId, -10, -3);
  if (mod % 60 !== 0) return;
  for (const [key, rec] of Object.entries(w.state.talk)) {
    const word = rec.word;
    if (!word || word.broken || w.t - word.t < BROKEN_WORD_MINUTES) continue;
    word.broken = true;
    const [a, b] = key.split('|') as [string, string];
    feel(w, word.by === a ? b : a, word.by, -5, 0);
  }
}

const TRUST_WORDS: [number, (n: string) => string][] = [
  [70, (n) => `You'd trust ${n} with anything.`], [30, (n) => `You trust ${n}.`],
  [-29, () => ''], [-69, (n) => `You're wary of ${n}.`], [-LIMIT, (n) => `You don't trust ${n}.`],
];
const FONDNESS_WORDS: [number, (n: string) => string][] = [
  [70, (n) => `${n} is dear to you.`], [30, (n) => `${n} is a friend.`],
  [-29, () => ''], [-69, (n) => `You don't much like ${n}.`], [-LIMIT, (n) => `You can't stand ${n}.`],
];

/** a's feelings about b, in words; nothing for the middle of either. */
export function feelingWords(bond: Bond, name: string): string[] {
  const pick = (v: number, words: [number, (n: string) => string][]) => words.find(([at]) => v >= at)![1](name);
  return [pick(bond.fondness, FONDNESS_WORDS), pick(bond.trust, TRUST_WORDS)].filter(Boolean);
}
