import { CAST } from '../seed/cast.ts';
import { dateAt } from '../sim/calendar.ts';
import { PLACE_BY_ID } from '../sim/map.ts';
import type { BrainFactory } from '../town.ts';
import type { Mind } from './mind.ts';

/** Brains for a town: every resident a mind, or only those listed (the rest keep the free fake brain). */
export function mindBrains(mind: Mind, fallback: BrainFactory, only?: readonly string[]): BrainFactory {
  return (r, index, seed, state) => {
    if (only && !only.includes(r.id)) return fallback(r, index, seed, state);
    const shop = state.shops.find((s) => s.ownerId === r.id);
    const allowance = CAST.find((c) => c.name === r.name)?.allowance ?? 1;
    // Their age as the kampung's years go by (a birthday is new year).
    const age = dateAt(state, state.t).year - r.born;
    return mind.brainFor(r.id, r.name, r.role, shop ? PLACE_BY_ID.get(shop.id)!.name : null, state.t, allowance, age);
  };
}
