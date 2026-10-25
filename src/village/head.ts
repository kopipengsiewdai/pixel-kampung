/**
 * The village head's scripted body (docs/design/households.md §5). He keeps to
 * his house, and comes out for duties: the rent round on Monday mornings, and
 * pinning his notice at 10:00 when what he has to let has changed. He walks
 * the paths like anyone; while indoors he isn't seen.
 */
import { WALK_TILES_PER_MINUTE } from '../sim/activities.ts';
import { learnFromWords } from '../sim/discovery.ts';
import { distance, findPath, PLACE_BY_ID, type Point } from '../sim/map.ts';
import { formatMoney } from '../sim/money.ts';
import { NEARBY_TILES, type Resident, type World } from '../sim/state.ts';
import { dayIndex, isNight, minuteOfDay } from '../sim/time.ts';
import { chooseStallTenants, dayLabel, isRentDay, leasesOf, letNotice, rentRound, stopOf } from './lets.ts';
import { VILLAGE_HEAD, VILLAGE_HEAD_ID, type VillagerBody } from './village.ts';

export const ROUND_AT = 6 * 60 + 15;
export const CHOOSE_AT = 9 * 60;
export const NOTICE_AT = 10 * 60;
/** He answers his door between these hours. */
export const DOOR_FROM = 8;
export const DOOR_UNTIL = 19;

export function porch(): Point {
  return { ...PLACE_BY_ID.get(VILLAGE_HEAD.homeId)!.spot };
}

export function headBody(w: World): VillagerBody {
  return w.state.villagers[VILLAGE_HEAD_ID]!;
}

/** Whether he's at home and answering his door. */
export function atHomeForCallers(w: World): boolean {
  const h = Math.floor(minuteOfDay(w.t) / 60);
  return headBody(w).indoors && !isNight(w.t) && h >= DOOR_FROM && h < DOOR_UNTIL;
}

function same(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function goTo(body: VillagerBody, to: Point): void {
  body.path = findPath(body.pos, to) ?? [];
}

/** The village head's minute. Called once a minute, after the residents move. */
export function villageHeadMinute(w: World): void {
  const body = headBody(w);
  const mod = minuteOfDay(w.t);
  if (mod === CHOOSE_AT) chooseStallTenants(w);
  if (body.indoors && !body.duty) {
    if (mod === ROUND_AT && isRentDay(w) && w.state.leases.length) {
      const stops: Point[] = [];
      for (const l of w.state.leases) {
        const s = stopOf(w, l);
        if (!stops.some((x) => same(x, s))) stops.push(s);
      }
      startDuty(w, body, { kind: 'rent_round', stops, day: dayIndex(w.t) });
    } else if (mod === NOTICE_AT && (letNotice(w) ?? '') !== (w.state.villageNotices[0]?.text ?? '')) {
      startDuty(w, body, { kind: 'notice', stops: [{ ...PLACE_BY_ID.get('notice-board')!.spot }], day: dayIndex(w.t) });
    }
    return;
  }
  if (body.indoors) return;
  // Out and about: walk on, and do what's due at each stop.
  const steps = body.path.splice(0, WALK_TILES_PER_MINUTE);
  if (steps.length) body.pos = { ...steps[steps.length - 1]! };
  if (body.path.length) return;
  const duty = body.duty;
  if (duty && duty.stops.length && same(body.pos, duty.stops[0]!)) {
    const stop = duty.stops.shift()!;
    if (duty.kind === 'rent_round') rentRound(w, w.state.leases.filter((l) => same(stopOf(w, l), stop)));
    else pinNotice(w);
  }
  if (duty && duty.stops.length) goTo(body, duty.stops[0]!);
  else if (same(body.pos, porch())) {
    body.indoors = true;
    body.duty = null;
  } else {
    if (duty) duty.stops = [];
    goTo(body, porch());
  }
}

function startDuty(w: World, body: VillagerBody, duty: NonNullable<VillagerBody['duty']>): void {
  body.indoors = false;
  body.pos = porch();
  body.duty = duty;
  goTo(body, duty.stops[0]!);
  w.emit({ type: 'village_head_out', duty: duty.kind });
}

/** He takes down his old notice and pins the new one (or none, with nothing to let). */
export function pinNotice(w: World): void {
  const text = letNotice(w);
  w.state.villageNotices = text ? [{ id: w.nextId(), text, t: w.t }] : [];
  if (text) {
    w.emit({ type: 'village_notice', text });
    // Anyone at the board sees it go up.
    for (const r of w.state.residents) if (w.isAt(r, 'notice-board') && !w.isAsleep(r)) learnFromWords(w, r, text);
  }
}

/** After downtime: whatever he was about is done, and he's home. */
export function villageHeadSkip(w: World): void {
  const body = headBody(w);
  body.indoors = true;
  body.duty = null;
  body.path = [];
  body.pos = porch();
}

/** Out of doors and within earshot of this resident. */
export function headNearby(w: World, r: Resident): boolean {
  const body = headBody(w);
  return !body.indoors && distance(body.pos, r.pos) <= NEARBY_TILES;
}

/** What he looks to be about, to someone who sees him out. */
export function headDoing(w: World): string {
  const duty = headBody(w).duty;
  if (duty?.stops.length) return duty.kind === 'rent_round' ? 'calling round for the rent' : 'on his way to the notice board';
  return 'walking back up to his house';
}

/** Lines about him for what a resident perceives: at his door, and what they rent from him. Only what applies. */
export function villageLines(w: World, r: Resident): string[] {
  const lines: string[] = [];
  const name = (id: string) => w.placeName(PLACE_BY_ID.get(id)!);
  if (w.isAt(r, VILLAGE_HEAD.homeId)) {
    if (isNight(w.t)) lines.push("Mr Lim's house is dark.");
    else if (atHomeForCallers(w)) lines.push('Mr Lim is in; you could knock on his door.');
    else lines.push("Mr Lim's door is shut. He seems to be out.");
  }
  for (const l of leasesOf(w, r)) {
    lines.push(l.owed > 0
      ? `You owe Mr Lim ${formatMoney(l.owed)} for ${name(l.placeId)}. He calls again on ${dayLabel(w, l.paidUntil)}.`
      : `Your rent for ${name(l.placeId)} is paid up to ${dayLabel(w, l.paidUntil)}.`);
  }
  for (const c of w.state.stallCalls) {
    if (c.offeredTo === r.id && c.offerUntil !== null) lines.push(`Mr Lim has offered you ${name(c.placeId)}, if you pay at his house by ${dayLabel(w, c.offerUntil)}.`);
    else if (c.applicants.includes(r.id)) lines.push(`You've asked Mr Lim for ${name(c.placeId)}.`);
  }
  return lines;
}

/** What he says to someone who speaks to him (his own voice comes later). */
export const HEAD_REPLY = 'Mr Lim nods. "Come by the house and we\'ll talk."';
