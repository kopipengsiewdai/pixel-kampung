/**
 * Skills (docs/design/skills.md, S1): getting better at fishing, farming and
 * cooking by doing them. Experience counts finished deeds, so much a day; five
 * levels from Novice (today's odds, yields and times) to Master; rust and
 * fading with disuse; and a Master can show someone how, up to Expert.
 * Residents only ever meet this in words: no level, name or number reaches a
 * prompt. All in the tick, at no cost.
 */
import type { Resident, World } from './state.ts';
import { dayIndex, minuteOfDay } from './time.ts';
import { TRAVELLER_HOURS } from './travellers.ts';

export type SkillId = 'fishing' | 'farming' | 'cooking';
export const SKILL_IDS: readonly SkillId[] = ['fishing', 'farming', 'cooking'];

/** For the wiki and the trial only (watchers, never residents). */
export const LEVEL_NAMES = ['Novice', 'Handy', 'Skilled', 'Expert', 'Master'] as const;

export interface SkillState {
  xp: number;
  /** The highest level reached: past Skilled, nobody fades below Handy. */
  peak: number;
  /** The day they last practised. */
  lastDay: number;
  /** What they've learnt today, against the day's cap. */
  today: { day: number; xp: number };
  rusty: boolean;
  /** Levels lost since they last practised. */
  drops: number;
}

interface Skill {
  /** A good day's practice: deeds past this teach nothing more that day. */
  cap: number;
  /** Deeds to Master: the cap times the days of a lifetime's practice. */
  master: number;
  rustyDays: number;
  dropDays: number;
}

/** Fishing and farming two years at the daily cap, cooking one and a half (owner, 2026-10-25). */
export const SKILLS: Record<SkillId, Skill> = {
  fishing: { cap: 6, master: 6 * 730, rustyDays: 30, dropDays: 365 },
  farming: { cap: 4, master: 4 * 730, rustyDays: 45, dropDays: 365 },
  cooking: { cap: 8, master: 8 * 548, rustyDays: 21, dropDays: 365 },
};

/** Handy at 5%, Skilled at 20%, Expert at 50%, Master at all of it. */
const SHARE = [0, 0.05, 0.2, 0.5, 1];

/** The experience a level starts at (1 to 5). */
export function threshold(s: SkillId, level: number): number {
  return Math.round(SKILLS[s].master * SHARE[level - 1]!);
}

export function levelOf(s: SkillId, xp: number): number {
  let level = 1;
  while (level < 5 && xp >= threshold(s, level + 1)) level++;
  return level;
}

/** Their level at it, as they've earned it. */
export function skillLevel(r: Resident, s: SkillId): number {
  return levelOf(s, r.skills[s]?.xp ?? 0);
}

/** What they can do at it now: a rusty hand works one level down. */
export function effectiveLevel(r: Resident, s: SkillId): number {
  const st = r.skills[s];
  return Math.max(1, skillLevel(r, s) - (st?.rusty ? 1 : 0));
}

/** The words for it: what they do, and what they are. */
const DOING: Record<SkillId, { verb: string; one: string }> = {
  fishing: { verb: 'fish', one: 'fisher' },
  farming: { verb: 'grow vegetables', one: 'grower' },
  cooking: { verb: 'cook', one: 'cook' },
};
const ONE_OF = ['', 'a handy', 'a skilled', 'an expert', 'a master'];

/** "a handy fisher": for the feed. */
export function oneWho(s: SkillId, level: number): string {
  return `${ONE_OF[level - 1]} ${DOING[s].one}`;
}

/** How to do it, in words ("how to fish"). */
export function howTo(s: SkillId): string {
  return `how to ${DOING[s].verb}`;
}

/**
 * Everything a resident is told of their own skill, in words (self: Handy to
 * Master; up: on reaching Handy to Master). Skilled's lines name what it
 * brings: a net, chilli, sambal kangkong.
 */
