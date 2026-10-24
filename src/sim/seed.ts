import { CAST, SHOP_SEEDS, START_MONEY, type CastMember } from '../seed/cast.ts';
import { PLACE_BY_ID } from './map.ts';
import { Rng } from './rng.ts';
import { FARM_BEDS, HOUSE_IDS, type WorldState } from './state.ts';

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** A fresh kampung at game minute t, everyone at home and awake. */
export function createWorld(seed: number, t: number, cast: readonly CastMember[] = CAST): WorldState {
  const rng = new Rng(seed);
  const residents = cast.map((c, i) => {
    const homeId = HOUSE_IDS[i]!;
    const [lo, hi] = START_MONEY[c.role];
    return {
      id: slug(c.name),
      name: c.name,
      role: c.role,
      homeId,
      pos: { ...PLACE_BY_ID.get(homeId)!.spot },
      money: rng.int(lo, hi),
      items: {},
      hunger: 150,
      energy: 950,
      activity: null,
      thinkAt: t,
      recent: [],
      reply: null,
    };
  });
  const shops = cast.flatMap((c, i) => {
    if (c.role !== 'owner' || !c.business) return [];
    const s = SHOP_SEEDS[c.business];
    return [{ id: c.business, ownerId: residents[i]!.id, stock: { ...s.stock }, sellPrices: { ...s.sellPrices }, buyPrices: { ...s.buyPrices } }];
  });
  return {
    version: 1,
    seed,
    t,
    rng: rng.state,
    nextId: 0,
    eventSeq: 0,
    ledgerSeq: 0,
    residents,
    shops,
    jobs: [],
    jobOffers: [],
    trades: [],
    owed: [],
    beds: Array.from({ length: FARM_BEDS }, (_, n) => ({ n: n + 1, planterId: null, plantedDay: 0, wateredDays: 0, lastWateredDay: null })),
    notes: [],
    lorryHere: false,
    firsts: [],
  };
}
