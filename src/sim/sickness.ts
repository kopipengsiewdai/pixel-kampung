/**
 * Sickness from hunger (docs/design/subsistence.md Q4): about a day faint with
 * hunger and a resident falls ill. Ill, they can't work a shift, do chores or
 * fish, and they tire quickly; others see it, and kin remember it. About six
 * hours after hunger falls below hungry they're well again. Never death.
 */
import { interrupt } from './activities.ts';
import { FAINT_HUNGER, HUNGRY_FROM } from './perception.ts';
import type { Resident, World } from './state.ts';
import { dayIndex } from './time.ts';
import { kinOf } from '../seed/cast.ts';

/** Faint with hunger this long without a break, and they fall ill. */
export const ILL_AFTER = 24 * 60;
/** Below hungry this long, and they're well again. */
export const WELL_AFTER = 6 * 60;
/** What the ill are too weak for: shifts, chores and fishing. */
export const TOO_ILL_FOR: ReadonlySet<string> = new Set(['work_shift', 'fish', 'cast_net', 'fetch_water', 'mend_nets', 'sweep', 'help', 'gather_firewood', 'forage']);
export const TOO_ILL = "You feel too ill for that. You need to eat, and rest.";

/** One minute of it: the faint clock, falling ill, and getting better. */
export function sicknessMinute(w: World, r: Resident): void {
  if (r.hunger >= FAINT_HUNGER) r.faintFrom ??= w.t;
  else r.faintFrom = null;
  if (!r.ill) {
    if (r.faintFrom !== null && w.t - r.faintFrom >= ILL_AFTER) fallIll(w, r);
    return;
  }
  // Getting better starts once hunger falls below hungry, and only going faint again sets it back.
  if (r.hunger >= FAINT_HUNGER) {
    r.ill.better = null;
    return;
  }
  if (r.hunger < HUNGRY_FROM) r.ill.better ??= w.t;
  if (r.ill.better === null || w.t - r.ill.better < WELL_AFTER) return;
  r.ill = null;
  w.emit({ type: 'got_well', who: r.id });
  w.remember(r.id, 'You feel well again.');
}

function fallIll(w: World, r: Resident): void {
  r.ill = { since: w.t, better: null };
  const a = r.activity?.kind;
  if (a === 'working' || a === 'fishing' || a === 'chore') interrupt(w, r);
  w.emit({ type: 'fell_ill', who: r.id });
  w.remember(r.id, "You've fallen ill: feverish and weak from going so long without food. You need to eat, and rest.");
  if (r.activity?.kind !== 'sleeping') r.thinkAt = Math.min(r.thinkAt, w.t + 1);
}

/** Kin seen looking ill stays in mind, once a day for each (as fainting does). */
export function noticeIllKin(w: World, r: Resident): void {
  const today = dayIndex(w.t);
  for (const k of kinOf(r.id)) {
    const o = w.state.residents.find((x) => x.id === k.id);
    if (!o?.ill || o.activity?.kind === 'sleeping' || !w.isNear(r, o)) continue;
    const key = `${r.id}>${o.id}`;
    if (w.state.illSeen[key] === today) continue;
    w.state.illSeen[key] = today;
    w.remember(r.id, `${o.name} looked ill.`);
  }
}
