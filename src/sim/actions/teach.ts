/**
 * A Master showing someone how (docs/design/skills.md, teaching): an offer the
 * learner agrees to or turns down, like a loan; once agreed, a lesson for the
 * rest of the day that counts while the two are together.
 */
import { dayIndex } from '../time.ts';
import { howTo, LESSON_OFFER_MINUTES, mastered, skillLevel, skillOf, type LessonOffer, type SkillId } from '../skills.ts';
import type { Resident, World } from '../state.ts';
import { type ActionResult, type Intent, no, ok, personNearby } from './common.ts';

/** What they could show someone, in their own words. */
function couldShow(r: Resident): string {
  const ways = mastered(r).map(howTo);
  return ways.length === 1 ? ways[0]! : `${ways.slice(0, -1).join(', ')} or ${ways.at(-1)}`;
}

export function teach(w: World, r: Resident, i: Intent): ActionResult {
  const own = mastered(r);
  if (!own.length) return no("You don't know anything well enough to teach it.");
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const named = skillOf(i.item ?? i.text);
  const s: SkillId | null = named ?? (own.length === 1 ? own[0]! : null);
  if (!s) return no(`You could show someone ${couldShow(r)}. Which?`);
  if (!own.includes(s)) return no(`You don't know ${s} well enough to teach it.`);
  if (skillLevel(o, s) >= 4) return no(`${o.name} knows as much as you could show.`);
  const day = dayIndex(w.t);
  if (w.state.lessons.some((l) => l.teacherId === r.id && l.learnerId === o.id && l.skill === s && l.day === day)) {
    return no(`You're already showing ${o.name} ${howTo(s)} today.`);
  }
  w.state.lessonOffers = w.state.lessonOffers.filter((x) => !(x.teacherId === r.id && x.learnerId === o.id));
  w.state.lessonOffers.push({ id: w.nextId(), teacherId: r.id, learnerId: o.id, skill: s, expires: w.t + LESSON_OFFER_MINUTES });
  w.emit({ type: 'lesson_offered', who: r.id, to: o.id, skill: s });
  w.notify(o.id, `${r.name} offers to show you ${howTo(s)}.`);
  return ok(`You offer to show ${o.name} ${howTo(s)}.`);
}

/** The offer to teach that someone named has made r, if any. */
export function lessonFrom(w: World, r: Resident, from: unknown): LessonOffer | null {
  const o = w.residentByName(from, r);
  return o ? w.state.lessonOffers.find((x) => x.teacherId === o.id && x.learnerId === r.id) ?? null : null;
}

export function takeLesson(w: World, r: Resident, x: LessonOffer): ActionResult {
  const teacher = w.resident(x.teacherId);
  const near = personNearby(w, r, teacher.name);
  if (typeof near === 'string') return no(near);
  w.state.lessonOffers = w.state.lessonOffers.filter((y) => y.id !== x.id);
  w.state.lessons.push({ id: w.nextId(), teacherId: teacher.id, learnerId: r.id, skill: x.skill, day: dayIndex(w.t) });
  w.emit({ type: 'lesson_agreed', who: r.id, from: teacher.id, skill: x.skill });
  w.notify(teacher.id, `${r.name} would like you to show them ${howTo(x.skill)}.`);
  return ok(`${teacher.name} will show you ${howTo(x.skill)} today, while you're together.`);
}

export function refuseLesson(w: World, r: Resident, x: LessonOffer): ActionResult {
  const teacher = w.resident(x.teacherId);
  w.state.lessonOffers = w.state.lessonOffers.filter((y) => y.id !== x.id);
  w.emit({ type: 'lesson_refused', who: r.id, from: teacher.id, skill: x.skill });
  w.notify(teacher.id, `${r.name} doesn't want to learn ${howTo(x.skill)} just now.`);
  return ok(`You tell ${teacher.name} not just now.`);
}
