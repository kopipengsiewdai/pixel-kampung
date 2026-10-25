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
    save: ({ world, brains }) => {
      // The free fake brain's weekday labels ("done the lorry run on Tuesday") that aren't today's are
      // stale: some came from before the v3 calendar. It only ever compares a label with today, so they
      // are cleared. Today's weekday by the kampung's week, as calendar.ts had it at v4 (frozen).
      const day = Math.floor(((world.t as number) + 8 * 60) / 1440);
      const firstDay = (world.calendar as { firstDay: number }).firstDay;
      const today = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][(((day - firstDay) % 7) + 7) % 7]!;
      const keep = (d: unknown) => (d === today ? d : typeof d === 'string' ? '' : d);
      const fresh = Object.fromEntries(Object.entries(brains).map(([id, b]) => {
        if (!b || typeof b !== 'object' || !('lorryDay' in b)) return [id, b];
        const fb = b as { lorryDay: unknown; buyDays?: Record<string, unknown> };
        const buyDays = Object.fromEntries(Object.entries(fb.buyDays ?? {}).map(([k, v]) => [k, keep(v)]));
        return [id, { ...fb, lorryDay: keep(fb.lorryDay), buyDays }];
      }));
      return {
        world: { ...world, residents: (world.residents as Record<string, unknown>[]).map((r) => ('lastDone' in r ? r : { ...r, lastDone: null })) },
        brains: fresh,
      };
    },
  },
  {
    from: 4,
    why: 'A game day takes five real hours instead of six, so the same game hour drifts through the real day.',
    save: ({ world, brains }) => {
      // Re-anchored where the town stands: at the real moment it reached its last minute at the old
      // pace (15 real seconds a game minute, frozen here), so nothing jumps. From then on the new pace.
      const t = world.t as number;
      const old = world.clock as { anchorT: number; anchorMs: number };
      return { world: { ...world, clock: { anchorT: t, anchorMs: old.anchorMs + (t - old.anchorT) * 15_000 } }, brains };
    },
  },
  {
    from: 5,
    why: 'Two people talking keep count of how long it has been since they last did something together, and of any deal still only in words.',
    save: ({ world, brains }) => {
      // Gentle: nobody is told they're going round in circles because of lines from before the change.
      const talk = Object.fromEntries(Object.entries(world.talk as Record<string, Record<string, unknown>>)
        .map(([k, rec]) => [k, 'idle' in rec ? rec : { ...rec, idle: 0, word: null }]));
      return { world: { ...world, talk }, brains };
    },
  },
];

/** The save version this code writes and reads. */
export const SCHEMA_VERSION = UPGRADES.length + 1;
