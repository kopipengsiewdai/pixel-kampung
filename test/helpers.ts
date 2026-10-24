import { createWorld } from '../src/sim/seed.ts';
import { World, type Resident } from '../src/sim/state.ts';
import { gameMinuteFromMs } from '../src/sim/time.ts';
import { PLACE_BY_ID, PLACES } from '../src/sim/map.ts';
import { act, type ActionResult } from '../src/sim/actions/index.ts';
import { expect } from 'vitest';

/** Game minute for Monday 2026-11-02 at the given Singapore time. */
export function sgt(hour: number, minute = 0, dayOffset = 0): number {
  return gameMinuteFromMs(Date.parse('2026-11-01T16:00:00Z')) + dayOffset * 1440 + hour * 60 + minute;
}

/**
 * The seed world has no prices (owners set their own in play). Unit tests use
 * this fixed price list so expectations are easy to read.
 */
export const TEST_PRICES = {
  kopitiam: { sell: { kopi: 10, 'fish porridge': 35, 'vegetable rice': 30 }, buy: { fish: 25, vegetables: 15 } },
  'provision-shop': { sell: { rice: 30, coffee: 70, bread: 20 }, buy: {} },
  'market-stall': { sell: { fish: 30, vegetables: 20 }, buy: { fish: 20, vegetables: 12 } },
} as const;

/**
 * A test world at Monday hh:mm. By default shops carry TEST_PRICES and
 * everyone already knows every place and person, so action tests read
 * plainly; pass knowsTown = false for a world as residents really start it.
 */
export function newWorld(hour = 9, minute = 0, seed = 1, priced = true, knowsTown = true): World {
  const state = createWorld(seed, sgt(hour, minute));
  if (knowsTown) {
    for (const r of state.residents) {
      r.knownPlaces = PLACES.map((p) => p.id);
      r.knownPeople = state.residents.filter((o) => o.id !== r.id).map((o) => o.id);
    }
  }
  if (priced) {
    for (const shop of state.shops) {
      const p = TEST_PRICES[shop.id as keyof typeof TEST_PRICES];
      shop.sellPrices = { ...p.sell };
      shop.buyPrices = { ...p.buy };
    }
  }
  return new World(state);
}

export function who(w: World, name: string): Resident {
  const r = w.residentByName(name);
  if (!r) throw new Error(`no ${name}`);
  return r;
}

/** Puts a resident at a place, idle and awake. */
export function put(w: World, name: string, placeId: string): Resident {
  const r = who(w, name);
  r.pos = { ...PLACE_BY_ID.get(placeId)!.spot };
  r.activity = null;
  return r;
}

const SYSTEM_WORDS = /\b(error|invalid|undefined|null|NaN|exception|not implemented|feature|id|verb|parameter|argument|intent|api|state|system|server|database|function)\b|[{}[\]_<>]/i;

/** The reply must read as something a person in the kampung would hear. */
export function expectInWorld(text: string): void {
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toMatch(SYSTEM_WORDS);
}

export function accepted(res: ActionResult): ActionResult {
  expect(res.ok, res.reply).toBe(true);
  if (res.reply) expectInWorld(res.reply);
  return res;
}

export function refused(res: ActionResult, match?: RegExp): string {
  expect(res.ok).toBe(false);
  expectInWorld(res.reply!);
  if (match) expect(res.reply).toMatch(match);
  return res.reply!;
}

export { act };
