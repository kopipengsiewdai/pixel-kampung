/**
 * Who each resident has seen, where and when (Kampung, 2026-10-29): asking
 * for someone who isn't there, they're told where they last saw them
 * themselves, never where that person is now.
 */
import type { Resident, World } from './state.ts';
import { dayIndex, sgtHour } from './time.ts';

/** Within this many minutes, it was "a little while ago". */
export const LITTLE_WHILE = 30;

/**
 * Everyone r can see this minute: where they were (not where r stood: someone
 * in view can be next door), worded as it was then, so a house later changing
 * hands or a move r never saw doesn't show; and when.
 */
export function noteSightings(w: World, r: Resident): void {
  for (const o of w.nearby(r)) {
    const p = w.placeOf(o);
    const where = !p ? 'out walking' : p.id === o.homeId ? 'at home' : p.id === r.homeId ? 'at your house' : `at ${w.placeName(p)}`;
    r.lastSeen[o.id] = { where, t: w.t };
  }
}

function partOfDay(t: number): string {
  const h = sgtHour(t);
  return h < 9 ? 'early this morning' : h < 12 ? 'this morning' : h < 14 ? 'around midday'
    : h < 18 ? 'this afternoon' : h < 20 ? 'this evening' : 'tonight';
}

/** Where and when r last saw o, as r remembers it. */
export function lastSeenLine(w: World, r: Resident, o: Resident): string {
  const seen = r.lastSeen[o.id];
  if (!seen) return `You haven't seen ${o.name} lately.`;
  const days = dayIndex(w.t) - dayIndex(seen.t);
  if (days === 1) return `You haven't seen ${o.name} since yesterday.`;
  if (days > 1) return `You haven't seen ${o.name} for ${days} days.`;
  return `You last saw ${o.name} ${seen.where}${w.t - seen.t <= LITTLE_WHILE ? ' a little while ago' : `, ${partOfDay(seen.t)}`}.`;
}
