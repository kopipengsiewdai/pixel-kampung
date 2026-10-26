import {
  COLLAPSE_WAKE_ENERGY, RESTED, WALK_TILES_PER_MINUTE,
  catchFish, endShift, interrupt, startSleep, wake, walkHomeToSleep,
} from './activities.ts';
import { choreMinute, lapseErrands } from './actions/chores.ts';
import { fadeSkills, lapseLessons } from './skills.ts';
import { lapsePriceOffers } from './actions/haggle.ts';
import { witherBeds } from './actions/everyone.ts';
import { bondsMinute } from './bonds.ts';
import { householdsMinute, ROUGH } from './households.ts';
import { isServing, stoveMinute, travellersMinute } from './travellers.ts';
import { PLACE_BY_ID } from './map.ts';
import { addGoods, NEED_MAX, OLD_AGE, type Resident, type World } from './state.ts';
import { lookAbout } from './discovery.ts';
import { ARRIVES, osmanMinute, STAYS } from './osman.ts';
import { ITEMS, type ItemId } from './items.ts';
import { ACHING_HUNGER, FAINT_HUNGER, HUNGRY_FROM } from './perception.ts';
import { dayIndex, isNight, minuteOfDay } from './time.ts';
import { kinOf } from '../seed/cast.ts';
import { noticeIllKin, sicknessMinute } from './sickness.ts';

/** About when the lorry comes and goes (Pak Osman's own day varies a little: src/sim/osman.ts). */
export const LORRY_ARRIVES = ARRIVES;
export const LORRY_LEAVES = ARRIVES + STAYS;

function clamp(v: number): number {
  return Math.max(0, Math.min(NEED_MAX, v));
}

/** Hunger that crosses one of these brings a thought on: the stomach is news. */
const HUNGER_LINES = [HUNGRY_FROM, ACHING_HUNGER, FAINT_HUNGER];

function updateNeeds(w: World, r: Resident): void {
  const before = r.hunger;
  feelNeeds(w, r);
  if (r.activity?.kind !== 'sleeping' && HUNGER_LINES.some((l) => before < l && r.hunger >= l)) r.thinkAt = Math.min(r.thinkAt, w.t + 1);
}

function feelNeeds(w: World, r: Resident): void {
  const kind = r.activity?.kind;
  if (kind === 'sleeping') {
    if (w.t % 3 === 0) r.hunger += 1;
    // Sleeping rough at the jetty, energy comes back at half the speed.
    r.energy += r.homeId === ROUGH ? (w.t % 2 === 0 ? 2 : 1) : 3;
  } else {
    r.hunger += 1;
    r.energy -= kind === 'working' || kind === 'fishing' || isServing(w, r) ? 1 : w.t % 3 === 0 ? 0 : 1;
    // Past sixty, a body tires a third quicker.
    if (w.ageOf(r) >= OLD_AGE && w.t % 3 === 0) r.energy -= 1;
    if (r.hunger >= NEED_MAX) r.energy -= 1;
    // Ill, a body tires quickly.
    if (r.ill) r.energy -= 1;
  }
  r.hunger = clamp(r.hunger);
  r.energy = clamp(r.energy);
}

function progress(w: World, r: Resident): void {
  const a = r.activity;
  if (!a) return;
  switch (a.kind) {
    case 'walking': {
      const steps = a.path.splice(0, WALK_TILES_PER_MINUTE);
      if (steps.length) r.pos = { ...steps[steps.length - 1]! };
      if (a.path.length === 0) {
        r.activity = null;
        r.thinkAt = w.t;
        const dest = a.dest ? PLACE_BY_ID.get(a.dest) : null;
        if (dest) {
          w.emit({ type: 'arrived', who: r.id, at: dest.id });
          // Someone turning up is something new for whoever is there.
          for (const o of w.state.residents) if (o.id !== r.id && (!o.activity || o.activity.kind === 'working') && w.isAt(o, dest.id)) o.thinkAt = Math.min(o.thinkAt, w.t + 1);
        }
        if (a.thenSleep && w.isAt(r, w.home(r).id)) startSleep(w, r, isNight(w.t) ? 'night' : 'nap');
      }
      return;
    }
    case 'fishing':
      if (w.t >= a.until) catchFish(w, r);
      return;
    case 'chore':
      choreMinute(w, r);
      return;
    case 'working':
      a.worked += 1;
      if (w.t >= a.until || r.hunger >= NEED_MAX) endShift(w, r);
      return;
    case 'sleeping':
      if (a.reason === 'night' && !isNight(w.t)) wake(w, r);
      else if (a.reason === 'nap' && (r.energy >= RESTED || (a.until !== null && w.t >= a.until))) wake(w, r);
      else if (a.reason === 'collapse' && r.energy >= COLLAPSE_WAKE_ENERGY) wake(w, r);
      return;
  }
}

