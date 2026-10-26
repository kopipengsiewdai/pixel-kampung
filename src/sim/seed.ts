import { SCHEMA_VERSION } from '../store/upgrades.ts';
import { CARDS } from '../seed/cards.ts';
import { CAST, SHOP_STOCK, START_MONEY, type CastMember } from '../seed/cast.ts';
import { PLACE_BY_ID, PLACES } from './map.ts';
import { Rng } from './rng.ts';
import { FARM_BEDS, HOUSE_IDS, type WorldState } from './state.ts';
import { dayIndex } from './time.ts';
import { threshold, type SkillId } from './skills.ts';
import { freshDay } from './travellers.ts';
import { freshOsman } from './osman.ts';

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface NewWorldOptions {
  cast?: readonly CastMember[];
  /** The real moment of game minute t (default: as if t were real minutes, which suits fast sims). */
  anchorMs?: number;
}

/** A fresh kampung at game minute t, everyone at home and awake. Its calendar starts on its first day. */
export function createWorld(seed: number, t: number, opts: NewWorldOptions = {}): WorldState {
  const cast = opts.cast ?? CAST;
  const rng = new Rng(seed);
  // Each has a house of their own, in cast order, unless they live with family.
  const own = cast.filter((c) => !c.livesWith);
  const houseOf = (c: CastMember): string => HOUSE_IDS[own.indexOf(cast.find((o) => o.name === (c.livesWith ?? c.name))!)]!;
  const residents = cast.map((c) => {
    const homeId = houseOf(c);
    const [lo, hi] = START_MONEY[c.role];
    return {
      id: slug(c.name),
      name: c.name,
      role: c.role,
      // A new kampung starts in Year 0.
      born: -(CARDS.find((card) => card.name === c.name)?.age ?? 30),
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
      lastDone: null,
      stove: null,
      mended: null,
      // Home first; a newcomer knows only a few places, everyone else the whole kampung.
      knownPlaces: [homeId, ...(c.places ?? PLACES.map((p) => p.id)).filter((id) => id !== homeId)],
      // Family and old friends are known from day one; everyone else is met in play.
      knownPeople: c.knows.map(slug),
      // The old hands start at their level (docs/design/skills.md); everyone else a novice.
      skills: Object.fromEntries((Object.entries(c.skills ?? {}) as [SkillId, number][])
        .map(([s, level]) => [s, { xp: threshold(s, level), peak: level, lastDay: dayIndex(t), today: { day: dayIndex(t), xp: 0 }, rusty: false, drops: 0 }])),
    };
  });
  const shops = cast.flatMap((c, i) => {
    if (c.role !== 'owner' || !c.business) return [];
    return [{
      id: c.business, ownerId: residents[i]!.id, stock: { ...SHOP_STOCK[c.business] }, sellPrices: {}, buyPrices: {}, buyLimits: {},
      queue: [], serving: [], today: freshDay(dayIndex(t)), hour: { served: 0, cents: 0, left: 0 }, sweptDay: null,
    }];
  });
  return {
    version: SCHEMA_VERSION,
    seed,
    t,
    clock: { anchorT: t, anchorMs: opts.anchorMs ?? t * 60_000 },
    calendar: { firstDay: dayIndex(t) },
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
    debts: [],
    debtOffers: [],
    priceOffers: [],
    errands: [],
    lessons: [],
    lessonOffers: [],
    beds: Array.from({ length: FARM_BEDS }, (_, n) => ({ n: n + 1, planterId: null, plantedDay: 0, wateredDays: 0, lastWateredDay: null, readyDay: null, crop: 'kangkong' as const, pickedDay: null })),
    notes: [],
    lorryHere: false,
    osman: freshOsman(),
    stoves: {},
    faintSeen: {},
    firsts: [],
    talk: {},
  };
}
