/**
 * Mr Lim the village head's body, and his paid odd jobs (village-characters.md,
 * subsistence.md Q3.1). His day is scripted and follows the clock alone, so
 * nothing about where he is needs saving: indoors before a quarter past seven
 * and from six in the evening, out to the notice board each morning to pin the
 * day's odd jobs, round the houses on Monday morning for the rent, and
 * otherwise at his door. His thinking head comes later.
 *
 * Odd jobs: two or three a day, each an hour's work at its place, paid on
 * completion from his own purse (`MR_LIM_ID`, outside the town), so money
 * comes into the kampung through work. At most one a day each.
 */
import { WALK_TILES_PER_MINUTE } from './activities.ts';
import { weekdayAt } from './calendar.ts';
import { findPath, isWalkable, PLACE_BY_ID, type Point } from './map.ts';
import { formatMoney, type Cents } from './money.ts';
import { Rng } from './rng.ts';
import { GROWN_AGE, MR_LIM_ID, type Resident, type World } from './state.ts';
import { dayIndex, minuteOfDay } from './time.ts';
import { skillLevel } from './skills.ts';
import { PROJECT_JOBS, PROJECT_JOBS_A_DAY, PROJECT_NAMES, PROJECTS, projectJobDone, projectJobOf, projectKind } from './projects.ts';

export const MR_LIM = 'Mr Lim';
/** He sets out for the notice board at a quarter past seven. */
export const PIN_FROM = 7 * 60 + 15;
/** He stays at the board this long, pinning. */
export const PIN_STAY = 10;
/** Indoors for the evening from six. */
export const IN_AT = 18 * 60;
/** The Monday rent round (src/sim/households.ts runs it at the same minute). */
export const ROUND_FROM = 9 * 60;
/** Too late in the day to post jobs (a town that wakes up after this waits for tomorrow's). */
export const LAST_POST = 17 * 60;
export const ODD_JOB_PAY: Cents = 50;
export const ODD_JOB_MINUTES = 60;
/** The most notes the board holds (as pin_note keeps it). */
const BOARD_MAX = 12;

/** What he might want doing, each at its own place. */
export const ODD_JOB_KINDS: readonly { kind: string; placeId: string; what: string }[] = [
  { kind: 'mend_jetty', placeId: 'jetty', what: 'mend the jetty planks' },
  { kind: 'clear_path', placeId: 'village-head', what: "clear the path up to the village head's house" },
  { kind: 'sweep_stop', placeId: 'lorry-stop', what: 'sweep the lorry stop' },
  { kind: 'clean_well', placeId: 'well', what: "scrub out the well's trough" },
  { kind: 'clear_ditch', placeId: 'farm', what: 'clear the ditches past the farm plot' },
];

/** A better-paid job for someone with good English (school.md): keeping Mr Lim's ledger, at his house. */
export const LEDGER_JOB = { kind: 'keep_ledger', placeId: 'village-head', what: "keep Mr Lim's ledger", pay: 100, english: 3 } as const;

/** Whether r is fit for a job (the ledger wants good English). */
export const fitFor = (w: World, r: Resident, kind: string) => kind !== LEDGER_JOB.kind || (w.ageOf(r) >= GROWN_AGE && skillLevel(r, 'english') >= LEDGER_JOB.english);

const pts = (from: Point, to: Point): Point[] => [from, ...(findPath(from, to) ?? [])];
const minutes = (path: Point[]) => Math.ceil((path.length - 1) / WALK_TILES_PER_MINUTE);
const along = (path: Point[], e: number): Point => path[Math.min(path.length - 1, e * WALK_TILES_PER_MINUTE)]!;

/** Where he stands by day: on the doorstep, just below his house. */
const DOOR: Point = (() => {
  const h = PLACE_BY_ID.get('village-head')!;
  const step = { x: h.spot.x, y: h.rect.y + h.rect.h };
  return isWalkable(step.x, step.y) ? step : h.spot;
})();
const BOARD = PLACE_BY_ID.get('notice-board')!.spot;
const TO_BOARD = pts(DOOR, BOARD);
const FROM_BOARD = pts(BOARD, DOOR);
/** Past each house's doorstep, along the top row, and home. */
const ROUND: Point[] = (() => {
  const stops = Array.from({ length: 10 }, (_, i) => {
    const h = PLACE_BY_ID.get(`house-${i + 1}`)!;
    return { x: h.spot.x, y: h.rect.y + h.rect.h };
  });
  const out: Point[] = [DOOR];
  for (const s of [...stops, DOOR]) out.push(...(findPath(out.at(-1)!, s) ?? []));
  return out;
})();

