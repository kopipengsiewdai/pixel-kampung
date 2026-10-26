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

/** Every place in the kampung as it stood at v7 (src/sim/map.ts), frozen for v7 → v8. */
const PLACES_V8 = [
  'house-1', 'house-2', 'house-3', 'house-4', 'house-5', 'house-6', 'house-7', 'house-8', 'house-9', 'house-10',
  'kopitiam', 'notice-board', 'provision-shop', 'well', 'market-stall', 'lorry-stop', 'farm', 'jetty',
];
/** What Ah Kow, the newcomer, knows besides home, frozen for v7 → v8. */
const NEWCOMER_PLACES_V8 = ['well', 'kopitiam'];

/** Everyone's age when the families came in, by id (the cards, frozen for v11 → v12). */
const AGES_V12: Record<string, number> = {
  'ah-huat': 54, 'mdm-tan': 47, rahim: 40, 'mei-ling': 19, 'ah-kow': 34, siti: 26, muthu: 45, 'ah-seng': 22, fatimah: 36, raju: 29,
  'mak-esah': 63, aminah: 12, hassan: 8,
};
/** The three who were always there, frozen for v11 → v12: whose house they share, and whom they know. */
const FAMILY_V12 = [
  { id: 'mak-esah', name: 'Mak Esah', livesWith: 'siti', knows: ['siti'] },
  { id: 'aminah', name: 'Aminah', livesWith: 'fatimah', knows: ['fatimah', 'hassan', 'rahim'] },
  { id: 'hassan', name: 'Hassan', livesWith: 'fatimah', knows: ['fatimah', 'aminah', 'rahim'] },
];
/** The old hands' starting skills, frozen for v12 → v13: [level, experience at that level's start]. */
const SKILLS_V13: Record<string, Record<string, [number, number]>> = {
  rahim: { fishing: [5, 4380] }, 'ah-huat': { cooking: [5, 4384] }, 'mak-esah': { cooking: [5, 4384] },
  fatimah: { farming: [4, 1460] }, 'ah-kow': { farming: [2, 146] }, hassan: { fishing: [2, 219] },
};
/** Who in the town already knows them, frozen for v11 → v12. */
const KNOW_FAMILY_V12: Record<string, string[]> = { siti: ['mak-esah'], fatimah: ['aminah', 'hassan'], rahim: ['aminah', 'hassan'] };

/** Family and old friends as the cast stood at v16 → v17 (frozen): where trust and fondness start. */
const KIN_V17: ReadonlySet<string> = new Set(["ah-huat>ah-seng","mdm-tan>mei-ling","rahim>fatimah","rahim>aminah","rahim>hassan","mei-ling>mdm-tan","siti>mak-esah","muthu>raju","ah-seng>ah-huat","fatimah>aminah","fatimah>hassan","fatimah>rahim","raju>muthu","mak-esah>siti","aminah>fatimah","aminah>hassan","aminah>rahim","hassan>fatimah","hassan>aminah","hassan>rahim"]);
const FRIENDS_V17: ReadonlySet<string> = new Set(['ah-huat>rahim', 'rahim>ah-huat']);

