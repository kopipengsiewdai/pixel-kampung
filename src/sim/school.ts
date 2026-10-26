/**
 * The kampung school (docs/design/school.md): a schoolhouse Mr Lim has built
 * through odd jobs, and Miss de Souza, a teacher from town (a village
 * character, her day scripted from the clock). Children of school age are
 * sent to school on weekday mornings, eight to twelve, free; grown-ups may
 * join an English class at seven in the evening for five cents. English is a
 * skill like any other, and it pays.
 */
import { type ActionResult, no, ok } from './actions/common.ts';
import { FAINT_HUNGER } from './perception.ts';
import { weekdayAt } from './calendar.ts';
import { findPath, PLACE_BY_ID, type Point } from './map.ts';
import { formatMoney, type Cents } from './money.ts';
import { isBuilt } from './projects.ts';
import { practise } from './skills.ts';
import { GROWN_AGE, TEACHER_ID, type Resident, type World } from './state.ts';
import { dayIndex, minuteOfDay, MINUTES_PER_DAY, SGT_OFFSET_MIN } from './time.ts';

export const SCHOOL_ID = 'schoolhouse';
export const TEACHER = 'Miss de Souza';
export { TEACHER_ID };
/** She's there from a quarter to eight until ten past eight in the evening, on weekdays. */
export const TEACHER_FROM = 7 * 60 + 45;
export const TEACHER_TO = 20 * 60 + 10;
/** Children are sent off at twenty to eight; school is eight to twelve. */
export const SEND_AT = 7 * 60 + 40;
export const SCHOOL_FROM = 8 * 60;
export const SCHOOL_TO = 12 * 60;
/** The grown-ups' class: seven to eight, joined from a quarter to seven to a quarter past. */
export const CLASS_FROM = 19 * 60;
export const CLASS_TO = 20 * 60;
export const JOIN_FROM = 18 * 60 + 45;
export const JOIN_TO = 19 * 60 + 15;
export const CLASS_FEE: Cents = 5;
/** Children this old and up go to school (until they're grown). */
export const SCHOOL_AGE = 6;
/** A lesson teaches something every half hour. */
export const LEARN_EVERY = 30;

const SPOT: Point = PLACE_BY_ID.get(SCHOOL_ID)!.spot;
const dayStart = (t: number) => dayIndex(t) * MINUTES_PER_DAY - SGT_OFFSET_MIN;
const isWeekday = (w: World, t: number) => !['Saturday', 'Sunday'].includes(weekdayAt(w.state, t));

/** Open from the day after it was built. */
export function schoolOpen(w: World, t = w.t): boolean {
  const p = w.state.projects.find((x) => x.id === SCHOOL_ID);
  return isBuilt(w, SCHOOL_ID) && p!.builtDay! < dayIndex(t);
}

/** Where Miss de Souza is at minute t, what she's doing, and whether she's out to be seen. */
export function teacherAt(w: World, t: number): { pos: Point; doing: string; out: boolean } {
  const mod = minuteOfDay(t);
  if (!schoolOpen(w, t) || !isWeekday(w, t) || mod < TEACHER_FROM || mod >= TEACHER_TO) return { pos: SPOT, doing: 'away in town', out: false };
  const doing = mod >= SCHOOL_FROM && mod < SCHOOL_TO ? 'teaching the children'
    : mod >= CLASS_FROM && mod < CLASS_TO ? 'teaching the evening class' : 'at the schoolhouse';
  return { pos: SPOT, doing, out: true };
}

const ofSchoolAge = (w: World, r: Resident) => w.ageOf(r) >= SCHOOL_AGE && w.ageOf(r) < GROWN_AGE;

function begin(w: World, r: Resident, adult: boolean, until: number): void {
  r.activity = { kind: 'school', until, adult, learnt: 0 };
}

/** The last a child is sent off: an hour before school ends. */
export const SEND_UNTIL = SCHOOL_TO - 60;

/**
 * Each minute of a weekday morning: children of school age, well and not
 * faint with hunger, are sent off to school once they're free (from twenty to
 * eight), and start their lessons as soon as they're there, so they stay.
 */
export function schoolMinute(w: World): void {
  if (!schoolOpen(w) || !isWeekday(w, w.t)) return;
  const mod = minuteOfDay(w.t);
  if (mod < SEND_AT || mod >= SCHOOL_TO) return;
  for (const r of w.state.residents) {
    if (!ofSchoolAge(w, r) || r.ill || r.hunger >= FAINT_HUNGER || r.activity || r.stove) continue;
    if (w.isAt(r, SCHOOL_ID)) {
      begin(w, r, false, dayStart(w.t) + SCHOOL_TO);
      w.remember(r.id, `${TEACHER} has the children sit down for their lessons.`);
    } else if (mod < SEND_UNTIL) {
      // Off to school, as families sent their children.
      r.activity = { kind: 'walking', path: findPath(r.pos, SPOT) ?? [], dest: SCHOOL_ID, thenSleep: false };
      w.remember(r.id, "It's a school morning: you're sent off to the schoolhouse.");
    }
  }
}

/** A minute at school: English every half hour, and home time at the end. */
export function schoolProgress(w: World, r: Resident): void {
  const a = r.activity;
  if (a?.kind !== 'school') return;
  a.learnt += 1;
  if (a.learnt % LEARN_EVERY === 0) practise(w, r, 'english', 1);
  // Faint with hunger, a child can't keep their mind on lessons, and is let go.
  if (!a.adult && r.hunger >= FAINT_HUNGER) {
    r.activity = null;
    r.thinkAt = Math.min(r.thinkAt, w.t);
    w.remember(r.id, `You're too faint with hunger to keep your mind on the lessons, and ${TEACHER} lets you go.`);
    return;
  }
  if (w.t < a.until) return;
  r.activity = null;
  r.thinkAt = Math.min(r.thinkAt, w.t);
  w.remember(r.id, a.adult ? 'The English class is over for tonight.' : 'School is over for the day.');
}

/** Whether r could join tonight's class here, now. */
export function canJoinClass(w: World, r: Resident): boolean {
  const mod = minuteOfDay(w.t);
  return schoolOpen(w) && isWeekday(w, w.t) && w.isAt(r, SCHOOL_ID) && w.ageOf(r) >= GROWN_AGE && mod >= JOIN_FROM && mod < JOIN_TO;
}

export function joinClass(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, SCHOOL_ID)) return no('The English class is at the schoolhouse.');
  if (!canJoinClass(w, r)) return no('There is no class for grown-ups just now. It is at seven in the evening, on weekdays.');
  if (r.money < CLASS_FEE) return no(`A lesson is ${formatMoney(CLASS_FEE)}, and you haven't that much.`);
  w.transfer(r.id, TEACHER_ID, CLASS_FEE, 'an English lesson');
  begin(w, r, true, dayStart(w.t) + CLASS_TO);
  w.emit({ type: 'joined_class', who: r.id });
  return ok(`You pay ${TEACHER} ${formatMoney(CLASS_FEE)} and sit down for the English lesson.`);
}

/** What someone sees of the school where they are. */
export function schoolLines(w: World, r: Resident): string[] {
  const out: string[] = [];
  const m = teacherAt(w, w.t);
  if (m.out && w.isAt(r, SCHOOL_ID)) out.push(`${TEACHER}, the teacher, is here, ${m.doing}.`);
  if (canJoinClass(w, r) && r.activity?.kind !== 'school') out.push(`The evening English class is about to start: ${formatMoney(CLASS_FEE)} a lesson.`);
  return out;
}