/** The minute of the day he reaches the board and pins the day's jobs. */
export const PIN_AT = PIN_FROM + minutes(TO_BOARD);

/** Where Mr Lim is at minute t, what he's doing, and whether he's out to be seen. */
export function mrLimAt(w: World, t: number): { pos: Point; doing: string; out: boolean } {
  const mod = minuteOfDay(t);
  if (mod < PIN_FROM || mod >= IN_AT) return { pos: DOOR, doing: 'indoors', out: false };
  const e = mod - PIN_FROM;
  const there = minutes(TO_BOARD);
  if (e < there) return { pos: along(TO_BOARD, e), doing: 'on his way to the notice board', out: true };
  if (e < there + PIN_STAY) return { pos: BOARD, doing: 'pinning notices on the board', out: true };
  if (e < there + PIN_STAY + minutes(FROM_BOARD)) return { pos: along(FROM_BOARD, e - there - PIN_STAY), doing: 'on his way home', out: true };
  if (weekdayAt(w.state, t) === 'Monday' && mod >= ROUND_FROM && mod < ROUND_FROM + minutes(ROUND)) {
    return { pos: along(ROUND, mod - ROUND_FROM), doing: 'going round the houses for the rent', out: true };
  }
  return { pos: DOOR, doing: 'at his door', out: true };
}

/** Today's odd jobs. */
export function jobsToday(w: World): World['state']['oddJobs'] {
  const today = dayIndex(w.t);
  return w.state.oddJobs.filter((j) => j.day === today);
}

/** Who is at a job now, if anyone. */
export function workingAt(w: World, id: number): Resident | null {
  return w.state.residents.find((r) => r.activity?.kind === 'chore' && r.activity.job === id) ?? null;
}

/** Whether r has done a job for him today. */
export const doneToday = (w: World, r: Resident) => jobsToday(w).some((j) => j.doneBy === r.id);

/** Today's job at r's place that nobody has done or is doing, if there is one. */
export function openJobHere(w: World, r: Resident): World['state']['oddJobs'][number] | null {
  // The best-paid first: someone who can keep the ledger is offered it before the path.
  return jobsToday(w).filter((j) => j.doneBy === null && w.isAt(r, j.placeId) && !workingAt(w, j.id) && fitFor(w, r, j.kind))
    .sort((a, b) => b.pay - a.pay)[0] ?? null;
}

export const whatOf = (kind: string) => (kind === LEDGER_JOB.kind ? LEDGER_JOB.what : ODD_JOB_KINDS.find((k) => k.kind === kind)?.what ?? projectJobOf(kind)?.what ?? 'odd work');

