/**
 * The save upgrades: one living town, upgraded in place by every release
 * (owner decision, 2026-10-25; see docs/design/upgrades.md).
 *
 * Each step takes a save from version `from` to `from + 1`. Steps are
 * append-only: once a step has shipped it is never edited or removed, because
 * a town somewhere may still be waiting to run it. A step works on the save as
 * it was stored at that version (plain JSON), so it imports no live game code
 * and carries any data it needs frozen inside it.
 */
import type { DatabaseSync } from 'node:sqlite';

/** A save as stored: plain JSON, in whatever shape its version had. */
export interface SaveData {
  world: Record<string, unknown>;
  brains: Record<string, unknown>;
}

export interface Upgrade {
  /** Upgrades a save at this version to the next one. */
  from: number;
  /** One line: what changes for a town already living. */
  why: string;
  /** Pure: returns the upgraded world and brains, never changing its input. The runner stamps the new version. */
  save?: (old: SaveData) => SaveData;
  /** Changes to the save file's other tables (events, ledger, memories), run in the same transaction. */
  tables?: (db: DatabaseSync) => void;
}

interface V1Resident { id: string; knownPeople: string[] }

/** The cast's starting ties as approved on 2026-10-25 (docs/design/cast.md), frozen for v1 → v2. */
const TIES_V2: Record<string, readonly string[]> = {
  'ah-huat': ['ah-seng', 'rahim'],
  'mdm-tan': ['mei-ling'],
  rahim: ['fatimah', 'ah-huat'],
  'mei-ling': ['mdm-tan'],
  siti: ['fatimah'],
  muthu: ['raju'],
  'ah-seng': ['ah-huat'],
  fatimah: ['rahim', 'siti'],
  raju: ['muthu'],
};

