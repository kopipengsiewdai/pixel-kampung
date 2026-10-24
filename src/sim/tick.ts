import {
  COLLAPSE_WAKE_ENERGY, RESTED, WALK_TILES_PER_MINUTE,
  catchFish, endShift, interrupt, startSleep, wake, walkHomeToSleep,
} from './activities.ts';
import { PLACE_BY_ID } from './map.ts';
import { NEED_MAX, type Resident, type World } from './state.ts';
import { isNight, minuteOfDay } from './time.ts';

export const LORRY_ARRIVES = 7 * 60;
export const LORRY_LEAVES = 7 * 60 + 30;

function clamp(v: number): number {
  return Math.max(0, Math.min(NEED_MAX, v));
}

function updateNeeds(w: World, r: Resident): void {
  const kind = r.activity?.kind;
  if (kind === 'sleeping') {
    if (w.t % 3 === 0) r.hunger += 1;
    r.energy += 3;
  } else {
    r.hunger += 1;
    r.energy -= kind === 'working' || kind === 'fishing' ? 1 : w.t % 3 === 0 ? 0 : 1;
    if (r.hunger >= NEED_MAX) r.energy -= 1;
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
        if (dest) w.emit({ type: 'arrived', who: r.id, at: dest.id });
        if (a.thenSleep && w.isAt(r, r.homeId)) startSleep(w, r, isNight(w.t) ? 'night' : 'nap');
      }
      return;
    }
    case 'fishing':
      if (w.t >= a.until) catchFish(w, r);
      return;
    case 'working':
      a.worked += 1;
      if (w.t >= a.until) endShift(w, r);
      return;
    case 'sleeping':
      if (a.reason === 'night' && !isNight(w.t)) wake(w, r);
      else if (a.reason === 'nap' && (r.energy >= RESTED || (a.until !== null && w.t >= a.until))) wake(w, r);
      else if (a.reason === 'collapse' && r.energy >= COLLAPSE_WAKE_ENERGY) wake(w, r);
      return;
  }
}

/** Advances the world by one game minute. Brains are not involved here. */
export function advance(w: World): void {
  w.state.t += 1;
  const t = w.t;
  const mod = minuteOfDay(t);
  const night = isNight(t);

  if (mod === 23 * 60) w.emit({ type: 'night_fell' });
  if (mod === 6 * 60) w.emit({ type: 'morning' });

  const lorry = mod >= LORRY_ARRIVES && mod < LORRY_LEAVES;
  if (lorry !== w.state.lorryHere) {
    w.state.lorryHere = lorry;
    w.emit({ type: lorry ? 'lorry_arrived' : 'lorry_left' });
  }

  for (const r of w.state.residents) {
    updateNeeds(w, r);
    progress(w, r);
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

  w.state.jobOffers = w.state.jobOffers.filter((o) => o.expires > t);
  w.state.trades = w.state.trades.filter((o) => o.expires > t);
}

export function advanceTo(w: World, t: number): void {
  while (w.t < t) advance(w);
}