/** Each minute: once he's at the board (or the town wakes later in the day), yesterday's jobs come down and today's go up. */
export function mrLimMinute(w: World): void {
  const today = dayIndex(w.t);
  const mod = minuteOfDay(w.t);
  // A new day: notes for jobs nobody did come down (the jobs were only for their day).
  const stale = new Set(w.state.oddJobs.filter((j) => j.day !== today && j.doneBy === null).map((j) => j.noteId));
  if (stale.size && w.state.notes.some((n) => stale.has(n.id))) w.state.notes = w.state.notes.filter((n) => !stale.has(n.id));
  if (w.state.oddJobsDay === today || mod < PIN_AT || mod >= LAST_POST) return;
  w.state.oddJobsDay = today;
  const old = new Set(w.state.oddJobs.filter((j) => j.doneBy === null).map((j) => j.noteId));
  w.state.notes = w.state.notes.filter((n) => !old.has(n.id));
  w.state.oddJobs = [];
  const rng = new Rng((Math.imul(w.state.seed ^ 0x1b873593, 2654435761) ^ Math.imul(today + 1, 40503)) >>> 0);
  const kinds = [...ODD_JOB_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const k = rng.int(0, i);
    [kinds[i], kinds[k]] = [kinds[k]!, kinds[i]!];
  }
  for (const k of kinds.slice(0, rng.chance(0.5) ? 3 : 2)) {
    const text = `Wanted: someone to ${k.what}. An hour's work, ${formatMoney(ODD_JOB_PAY)} when it's done. Mr Lim.`;
    const noteId = w.nextId();
    w.state.notes.push({ id: noteId, authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    w.state.oddJobs.push({ id: w.nextId(), kind: k.kind, placeId: k.placeId, pay: ODD_JOB_PAY, day: today, doneBy: null, noteId, project: null });
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
  }
  // Someone in the kampung reads and writes English well: his ledger wants keeping.
  if (w.state.residents.some((r) => fitFor(w, r, LEDGER_JOB.kind))) {
    const text = `Wanted: someone with good English to ${LEDGER_JOB.what}. An hour's work, ${formatMoney(LEDGER_JOB.pay)} when it's done. Mr Lim.`;
    const noteId = w.nextId();
    w.state.notes.push({ id: noteId, authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    w.state.oddJobs.push({ id: w.nextId(), kind: LEDGER_JOB.kind, placeId: LEDGER_JOB.placeId, pay: LEDGER_JOB.pay, day: today, doneBy: null, noteId, project: null });
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
  }
  // Beside them, the next jobs on whatever he's having built.
  for (const p of w.state.projects) {
    if (p.builtDay !== null) continue;
    const next = (PROJECT_JOBS[p.id] ?? []).map((j, i) => ({ ...j, i })).filter((j) => !p.done.includes(j.i)).slice(0, PROJECT_JOBS_A_DAY);
    if (!next.length) continue;
    // One note a building, so the board keeps room for everyone else's.
    const wanted = next.map((j) => `someone to ${j.what}`);
    const text = `Wanted, for ${PROJECT_NAMES[p.id] ?? 'the new building'}: ${wanted.join(', and ')}. An hour's work each, ${formatMoney(ODD_JOB_PAY)} when it's done. Mr Lim.`;
    const noteId = w.nextId();
    w.state.notes.push({ id: noteId, authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    for (const j of next) w.state.oddJobs.push({ id: w.nextId(), kind: projectKind(p.id, j.i), placeId: j.placeId, pay: ODD_JOB_PAY, day: today, doneBy: null, noteId, project: p.id });
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
  }
}

/** A job finished: paid from his purse, its note taken down. */
export function finishOddJob(w: World, r: Resident, id: number | null): void {
  const job = w.state.oddJobs.find((j) => j.id === id);
  if (!job || job.doneBy !== null) return;
  job.doneBy = r.id;
  // The note comes down once nothing on it is still wanted; until then it asks only for what's left.
  const left = w.state.oddJobs.filter((j) => j.noteId === job.noteId && j.doneBy === null);
  if (!left.length) w.state.notes = w.state.notes.filter((n) => n.id !== job.noteId);
  else {
    const note = w.state.notes.find((n) => n.id === job.noteId);
    const name = job.project ? PROJECT_NAMES[job.project] ?? 'the new building' : null;
    if (note && name) note.text = `Wanted, for ${name}: ${left.map((j) => `someone to ${whatOf(j.kind)}`).join(', and ')}. An hour's work each, ${formatMoney(ODD_JOB_PAY)} when it's done. Mr Lim.`;
  }
  w.transfer(MR_LIM_ID, r.id, job.pay, 'odd job for Mr Lim');
  const what = whatOf(job.kind);
  w.emit({ type: 'odd_job_done', who: r.id, what, cents: job.pay });
  w.remember(r.id, `You finish the job for Mr Lim (${what}), and Mr Lim pays you ${formatMoney(job.pay)}.`);
  const pj = job.project ? projectJobOf(job.kind) : null;
  if (pj && projectJobDone(w, pj.project, pj.index)) {
    // The last job done: it's built, and Mr Lim lets it be known.
    const name = PROJECT_NAMES[pj.project] ?? 'the new building';
    const text = PROJECTS[pj.project]?.ready ?? `${name[0]!.toUpperCase()}${name.slice(1)} is ready. Mr Lim.`;
    w.state.notes.push({ id: w.nextId(), authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
    w.emit({ type: 'built', what: name });
  }
}
