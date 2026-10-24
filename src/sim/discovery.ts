import { PLACES, type Place, type Point } from './map.ts';
import { PLACE_WORDS } from './places.ts';
import type { Resident, World } from './state.ts';

/** How far a resident can make out a building or a stretch of the jetty. */
export const SIGHT_TILES = 6;

function distanceToRect(p: Point, place: Place): number {
  const { x, y, w, h } = place.rect;
  const dx = p.x < x ? x - p.x : p.x >= x + w ? p.x - (x + w - 1) : 0;
  const dy = p.y < y ? y - p.y : p.y >= y + h ? p.y - (y + h - 1) : 0;
  return Math.max(dx, dy);
}

/** What an awake resident takes in where they stand: places in sight, people close by. */
export function lookAbout(w: World, r: Resident): void {
  for (const place of PLACES) {
    if (distanceToRect(r.pos, place) <= SIGHT_TILES) w.learnPlace(r, place.id);
  }
  for (const o of w.nearby(r)) w.learnPerson(r, o.id);
}

/** Places and people named in something they heard or read. */
export function learnFromWords(w: World, r: Resident, text: string): void {
  const s = text.toLowerCase();
  for (const [id, words] of Object.entries(PLACE_WORDS)) {
    // A one-word name counts only as "the well", "the stall": plain "well" is just a word.
    const named = words.some((word) => {
      const pattern = word.replace(/-/g, '[- ]');
      return new RegExp(/[ -]/.test(word) ? `\\b${pattern}\\b` : `\\bthe ${pattern}\\b`).test(s);
    });
    if (named) w.learnPlace(r, id);
  }
  for (const o of w.state.residents) {
    if (o.id === r.id) continue;
    const name = o.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\b${name}\\b`).test(s)) continue;
    w.learnPerson(r, o.id);
    if (new RegExp(`\\b${name}['’]s (house|home|place)\\b`).test(s)) w.learnPlace(r, o.homeId);
  }
}
