/**
 * Village characters (docs/design/village-characters.md): a scripted body and,
 * later, a bounded AI head. Unlike residents they have no needs, sleep,
 * memory stream or home life. The first is the village head.
 */
import type { Point } from '../sim/map.ts';

export const VILLAGE_HEAD_ID = 'village-head';
/** The village fund: inside the town (rent goes in; refunds, and later odd-job pay, come out). */
export const FUND_ID = 'village-fund';

export interface VillageCharacter { id: string; name: string; homeId: string }

/** The village head, as residents know him. */
export const VILLAGE_HEAD: VillageCharacter = { id: VILLAGE_HEAD_ID, name: 'Mr Lim', homeId: 'village-head-house' };

export const VILLAGE_CHARACTERS: readonly VillageCharacter[] = [VILLAGE_HEAD];

/** A village character's saved body: where they are, whether indoors (unseen), and the duty they're about. */
export interface VillagerBody {
  pos: Point;
  indoors: boolean;
  duty: { kind: 'rent_round' | 'notice'; stops: Point[]; day: number } | null;
  path: Point[];
}

/** What residents might call them ("Mr Lim", "the village head"). */
const CALLED: Record<string, readonly string[]> = {
  [VILLAGE_HEAD_ID]: ['mr lim', 'mr. lim', 'lim', 'village head', 'the village head'],
};

export function villageCharacterByName(name: unknown): VillageCharacter | null {
  if (typeof name !== 'string') return null;
  const s = name.trim().toLowerCase().replace(/[.!?]+$/, '');
  return VILLAGE_CHARACTERS.find((c) => CALLED[c.id]?.includes(s)) ?? null;
}

export function villageCharacter(id: string): VillageCharacter | null {
  return VILLAGE_CHARACTERS.find((c) => c.id === id) ?? null;
}