export const UPGRADES: readonly Upgrade[] = [
  {
    from: 1,
    why: 'Family and old friends know each other, as the cast was written (kept alongside anyone already met).',
    save: ({ world, brains }) => {
      const residents = world.residents as V1Resident[];
      const here = new Set(residents.map((r) => r.id));
      return {
        world: {
          ...world,
          residents: residents.map((r) => {
            const add = (TIES_V2[r.id] ?? []).filter((id) => id !== r.id && here.has(id) && !r.knownPeople.includes(id));
            return add.length ? { ...r, knownPeople: [...r.knownPeople, ...add] } : r;
          }),
        },
        brains,
      };
    },
  },
  {
    from: 2,
    why: 'The kampung keeps its own time, four times as fast as the real clock, and its own calendar: today becomes Monday, 1 January, Year 0.',
    save: ({ world, brains }) => {
      // A v2 town's minutes were real minutes (since 1970, Singapore time), so its clock is anchored
      // where it stands: nothing jumps, and the time of day carries on. Day index as time.ts had it at v2.
      const t = world.t as number;
      const day = Math.floor((t + 8 * 60) / 1440);
      // Today becomes Monday, 1 January (owner, 2026-10-25). The free fake brain notes the weekday it last did
      // its lorry run and topped up buying limits: today's old weekday becomes Monday, and an old "Monday"
      // (a week back, or more) is long past.
      const oldToday = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'][((day % 7) + 7) % 7]!;
      const relabel = (d: unknown) => (d === oldToday ? 'Monday' : d === 'Monday' ? '' : d);
      const fresh = Object.fromEntries(Object.entries(brains).map(([id, b]) => {
        if (!b || typeof b !== 'object' || !('lorryDay' in b)) return [id, b];
        const fb = b as { lorryDay: unknown; buyDays?: Record<string, unknown> };
        const buyDays = Object.fromEntries(Object.entries(fb.buyDays ?? {}).map(([k, v]) => [k, relabel(v)]));
        return [id, { ...fb, lorryDay: relabel(fb.lorryDay), buyDays }];
      }));
      return {
        world: { ...world, clock: { anchorT: t, anchorMs: t * 60_000 }, calendar: { firstDay: day } },
        brains: fresh,
      };
    },
  },
  {
    from: 3,
    why: "Residents remember what they last did, so doing the same thing again straight away doesn't keep them from answering anyone.",
    save: ({ world, brains }) => ({
      world: { ...world, residents: (world.residents as Record<string, unknown>[]).map((r) => ('lastDone' in r ? r : { ...r, lastDone: null })) },
      brains,
    }),
  },
  {
    from: 4,
    why: "Families live together: Ah Seng moves into his father Ah Huat's house and Mei Ling into her aunt Mdm Tan's; two houses stand empty. Residents can marry, offer each other a home, or tell someone to leave.",
    save: ({ world, brains }) => {
      if ('houses' in world) return { world, brains };
      type R = { id: string; name: string; homeId: string | null; knownPlaces: string[] };
      const residents = (world.residents as R[]).map((r) => ({ ...r, spouseId: null, knownPlaces: [...r.knownPlaces] }));
      const byId = new Map(residents.map((r) => [r.id, r]));
      // The houses as they stood at v4: each headed by whoever lived there.
      const houses = Array.from({ length: 10 }, (_, i) => `house-${i + 1}`).map((id) => ({ id, holderId: residents.find((r) => r.homeId === id)?.id ?? null }));
      const news: unknown[] = [];
      // Frozen at v5: who moves in with whom, and how they're related.
      const moves = [
        { mover: 'ah-seng', host: 'ah-huat', moverTold: 'You move your things back into your father %H\'s house.', hostTold: 'Your son %M has moved back in with you.' },
        { mover: 'mei-ling', host: 'mdm-tan', moverTold: 'You move your things into your aunt %H\'s house.', hostTold: 'Your niece %M has moved in with you.' },
      ];
      for (const m of moves) {
        const mover = byId.get(m.mover);
        const host = byId.get(m.host);
        if (!mover || !host || !host.homeId || mover.homeId === host.homeId) continue;
        const old = houses.find((h) => h.id === mover.homeId);
        if (old) old.holderId = null;
        mover.homeId = host.homeId;
        if (!mover.knownPlaces.includes(host.homeId)) mover.knownPlaces.push(host.homeId);
        const fill = (s: string) => s.replace('%H', host.name).replace('%M', mover.name);
        news.push({ event: { type: 'moved_in', who: mover.id, house: host.homeId, host: host.id }, tell: [{ id: mover.id, text: fill(m.moverTold) }, { id: host.id, text: fill(m.hostTold) }] });
      }
      return { world: { ...world, residents, houses, homeOffers: [], proposals: [], bonds: {}, news }, brains };
    },
  },
  {
    from: 5,
    why: "The village head, Mr Lim, in his house at the top of the kampung: he lets the empty houses and two new stalls, collects rent on Mondays for the village fund, and pins his notices. Everyone has always known his house.",
    save: ({ world, brains }) => {
      if ('villagers' in world) return { world, brains };
      // Frozen at v6: his house and its door, the stalls, and the day a game minute falls on (SGT).
      const HOUSE = 'village-head-house';
      const DOOR = { x: 41, y: 3 };
      const STALLS = ['stall-1', 'stall-2'];
      const today = Math.floor(((world.t as number) + 8 * 60) / 1440);
      type R = { knownPlaces: string[] };
      const residents = (world.residents as R[]).map((r) => ({ ...r, knownPlaces: r.knownPlaces.includes(HOUSE) ? [...r.knownPlaces] : [...r.knownPlaces, HOUSE] }));
      return {
        world: {
          ...world,
          residents,
          villagers: { 'village-head': { pos: { ...DOOR }, indoors: true, duty: null, path: [] } },
          leases: [],
          rents: {},
          fund: { cents: 0, depositsHeld: 0 },
          villageNotices: [],
          stallCalls: STALLS.map((placeId) => ({ placeId, opened: today, applicants: [], offeredTo: null, offerUntil: null })),
        },
        brains,
      };
    },
  },
];

/** The save version this code writes and reads. */
export const SCHEMA_VERSION = UPGRADES.length + 1;
