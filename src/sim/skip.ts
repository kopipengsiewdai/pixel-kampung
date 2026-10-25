import { endShift, startSleep } from './activities.ts';
import { RESTED } from './activities.ts';
import { nearestRough, ROUGH_REST, ROUGH_REST_CAP } from './households.ts';
import type { World } from './state.ts';
import { dayIndex, GAME_SPEED, isNight, minuteOfDay } from './time.ts';
import { LORRY_ARRIVES, LORRY_LEAVES } from './tick.ts';

/**
 * Gaps up to this long (ten real minutes on the 4x clock) are simply replayed
 * minute by minute, so a town that falls behind while its residents think
 * catches up instead of skipping ahead; longer ones are downtime.
 */
export const MAX_REPLAY_MINUTES = 10 * GAME_SPEED;
/** A quiet spell never leaves anyone hungrier than this. */
export const QUIET_HUNGER_CAP = 800;

/**
 * After downtime the town doesn't replay the missed hours. Time jumps to `to`
 * and the gap passes as "everyone rested or worked quietly": walkers arrive,
 * lines come in empty, shifts count as worked, sleepers keep resting (and wake
 * on the next minute if rested), and at night
 * everyone is home asleep. No lorry, sales or talk happen in the gap.
 */
export function skipQuietly(w: World, to: number): void {
  const from = w.t;
  const gap = to - from;
  if (gap <= 0) return;
  w.state.t = to;
  const longRest = gap >= 6 * 60 || dayIndex(from) !== dayIndex(to) || isNight(from) || isNight(to);
  for (const r of w.state.residents) {
    const a = r.activity;
    if (a?.kind === 'walking') {
      const last = a.path[a.path.length - 1];
      if (last) r.pos = { ...last };
      r.activity = null;
    } else if (a?.kind === 'fishing') {
      r.activity = null;
    } else if (a?.kind === 'working') {
      a.worked += Math.max(0, Math.min(gap, a.until - from));
      if (to >= a.until) endShift(w, r);
    } else if (a?.kind === 'sleeping') {
      r.energy = a.rough ? Math.max(r.energy, Math.min(ROUGH_REST_CAP, r.energy + gap * ROUGH_REST)) : Math.min(1000, r.energy + gap * 3);
    }
    if (r.hunger < QUIET_HUNGER_CAP) r.hunger = Math.min(QUIET_HUNGER_CAP, r.hunger + Math.floor(gap / 3));
    // Someone with nowhere to sleep rests only as well as rough sleeping allows.
    if (longRest) r.energy = Math.max(r.energy, r.homeId ? RESTED : ROUGH_REST_CAP);
    if (isNight(to)) {
      r.activity = null;
      r.pos = { ...(w.home(r)?.spot ?? nearestRough(r.pos).at) };
      startSleep(w, r, 'night');
    }
    r.thinkAt = to + 1;
  }
  const mod = minuteOfDay(to);
  w.state.lorryHere = mod >= LORRY_ARRIVES && mod < LORRY_LEAVES;
  w.state.jobOffers = w.state.jobOffers.filter((o) => o.expires > to);
  w.state.trades = w.state.trades.filter((o) => o.expires > to);
  w.emit({ type: 'quiet_spell', minutes: gap });
}