/** Faint with hunger, a resident eats the most filling food they carry at once, without a thought (as they sleep at night). */
function eatToSurvive(w: World, r: Resident): void {
  const food = (Object.keys(r.items) as ItemId[])
    .filter((i) => (r.items[i] ?? 0) > 0 && ITEMS[i].food)
    .sort((a, b) => ITEMS[b].food!.hunger - ITEMS[a].food!.hunger)[0];
  if (!food) return;
  const def = ITEMS[food];
  addGoods(r.items, food, -1);
  r.hunger = Math.max(0, r.hunger - def.food!.hunger);
  r.energy = Math.min(NEED_MAX, r.energy + (def.food!.energy ?? 0));
  w.emit({ type: 'ate', who: r.id, item: food });
  w.notify(r.id, `Faint with hunger, you eat the ${def.one.replace(/^(a|an) /, '')} you were carrying.`);
}

/** Advances the world by one game minute. Brains are not involved here. */
/** Kin seen faint with hunger stays in mind (docs/design/home-cooking.md): once a day for each. */
function noticeFaintKin(w: World, r: Resident): void {
  const today = dayIndex(w.t);
  for (const k of kinOf(r.id)) {
    const o = w.state.residents.find((x) => x.id === k.id);
    if (!o || o.activity?.kind === 'sleeping' || o.hunger < FAINT_HUNGER || !w.isNear(r, o)) continue;
    const key = `${r.id}>${o.id}`;
    if (w.state.faintSeen[key] === today) continue;
    w.state.faintSeen[key] = today;
    w.remember(r.id, `${o.name} looked faint with hunger.`);
  }
}

/** Something due soon is news: a shift starting, or an offer about to lapse (OFFER_REMINDER minutes before). */
export const OFFER_REMINDER = 10;

function timely(w: World, mod: number): void {
  const nudge = (id: string | null) => {
    if (!id) return;
    const r = w.state.residents.find((x) => x.id === id);
    if (r && r.activity?.kind !== 'sleeping') r.thinkAt = Math.min(r.thinkAt, w.t);
  };
  for (const j of w.state.jobs) if (mod === j.startHour * 60) nudge(j.workerId);
  const soon = (o: { expires: number }) => o.expires - w.t === OFFER_REMINDER;
  for (const o of w.state.jobOffers) if (soon(o)) nudge(o.workerId);
  for (const o of w.state.trades) if (soon(o)) nudge(o.toId);
  for (const o of w.state.debtOffers) if (soon(o)) nudge(o.toId);
  for (const o of w.state.lessonOffers) if (soon(o)) nudge(o.learnerId);
  for (const e of w.state.errands) if (!e.taken && soon(e)) nudge(e.runnerId);
}

export function advance(w: World): void {
  w.state.t += 1;
  const t = w.t;
  const mod = minuteOfDay(t);
  const night = isNight(t);

  if (mod === 23 * 60) w.emit({ type: 'night_fell' });
  if (mod === 6 * 60) w.emit({ type: 'morning' });

  for (const r of w.state.residents) {
    updateNeeds(w, r);
    if (r.activity?.kind !== 'sleeping' && r.hunger >= FAINT_HUNGER) eatToSurvive(w, r);
    sicknessMinute(w, r);
    progress(w, r);
    stoveMinute(w, r);
    if (r.activity?.kind !== 'sleeping') {
      lookAbout(w, r);
      noticeFaintKin(w, r);
      noticeIllKin(w, r);
    }
    const a = r.activity;
    if (a?.kind !== 'sleeping' && r.energy <= 0) {
      interrupt(w, r);
      startSleep(w, r, 'collapse');
      continue;
    }
    if (night) {
      if (a?.kind === 'sleeping') {
        if (a.reason === 'nap') a.reason = 'night';
      } else if (!(a?.kind === 'walking' && a.thenSleep)) {
        interrupt(w, r);
        walkHomeToSleep(w, r);
      }
    }
  }

  osmanMinute(w);
  travellersMinute(w);
  timely(w, mod);

  w.state.jobOffers = w.state.jobOffers.filter((o) => o.expires > t);
  w.state.trades = w.state.trades.filter((o) => o.expires > t);
  w.state.debtOffers = w.state.debtOffers.filter((o) => o.expires > t);
  lapsePriceOffers(w);
  lapseErrands(w);
  lapseLessons(w);
  // Skills unused fade, checked once a day.
  if (mod === 0) fadeSkills(w);
  if (mod === 0) witherBeds(w);
  bondsMinute(w);
  householdsMinute(w);
}

export function advanceTo(w: World, t: number): void {
  while (w.t < t) advance(w);
}