export const SKILL_LINES: Record<SkillId, { self: string[]; up: string[]; rusty: string; back: string; lost: string }> = {
  fishing: {
    self: ["You're handy with a fishing line.", 'You know how to throw a net.', 'You can read the tides.', 'People say nobody fishes like you.'],
    up: ['The line feels natural in your hands now.', "You've worked out how to throw a net.", "You've started to feel when the tide will turn.", 'You know these waters as well as anyone.'],
    rusty: "It's been a while since you last fished; your hands are slow.",
    back: 'The feel of the line comes back to you.',
    lost: "You've lost some of your feel for the nets.",
  },
  farming: {
    self: ["You've a feel for growing things.", "You've learnt to grow chilli.", 'You know when a bed is at its best.', 'People say nobody grows like you.'],
    up: ["You're getting the knack of the beds.", 'You think you could grow chilli now.', 'You can tell when your kangkong is at its best.', 'The soil does what you ask of it.'],
    rusty: "It's been a while since you last worked a bed; your hands are slow.",
    back: 'The feel of the soil comes back to you.',
    lost: "You've lost some of your feel for the soil.",
  },
  cooking: {
    self: ['You can cook a decent meal.', 'You know your way around a kitchen.', 'You can tell when the crowds will come.', 'People say nobody cooks like you.'],
    up: ['Your cooking is coming along.', "You've worked out how to make sambal kangkong.", "You've started to sense when the crowds will come.", 'Your cooking has become your own.'],
    rusty: "It's been a while since you last cooked; your hands are slow.",
    back: 'The feel of the stove comes back to you.',
    lost: "You've lost some of your feel for the stove.",
  },
};

/** Lines worth remembering well (a level reached): memory importance 7. */
export const LEVEL_UP_LINES: ReadonlySet<string> = new Set(SKILL_IDS.flatMap((s) => SKILL_LINES[s].up));

/** A fresh skill, as of today. */
function fresh(w: World): SkillState {
  const day = dayIndex(w.t);
  return { xp: 0, peak: 1, lastDay: day, today: { day, xp: 0 }, rusty: false, drops: 0 };
}

/**
 * Deeds done at a skill: experience up to the day's cap (twice it, at twice
 * the pace, in a lesson that can still teach them), rust cleared by a good
 * day's practice, and a new level told.
 */
export function practise(w: World, r: Resident, s: SkillId, deeds = 1): void {
  const st = (r.skills[s] ??= fresh(w));
  const day = dayIndex(w.t);
  if (st.today.day !== day) st.today = { day, xp: 0 };
  st.lastDay = day;
  st.drops = 0;
  const before = levelOf(s, st.xp);
  const lesson = before < 4 ? activeLesson(w, r, s) : null;
  const pace = lesson ? 2 : 1;
  const gain = Math.max(0, Math.min(deeds * pace, SKILLS[s].cap * pace - st.today.xp));
  st.today.xp += gain;
  st.xp += gain;
  if (lesson && st.xp >= threshold(s, 4)) {
    // A lesson takes someone as far as Expert; the rest is their own.
    st.xp = threshold(s, 4);
    w.state.lessons = w.state.lessons.filter((l) => l !== lesson);
    w.notify(r.id, `You've learnt all ${w.resident(lesson.teacherId).name} can show you; the rest is up to you.`);
  }
  if (st.rusty && st.today.xp >= SKILLS[s].cap) {
    st.rusty = false;
    w.notify(r.id, SKILL_LINES[s].back);
  }
  const after = levelOf(s, st.xp);
  if (after > before) {
    st.peak = Math.max(st.peak, after);
    w.notify(r.id, SKILL_LINES[s].up[after - 2]!);
    w.emit({ type: 'skill_up', who: r.id, skill: s, level: after });
  }
}

/**
 * Disuse, checked any time (each midnight, and after a quiet skip): rusty
 * after a while, a level lost after a year, then one more each year, never
 * below Handy once Skilled was reached. A Novice has nothing to lose.
 */
