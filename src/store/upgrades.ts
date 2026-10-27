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
          const start = KIN_V17.has(key) ? [50, 60] : FRIENDS_V17.has(key) ? [40, 40] : [0, 0];
          bonds[key] = { trust: start[0], fondness: start[1], day: 0, talk: 0, counted: [] };
        }
      }
      // Nothing that happened before counts: deals talked of already are past holding anyone to, and wages owed start their day now.
      const talk = Object.fromEntries(Object.entries(world.talk as Record<string, { word: Record<string, unknown> | null }>)
        .map(([k, rec]) => [k, rec.word ? { ...rec, word: { ...rec.word, broken: true } } : rec]));
      const day = Math.floor(((world.t as number) + 8 * 60) / 1440);
      const owed = (world.owed as Record<string, unknown>[]).map((o) => ({ ...o, since: day }));
      return { world: { ...world, bonds, talk, owed }, brains };
    },
  },
  {
    from: 17,
    why: "Someone who has said three things in a row to a person who hasn't answered can see they aren't answering. Nobody's count has started yet.",
    save: ({ world, brains }) => ({ world, brains }),
  },
  {
    from: 18,
    why: "Households: Ah Seng moves in with his father and Mei Ling with her aunt, so two houses stand free. Mr Lim the village head, at his house up the path, owns every house and stall: each household rents its place (50 cents a week a house, a dollar a stall) on his Monday round into the village fund, the first rent due on the Monday at least four weeks on. A place can be bought outright or week by week; rent owing over a week and the household is out, sleeping rough at the jetty.",
    save: ({ world, brains }) => {
      if (world.property) return { world, brains };
      type R = { id: string; homeId: string; knownPlaces: string[] };
      const residents = (world.residents as R[]).map((r) => ({ ...r, knownPlaces: [...r.knownPlaces] }));
      const homeOf = (id: string) => residents.find((r) => r.id === id)?.homeId;
      const stoves = { ...(world.stoves as Record<string, number>) };
      for (const [who, host] of [['ah-seng', 'ah-huat'], ['mei-ling', 'mdm-tan']] as const) {
        const r = residents.find((x) => x.id === who);
        const to = homeOf(host);
        if (!r || !to || r.homeId === to) continue;
        // Any kerosene left in the old stove goes with them.
        if (stoves[r.homeId]) stoves[to] = (stoves[to] ?? 0) + stoves[r.homeId]!;
        delete stoves[r.homeId];
        r.homeId = to;
      }
      // Everyone who has lived here knows the village head's house (Ah Kow, the newcomer, finds it).
      for (const r of residents) if (r.id !== 'ah-kow' && !r.knownPlaces.includes('village-head')) r.knownPlaces.push('village-head');
      const property: Record<string, unknown> = {};
      for (let n = 1; n <= 10; n++) {
        const id = `house-${n}`;
        property[id] = { holder: residents.find((r) => r.homeId === id)?.id ?? null, rent: 50, owned: false, rentToOwn: null, owing: 0, since: null };
      }
      for (const shop of world.shops as { id: string; ownerId: string }[]) {
        property[shop.id] = { holder: shop.ownerId, rent: 100, owned: false, rentToOwn: null, owing: 0, since: null };
      }
      // The first Monday at least 28 days on, by the kampung's calendar as it stood (day 1 of Year 0 a Monday).
      const firstDay = (world.calendar as { firstDay: number }).firstDay;
      const today = Math.floor(((world.t as number) + 8 * 60) / 1440);
      let rentFrom = today + 28;
      while ((((rentFrom - firstDay) % 7) + 7) % 7 !== 0) rentFrom++;
      return { world: { ...world, residents, stoves, property, rentFrom, rentNoticed: false, lastRoundDay: 0, arrears: {}, evictedWith: {}, fund: 0 }, brains };
    },
  },
  {
    from: 19,
    why: "Making a living: anyone can forage a little (wild kangkong or bananas past the farm plot, a coconut off the jetty's palms, twice a day), a day faint with hunger brings sickness (never death; well again about six hours after eating enough), and shopkeepers see what travellers who left unserved would have paid. Nobody has foraged or is ill yet; anyone already faint starts their day's count from now.",
    save: ({ world, brains }) => {
      const t = world.t as number;
      // Faint with hunger was 950 and over at v19.
      const residents = (world.residents as { hunger: number }[]).map((r) => ({ ...r, foraged: null, faintFrom: r.hunger >= 950 ? t : null, ill: null }));
      const shops = (world.shops as { today: Record<string, unknown> }[]).map((s) => ({ ...s, today: { ...s.today, lost: 0 } }));
      return { world: { ...world, residents, shops, illSeen: world.illSeen ?? {} }, brains };
    },
  },
  {
    from: 20,
    why: "Mr Lim is seen about: at his door by day, out to the notice board each morning, round the houses on Monday mornings. Each morning he pins two or three paid odd jobs, an hour's work each at its place, paid from his own purse when done, one a day each. None is pinned yet; anyone at a chore is at no job of his.",
    save: ({ world, brains }) => {
      const residents = (world.residents as { activity: Record<string, unknown> | null }[]).map((r) =>
        (r.activity && r.activity.kind === 'chore' && !('job' in r.activity) ? { ...r, activity: { ...r.activity, job: null } } : r));
      return { world: { ...world, residents, oddJobs: world.oddJobs ?? [], oddJobsDay: world.oddJobsDay ?? -1 }, brains };
    },
  },
  {
    from: 21,
    why: "Talk that goes round in circles is told by what is said, not only by the clock; a day's plan that keeps coming to nothing is let go; word of the rent reaches each holder awake (everyone holding a place hears it once more, so nobody who was asleep misses it).",
    save: ({ world, brains }) => {
      // Rent word again for every holder, if rent hasn't started yet.
      const today = Math.floor(((world.t as number) + 8 * 60) / 1440);
      const before = today < (world.rentFrom as number);
      const told = (world.rentToldTo as string[] | undefined) ?? [];
      const out = { ...world, rentToldTo: told, rentNoticed: before ? false : world.rentNoticed };
      // A thinking resident's saved mind counts misses against today's plan, from none.
      const minds = Object.fromEntries(Object.entries(brains as Record<string, unknown>).map(([id, b]) =>
        [id, b && typeof b === 'object' && 'budget' in b && !('planMisses' in b) ? { ...(b as object), planMisses: 0 } : b]));
      return { world: out, brains: minds };
    },
  },
  {
    from: 22,
    why: "Where cooking happens: anyone with a bundle of firewood can light a cooking fire at the jetty or on the beach, for grilled fish or (with a pot, now off the lorry) bubur; and Mr Lim starts having a village kitchen built below his path through paid odd jobs, for anyone to cook in once it's up. Everyone who knows the village head's house knows where the kitchen is going.",
    save: ({ world, brains }) => {
      type R = { knownPlaces: string[] };
      const residents = (world.residents as R[]).map((r) => (r.knownPlaces.includes('village-head') && !r.knownPlaces.includes('village-kitchen')
        ? { ...r, knownPlaces: [...r.knownPlaces, 'village-kitchen'] } : r));
      const oddJobs = ((world.oddJobs as Record<string, unknown>[] | undefined) ?? []).map((j) => ('project' in j ? j : { ...j, project: null }));
      const projects = (world.projects as unknown[] | undefined) ?? [{ id: 'village-kitchen', done: [], builtDay: null }];
      return { world: { ...world, residents, oddJobs, projects, fires: world.fires ?? [] }, brains };
    },
  },
  {
    from: 23,
    why: "The kampung school: Mr Lim starts having a schoolhouse built near his house through paid odd jobs; once it's open, Miss de Souza teaches the children English on weekday mornings and grown-ups in the evening. English is now something residents can get better at; Mei Ling, Ah Seng and Raju, who have some English, start with a few words of it.",
    save: ({ world, brains }) => {
      const today = Math.floor(((world.t as number) + 8 * 60) / 1440);
      // A few words of English: Handy, 5% of the 3,200 deeds to Master, as English stood at v24.
      const someEnglish = { xp: 160, peak: 2, lastDay: today, today: { day: today, xp: 0 }, rusty: false, drops: 0 };
      type R = { id: string; knownPlaces: string[]; skills: Record<string, unknown> };
      const residents = (world.residents as R[]).map((r) => {
        let out = r;
        if (r.knownPlaces.includes('village-head') && !r.knownPlaces.includes('schoolhouse')) out = { ...out, knownPlaces: [...r.knownPlaces, 'schoolhouse'] };
        if (['mei-ling', 'ah-seng', 'raju'].includes(r.id) && !r.skills.english) out = { ...out, skills: { ...r.skills, english: someEnglish } };
        return out;
      });
      const projects = [...((world.projects as { id: string }[] | undefined) ?? [])];
      if (!projects.some((p) => p.id === 'schoolhouse')) projects.push({ id: 'schoolhouse', done: [], builtDay: null } as never);
      return { world: { ...world, residents, projects }, brains };
    },
  },
  {
    from: 24,
    why: "Mr Lim helps in hard times: any grown-up may ask at his door for a small loan (paid back a little at each Monday round) or, owing rent, a week's grace. Nobody owes him a loan yet, and no grace has been given.",
    save: ({ world, brains }) => {
      const property = Object.fromEntries(Object.entries(world.property as Record<string, Record<string, unknown>>)
        .map(([id, p]) => [id, 'grace' in p ? p : { ...p, grace: null }]));
      return { world: { ...world, property, loans: world.loans ?? [] }, brains };
    },
  },
  {
    from: 25,
    why: "Houses go by offer: Mr Lim takes offers at his door for a house standing free (a rent a week, or a price to buy) or to buy the place you hold, and answers each evening. No fixed prices, and no new rent-to-own; deals already running finish on their terms. No offers yet; every free house counts as free from the day of the upgrade.",
    save: ({ world, brains }) => {
      const today = Math.floor(((world.t as number) + 480) / 1440);
      const property = Object.fromEntries(Object.entries(world.property as Record<string, Record<string, unknown>>)
        .map(([id, p]) => [id, 'freeSince' in p ? p : { ...p, freeSince: p.holder === null ? today : null }]));
      return { world: { ...world, property, placeOffers: world.placeOffers ?? [], offersDay: world.offersDay ?? -1 }, brains };
    },
  },
  {
    from: 26,
    why: "A sitting tenant's rent can change: on Monday evenings Mr Lim may give a week's notice of a new rent, which the tenant agrees to at his door or leaves when it starts. No notices given yet.",
    save: ({ world, brains }) => {
      const property = Object.fromEntries(Object.entries(world.property as Record<string, Record<string, unknown>>)
        .map(([id, p]) => [id, 'notice' in p ? p : { ...p, notice: null }]));
      return { world: { ...world, property, rentReviewDay: world.rentReviewDay ?? -1 }, brains };
    },
  },
  {
    from: 27,
    why: 'A house a resident owns can be sold or let to another, at any price they agree: offered and agreed in person. A tenant of theirs pays them at the Monday round, and a landlord changes the rent with a week\'s notice, as Mr Lim does. Nobody lets to anybody yet.',
    save: ({ world, brains }) => {
      const property = Object.fromEntries(Object.entries(world.property as Record<string, Record<string, unknown>>)
        .map(([id, p]) => [id, 'landlord' in p ? p : { ...p, landlord: null }]));
      return { world: { ...world, property, placeDeals: world.placeDeals ?? [] }, brains };
    },
  },
  {
    from: 28,
    why: "A stall can stand free: let go for rent owing (or a new rent never agreed), its keeper takes the stock home and it's shut until someone takes it, by offer at Mr Lim's door. Stalls join Mr Lim's rent review, and a stall someone owns can be sold or let between residents. Every stall is kept as it was.",
    save: ({ world, brains }) => ({ world, brains }),
  },
];

/** The save version this code writes and reads. */
export const SCHEMA_VERSION = UPGRADES.length + 1;
