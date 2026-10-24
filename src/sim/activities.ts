import { findPath } from './map.ts';
import { dayIndex, isNight } from './time.ts';
import type { Resident, World } from './state.ts';
import { addGoods } from './state.ts';

export const WALK_TILES_PER_MINUTE = 3;
export const FISHING_MINUTES = 30;
export const NAP_MAX_MINUTES = 180;
export const RESTED = 950;
export const COLLAPSE_WAKE_ENERGY = 400;

export function startSleep(w: World, r: Resident, reason: 'night' | 'nap' | 'collapse'): void {
  r.activity = { kind: 'sleeping', reason, until: reason === 'nap' ? w.t + NAP_MAX_MINUTES : null };
  w.emit({ type: 'fell_asleep', who: r.id, reason });
}

export function wake(w: World, r: Resident): void {
  r.activity = null;
  r.thinkAt = w.t;
  w.emit({ type: 'woke', who: r.id });
}

/** Ends a shift in progress; the worker is owed for the minutes worked. */
export function endShift(w: World, r: Resident): void {
  const a = r.activity;
  if (a?.kind !== 'working') return;
  r.activity = null;
  r.thinkAt = w.t;
  const job = w.state.jobs.find((j) => j.id === a.jobId);
  if (!job) return;
  const earned = Math.floor((job.wage * a.worked) / (job.hours * 60));
  job.lastWorkedDay = dayIndex(w.t);
  if (earned > 0) {
    const owed = w.state.owed.find((o) => o.employerId === job.employerId && o.workerId === r.id);
    if (owed) owed.cents += earned;
    else w.state.owed.push({ employerId: job.employerId, workerId: r.id, cents: earned });
  }
  w.emit({ type: 'shift_ended', who: r.id, shop: job.placeId, earned });
  w.remember(job.employerId, `${r.name} finished a shift.`);
}

/** Stops whatever they're doing (not sleep). Fishing cut short catches nothing. */
export function interrupt(w: World, r: Resident): void {
  if (r.activity?.kind === 'working') endShift(w, r);
  else if (r.activity?.kind === 'fishing' || r.activity?.kind === 'walking') r.activity = null;
}

export function walkHomeToSleep(w: World, r: Resident): void {
  const home = w.home(r);
  if (w.isAt(r, home.id)) {
    startSleep(w, r, isNight(w.t) ? 'night' : 'nap');
    return;
  }
  const path = findPath(r.pos, home.spot) ?? [];
  r.activity = { kind: 'walking', path, dest: home.id, thenSleep: true };
}

export function catchFish(w: World, r: Resident): void {
  const roll = w.rng.next();
  const qty = roll < 0.3 ? 0 : roll < 0.75 ? 1 : roll < 0.95 ? 2 : 3;
  if (qty > 0) addGoods(r.items, 'fish', qty);
  r.activity = null;
  r.thinkAt = w.t;
  w.emit({ type: 'caught_fish', who: r.id, qty });
}
