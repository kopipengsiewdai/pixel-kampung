import { endShift, interrupt, startSleep } from './activities.ts';
import { RESTED } from './activities.ts';
import type { World } from './state.ts';
import { dayIndex, GAME_MINUTES_PER_REAL_MINUTE, isNight } from './time.ts';
import { osmanSkip } from './osman.ts';
import { stoveMinute } from './travellers.ts';
import { finishChore } from './actions/chores.ts';
import { fadeSkills, lapseLessons } from './skills.ts';
import { quietNotices } from './households.ts';

/**
 * Gaps up to this long (ten real minutes) are simply replayed
 * minute by minute, so a town that falls behind while its residents think
 * catches up instead of skipping ahead; longer ones are downtime.
 */
export const MAX_REPLAY_MINUTES = 10 * GAME_MINUTES_PER_REAL_MINUTE;
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
  quietNotices(w, from, to);
  const longRest = gap >= 6 * 60 || dayIndex(from) !== dayIndex(to) || isNight(from) || isNight(to);
  for (const r of w.state.residents) {
    // A chore done within a short pause is done; one caught by a long rest or the night is cut short.
    const c = r.activity;
    if (c?.kind === 'chore') {
      if (c.until <= to && !longRest) finishChore(w, r);
      else interrupt(w, r);
    }
    const a = r.activity;
    if (a?.kind === 'walking') {
      const last = a.path[a.path.length - 1];
      if (last) r.pos = { ...last };
      r.activity = null;
    } else if (a?.kind === 'fishing' || a?.kind === 'school') {
      r.activity = null;
    } else if (a?.kind === 'working') {
      a.worked += Math.max(0, Math.min(gap, a.until - from));
      if (to >= a.until) endShift(w, r);
    } else if (a?.kind === 'sleeping') {
      r.energy = Math.min(1000, r.energy + gap * 3);
    }
    if (r.hunger < QUIET_HUNGER_CAP) r.hunger = Math.min(QUIET_HUNGER_CAP, r.hunger + Math.floor(gap / 3));
    // A quiet spell doesn't count towards falling ill: the day at faint picks up where it left off.
    if (r.faintFrom !== null) r.faintFrom += gap;
    if (longRest) r.energy = Math.max(r.energy, RESTED);
    if (isNight(to)) {
      r.activity = null;
      r.pos = { ...w.home(r).spot };
      startSleep(w, r, 'night');
    }
    r.thinkAt = to + 1;
  }
  osmanSkip(w);
  w.state.jobOffers = w.state.jobOffers.filter((o) => o.expires > to);
  w.state.trades = w.state.trades.filter((o) => o.expires > to);
  w.state.debtOffers = w.state.debtOffers.filter((o) => o.expires > to);
  w.state.priceOffers = w.state.priceOffers.filter((o) => o.expires > to);
  // Travellers who came in the gap found the town quiet; anything on the stove is done.
  for (const s of w.state.shops) {
    s.queue = [];
    s.serving = [];
  }
  for (const r of w.state.residents) stoveMinute(w, r);
  // Lessons and offers to teach run out with their time; skills unused over the gap fade.
  lapseLessons(w);
  fadeSkills(w);
  w.emit({ type: 'quiet_spell', minutes: gap });
}
