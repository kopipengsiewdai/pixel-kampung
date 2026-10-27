/**
 * Sickness from hunger (docs/design/subsistence.md Q4): about a day faint with
 * hunger and a resident falls ill. Ill, they can't work a shift, do chores or
 * fish, and they tire quickly; they can still fetch a pail of water, slowly, one
 * at a time (owner, 2026-10-28). Others see it: kin remember it, and anyone who
 * sees them without water notices they're too weak to be fetching it. About six
 * hours after hunger falls below hungry they're well again. Never death.
 */
import { interrupt } from './activities.ts';
import { FAINT_HUNGER, HUNGRY_FROM } from './perception.ts';
import { countGoods, type Resident, type World } from './state.ts';
import { dayIndex } from './time.ts';
import { kinOf } from '../seed/cast.ts';

/** Faint with hunger this long without a break, and they fall ill. */
export const ILL_AFTER = 24 * 60;
/** Below hungry this long, and they're well again. */
export const WELL_AFTER = 6 * 60;
/** What the ill are too weak for: shifts, chores and fishing (water they can still fetch, slowly). */
export const TOO_ILL_FOR: ReadonlySet<string> = new Set(['work_shift', 'fish', 'cast_net', 'mend_nets', 'sweep', 'help', 'gather_firewood', 'forage', 'do_odd_job']);
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
  if (a === 'working' || a === 'fishing' || a === 'chore' || a === 'school') interrupt(w, r);
  w.emit({ type: 'fell_ill', who: r.id });
  w.remember(r.id, "You've fallen ill: feverish and weak from going so long without food. You need to eat, and rest.");
  if (r.activity?.kind !== 'sleeping') r.thinkAt = Math.min(r.thinkAt, w.t + 1);
}

/**
 * Someone seen looking ill stays in mind, once a day for each (as fainting
 * does): kin always; anyone else when they've no water with them, so a
 * neighbour can bring some (owner, 2026-10-28).
 */
export function noticeIll(w: World, r: Resident): void {
  const today = dayIndex(w.t);
  const kin = new Set(kinOf(r.id).map((k) => k.id));
  for (const o of w.state.residents) {
    if (o === r || !o.ill || o.activity?.kind === 'sleeping' || !w.isNear(r, o)) continue;
    // Seen drawing a pail, they're plainly managing it.
    const fetching = o.activity?.kind === 'chore' && o.activity.chore === 'fetch_water';
    // Noticed apart, so kin who saw a pail by them still notice once it's gone.
    const seen = (key: string, text: string) => {
      if (w.state.illSeen[key] === today) return;
      w.state.illSeen[key] = today;
      w.remember(r.id, text);
    };
    if (kin.has(o.id)) seen(`${r.id}>${o.id}`, `${o.name} looked ill.`);
    if (!fetching && countGoods(o.items, 'water') === 0) seen(`${r.id}>${o.id}:water`, `${o.name} looked ill, too weak to be fetching water.`);
  }
}