export function fadeSkills(w: World): void {
  const day = dayIndex(w.t);
  for (const r of w.state.residents) {
    for (const s of SKILL_IDS) {
      const st = r.skills[s];
      if (!st || levelOf(s, st.xp) < 2) continue;
      const unused = day - st.lastDay;
      if (!st.rusty && unused >= SKILLS[s].rustyDays) {
        st.rusty = true;
        w.notify(r.id, SKILL_LINES[s].rusty);
      }
      const floor = st.peak >= 3 ? 2 : 1;
      while (st.drops < Math.floor(unused / SKILLS[s].dropDays)) {
        st.drops++;
        const level = levelOf(s, st.xp);
        if (level <= floor) continue;
        st.xp = threshold(s, level - 1);
        w.notify(r.id, SKILL_LINES[s].lost);
        w.emit({ type: 'skill_lost', who: r.id, skill: s, level: level - 1 });
      }
    }
  }
}

/**
 * A hook for a change of tools (the motor boat, the gas stove): everyone who
 * has the skill goes rusty at once and finds out in-world. Called by the
 * upgrade step that brings the change; not used yet.
 */
export function toolsChange(w: World, s: SkillId): void {
  for (const r of w.state.residents) {
    const st = r.skills[s];
    if (st && levelOf(s, st.xp) >= 2) st.rusty = true;
  }
}

/** For watchers (the wiki): each skill they have, by level name, how far to the next, and whether they've gone rusty. */
export function skillsView(r: Resident): { skill: SkillId; level: string; toNext: number | null; rusty: boolean }[] {
  return SKILL_IDS.filter((s) => (r.skills[s]?.xp ?? 0) > 0).map((s) => {
    const xp = r.skills[s]!.xp;
    const level = levelOf(s, xp);
    const toNext = level === 5 ? null : Math.min(99, Math.round((100 * (xp - threshold(s, level))) / (threshold(s, level + 1) - threshold(s, level))));
    return { skill: s, level: LEVEL_NAMES[level - 1]!, toNext, rusty: !!r.skills[s]!.rusty };
  });
}

// What each level does (S1: the Handy and Expert effects, and fishing's odds).

/** The chance a line comes up empty, by level, outside the tides. Novice is today's 30%. */
const EMPTY_LINE = [0.3, 0.25, 0.2, 0.15, 0.1];
/** The tides, when the fish bite well: [from, to) minutes of the day. */
const TIDES = [
  { from: 6 * 60, to: 9 * 60, line: 'The morning tide is coming in: the fish will bite well until nine.' },
  { from: 17 * 60, to: 19 * 60, line: 'The evening tide is coming in: the fish will bite well until seven.' },
];

/** An empty line's chance at this level and minute of the day: half as often at a tide. */
export function emptyChance(level: number, mod: number): number {
  const base = EMPTY_LINE[level - 1]!;
  return TIDES.some((t) => mod >= t.from && mod < t.to) ? base / 2 : base;
}

/** A Handy grower's harvest: one more a bed. */
export const HANDY_YIELD = 1;
/** Any bed harvested the day it ripens gives this many more. */
export const BEST_DAY_YIELD = 2;
/** A Handy cook's batch takes this share of the time. */
export const HANDY_COOK = 0.8;

/** Minutes before each of the kopitiam's busy hours that an Expert cook senses it. */
const CROWD_AHEAD = 45;
const CROWD_NAMES: Record<number, string> = { [6 * 60 + 30]: 'morning', [12 * 60]: 'noon', [18 * 60]: 'evening' };

/** An Expert's sense of the moment: the tide coming in, or the crowd from the road. */
function knack(w: World, r: Resident): string[] {
  const mod = minuteOfDay(w.t);
  const out: string[] = [];
  if (effectiveLevel(r, 'fishing') >= 4) {
    const tide = TIDES.find((t) => mod >= t.from - 30 && mod < t.to);
    if (tide) out.push(tide.line);
  }
  if (effectiveLevel(r, 'cooking') >= 4) {
    const start = (TRAVELLER_HOURS.kopitiam?.busy ?? []).map(([a]) => a).find((a) => mod >= a - CROWD_AHEAD && mod < a);
    if (start !== undefined) out.push(`The ${CROWD_NAMES[start] ?? 'next'} crowd from the road will be in soon.`);
  }
  if (effectiveLevel(r, 'farming') >= 4) {
    const day = dayIndex(w.t);
    for (const b of w.state.beds) if (b.planterId === r.id && b.readyDay === day) out.push(`Bed ${b.n} is at its best today.`);
  }
  return out;
}