/** What the old lorry carried and charged, frozen for v14 → v15: a lorry caught mid-visit carries on with it. */
const LORRY_V15 = {
  goods: { rice: 24, coffee: 6, bread: 18, kerosene: 6 },
  sells: { rice: 20, coffee: 50, bread: 15, kerosene: 38 },
  buys: { fish: 15, vegetables: 10 },
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
  {
    from: 6,
    why: 'People can lend, borrow and write IOUs, and what anyone owes is written down; nobody owes anybody yet. The money ledger opens with every purse as it stands.',
    // Nobody owes anyone at the upgrade, which is true (a payment for a debt that never was stays a gift).
    // The opening entries go into the ledger table below, numbered on from the world's ledgerSeq.
    save: ({ world, brains }) => {
      const opened = (world.residents as { money: number }[]).filter((r) => r.money > 0).length;
      return { world: { ...world, debts: [], debtOffers: [], ledgerSeq: (world.ledgerSeq as number) + opened }, brains };
    },
    tables: (db) => {
      // The world as saved at v6 (the snapshot is only rewritten after the steps): money as it stands.
      const row = db.prepare('SELECT world FROM snapshot WHERE id = 1').get() as { world: string } | undefined;
      if (!row) return;
      const world = JSON.parse(row.world) as { t: number; ledgerSeq: number; residents: { id: string; money: number }[] };
      const put = db.prepare('INSERT INTO ledger (seq, t, from_id, to_id, cents, reason) VALUES (?, ?, ?, ?, ?, ?)');
      let seq = world.ledgerSeq;
      for (const r of world.residents) if (r.money > 0) put.run(++seq, world.t, 'kampung-opening', r.id, r.money, 'opening');
    },
  },
  {
    from: 7,
    why: 'Everyone who has lived here knows every place in the kampung (the jetty, the farm plot, the well, the board, the shops, the lorry stop and every house); Ah Kow, who arrived last month, knows the well and the kopitiam.',
    save: ({ world, brains }) => {
      // Owner, 2026-10-25: places are known; how things work is still discovered. Kept in what each knew, appended.
      const residents = (world.residents as { id: string; knownPlaces: string[] }[]).map((r) => {
        const add = (r.id === 'ah-kow' ? NEWCOMER_PLACES_V8 : PLACES_V8).filter((id) => !r.knownPlaces.includes(id));
        return add.length ? { ...r, knownPlaces: [...r.knownPlaces, ...add] } : r;
      });
      return { world: { ...world, residents }, brains };
    },
  },
  {
    from: 8,
    why: 'A buyer can offer less than a shop asks, and whoever minds the counter can take it or turn it down; no offers are waiting yet.',
    save: ({ world, brains }) => ({ world: { ...world, priceOffers: [] }, brains }),
  },
  {
    from: 9,
    why: 'Travellers from the coast road stop at the shops and queue to be served, and cooking takes time at the stove; every shop starts the day with nobody waiting, and nobody is mid-cook.',
    save: ({ world, brains }) => {
      // The day by the time code as it stood at v9 (frozen).
      const day = Math.floor(((world.t as number) + 8 * 60) / 1440);
      const shops = (world.shops as Record<string, unknown>[]).map((s) => ({
        ...s,
        queue: [], serving: [], today: { day, served: 0, cents: 0, left: 0, away: 0, awayTold: 0, tooDear: {}, servedBy: {} }, hour: { served: 0, cents: 0, left: 0 },
      }));
      const residents = (world.residents as Record<string, unknown>[]).map((r) => ({ ...r, stove: null }));
      return { world: { ...world, shops, residents }, brains };
    },
  },
  {
    from: 10,
    why: 'There are chores (fetching water, mending nets, sweeping), paid errands and help between neighbours, and the kopitiam needs a pail of water for kopi and porridge; the kopitiam starts with 4 pails.',
    save: ({ world, brains }) => {
      const shops = (world.shops as { id: string; stock: Record<string, number> }[]).map((s) => ({
        ...s, sweptDay: null, stock: s.id === 'kopitiam' ? { ...s.stock, water: (s.stock.water ?? 0) + 4 } : s.stock,
      }));
      const residents = (world.residents as Record<string, unknown>[]).map((r) => ({ ...r, mended: null }));
      return { world: { ...world, shops, residents, errands: [] }, brains };
    },
  },
  {
    from: 11,
    why: "Mak Esah, Siti's mother, lives with Siti, and Fatimah's children Aminah and Hassan live with her: they were always there, and are at home now. Everyone has a birth year, from their age.",
    save: ({ world, brains }) => {
      // The kampung year at the save's minute, by the calendar as it stood at v11 (frozen): Year 0 has 365 days, then a leap year every fourth.
      let rest = Math.floor(((world.t as number) + 8 * 60) / 1440) - (world.calendar as { firstDay: number }).firstDay;
      const days = (y: number) => (y > 0 && y % 4 === 0 ? 366 : 365);
      let year = 0;
      while (rest >= days(year)) rest -= days(year++);
      const born = (id: string) => year - (AGES_V12[id] ?? 30);
      type R = { id: string; homeId: string; knownPeople: string[] };
      const old = (world.residents as R[]).map((r) => {
        const add = (KNOW_FAMILY_V12[r.id] ?? []).filter((id) => !r.knownPeople.includes(id));
        return { ...r, born: born(r.id), knownPeople: [...r.knownPeople, ...add] };
      });
      const added = FAMILY_V12.flatMap((f) => {
        const host = old.find((r) => r.id === f.livesWith);
        if (!host || old.some((r) => r.id === f.id)) return [];
        // A house's door spot, as the map has it (frozen): house-n's rect starts at x = 1 + 4(n - 1), y = 1, and is 3 × 2.
        const n = Number(/^house-(\d+)$/.exec(host.homeId)?.[1] ?? 1);
        return [{
          id: f.id, name: f.name, role: 'family', born: born(f.id), homeId: host.homeId, pos: { x: 2 + 4 * (n - 1), y: 2 },
          money: 0, items: {}, hunger: 150, energy: 950, activity: null, thinkAt: world.t, recent: [], reply: null, lastDone: null,
          stove: null, mended: null,
          knownPlaces: [host.homeId, ...PLACES_V8.filter((id) => id !== host.homeId)],
          knownPeople: f.knows.filter((id) => old.some((r) => r.id === id) || FAMILY_V12.some((o) => o.id === id)),
        }];
      });
      return { world: { ...world, residents: [...old, ...added] }, brains };
    },
  },
  {
    from: 12,
    why: "Residents get better at fishing, farming and cooking by doing them: the old hands (Rahim, Ah Huat, Mak Esah, Fatimah, Ah Kow, Hassan) start at their levels, everyone else a novice. A master can show someone how. A bed knows when it was ready.",
    save: ({ world, brains }) => {
      // The day by the time code as it stood at v12 (frozen).
      const day = Math.floor(((world.t as number) + 8 * 60) / 1440);
      const residents = (world.residents as { id: string }[]).map((r) => ({
        ...r,
        skills: Object.fromEntries(Object.entries(SKILLS_V13[r.id] ?? {}).map(([s, [peak, xp]]) => [s, { xp, peak, lastDay: day, today: { day, xp: 0 }, rusty: false, drops: 0 }])),
      }));
      // A bed that has just had its two waterings was ready on the later of its last watering and its second day after planting.
      const beds = (world.beds as { plantedDay: number; wateredDays: number; lastWateredDay: number | null }[]).map((b) => ({
        // Only a bed on exactly its second watering can be at its best: one watered on and on is long past it.
        ...b, readyDay: b.wateredDays === 2 && b.lastWateredDay !== null ? Math.max(b.lastWateredDay, b.plantedDay + 2) : null,
      }));
      return { world: { ...world, residents, beds, lessons: [], lessonOffers: [] }, brains };
    },
  },
  {
    from: 13,
    why: "The skilled can cast a net, grow chilli and cook sambal kangkong; a master fisher sometimes lands a red snapper, a master grower can plant a papaya tree, and a master cook's batches go further (and travellers pay a little more where one cooked today). Every bed is growing kangkong, as before; no master has cooked yet today.",
    save: ({ world, brains }) => {
      const beds = (world.beds as Record<string, unknown>[]).map((b) => ({ ...b, crop: 'kangkong', pickedDay: null }));
      const shops = (world.shops as { today: Record<string, unknown> }[]).map((s) => ({ ...s, today: { ...s.today, masterCooked: false } }));
      return { world: { ...world, beds, shops }, brains };
    },
  },
  {
    from: 14,
    why: "Pak Osman the lorry trader comes most mornings about half past six (not on Sundays) for about an hour and a half, with one lorry's worth of room for what he brings and what he buys; he haggles, keeps a book of who owes him, gives regulars credit and takes orders for next time. Nobody has dealt with him yet; a lorry here now stays until eight with the old lorry's goods and prices.",
    save: ({ world, brains }) => {
      if (world.osman) return { world, brains };
      // The day and minute of the day by the time code as it stood at v14 (frozen).
      const t = world.t as number;
      const day = Math.floor((t + 8 * 60) / 1440);
      const mod = (((t + 8 * 60) % 1440) + 1440) % 1440;
      const visit = world.lorryHere === true ? {
        day, leaves: t - mod + 8 * 60, goods: { ...LORRY_V15.goods }, held: {}, produce: {},
        sells: { ...LORRY_V15.sells }, buys: { ...LORRY_V15.buys }, priced: true, haggles: 0, deals: {}, offers: [], gossip: null, heard: [],
      } : null;
      // The old lorry came at seven: once it had come today, that was today's lorry.
      return { world: { ...world, osman: { lastDay: mod >= 7 * 60 ? day : null, visit, accounts: {}, orders: [] } }, brains };
    },
  },  {
    from: 15,
    why: "Every house has a small stove: anyone can cook a plain dish at home with firewood gathered past the farm plot or a tin of kerosene from Pak Osman, a small pot of two servings into their own hands. Every stove starts with no kerosene in it.",
    save: ({ world, brains }) => ({ world: { ...world, stoves: world.stoves ?? {}, faintSeen: world.faintSeen ?? {} }, brains }),
  },  {
    from: 16,
    why: "Residents now hold trust and fondness for each person they know, moved only by deeds (gifts, help, trades, debts repaid, wages, broken words, turned-down pleas, talk). Each starts where it stands: family dear and trusted, old friends friends, anyone else neither.",
    save: ({ world, brains }) => {
      if (world.bonds) return { world, brains };
      const bonds: Record<string, unknown> = {};
      for (const r of world.residents as { id: string; knownPeople: string[] }[]) {
        for (const b of r.knownPeople) {
          const key = `${r.id}>${b}`;
          const start = KIN_V17.has(key) ? [50, 75] : FRIENDS_V17.has(key) ? [40, 40] : [0, 0];
          bonds[key] = { trust: start[0], fondness: start[1], day: 0, talk: 0, traded: false };
        }
      }
      return { world: { ...world, bonds }, brains };
    },
  },
];

/** The save version this code writes and reads. */
export const SCHEMA_VERSION = UPGRADES.length + 1;