/** Whether the next of the kopitiam's crowds is coming soon, as an Expert cook would sense it (for the fake brain). */
export function crowdSoon(w: World, r: Resident): boolean {
  return knack(w, r).some((l) => l.includes('crowd'));
}

// Teaching.

export interface Lesson { id: number; teacherId: string; learnerId: string; skill: SkillId; day: number }
export interface LessonOffer { id: number; teacherId: string; learnerId: string; skill: SkillId; expires: number }

/** An offer to teach waits this long. */
export const LESSON_OFFER_MINUTES = 30;

/** The skill someone named ("fishing", "how to cook", "the beds"), or null. */
export function skillOf(v: unknown): SkillId | null {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase();
  if (/fish|line|net/.test(s)) return 'fishing';
  if (/farm|grow|plant|bed|vegetable|kangkong|soil/.test(s)) return 'farming';
  if (/cook|kitchen|stove|kopi|porridge|rice/.test(s)) return 'cooking';
  return null;
}

/** The skills r could teach: those they've mastered. */
export function mastered(r: Resident): SkillId[] {
  return SKILL_IDS.filter((s) => skillLevel(r, s) === 5);
}

/** A lesson that's on for r at this skill right now: today's, with the teacher here and awake. */
function activeLesson(w: World, r: Resident, s: SkillId): Lesson | null {
  const day = dayIndex(w.t);
  const here = w.placeOf(r)?.id ?? null;
  return w.state.lessons.find((l) => {
    if (l.learnerId !== r.id || l.skill !== s || l.day !== day || !here) return false;
    const t = w.resident(l.teacherId);
    return w.placeOf(t)?.id === here && !w.isAsleep(t);
  }) ?? null;
}

/** Offers lapse; lessons end with the day. */
export function lapseLessons(w: World): void {
  const day = dayIndex(w.t);
  for (const o of w.state.lessonOffers.filter((x) => x.expires <= w.t)) {
    w.notify(o.teacherId, `${w.resident(o.learnerId).name} didn't take up your offer to show them ${howTo(o.skill)}.`);
  }
  w.state.lessonOffers = w.state.lessonOffers.filter((x) => x.expires > w.t);
  w.state.lessons = w.state.lessons.filter((l) => l.day === day);
}

/** Everything r is told of skills each moment, in words: who they are at it, rust, a lesson, an Expert's sense of the moment. */
export function skillLines(w: World, r: Resident): string[] {
  const out: string[] = [];
  for (const s of SKILL_IDS) {
    const level = skillLevel(r, s);
    if (level >= 2) out.push(SKILL_LINES[s].self[level - 2]!);
    if (r.skills[s]?.rusty) out.push(SKILL_LINES[s].rusty);
  }
  for (const o of w.state.lessonOffers) {
    if (o.learnerId === r.id) out.push(`${w.resident(o.teacherId).name} offers to show you ${howTo(o.skill)}.`);
    if (o.teacherId === r.id) out.push(`You've offered to show ${w.resident(o.learnerId).name} ${howTo(o.skill)}.`);
  }
  const day = dayIndex(w.t);
  for (const l of w.state.lessons) {
    if (l.day !== day) continue;
    if (l.learnerId === r.id && activeLesson(w, r, l.skill)) out.push(`${w.resident(l.teacherId).name} is showing you ${howTo(l.skill)}.`);
    const learner = w.resident(l.learnerId);
    if (l.teacherId === r.id && activeLesson(w, learner, l.skill)) out.push(`You're showing ${learner.name} ${howTo(l.skill)}.`);
  }
  out.push(...knack(w, r));
  return out;
}
