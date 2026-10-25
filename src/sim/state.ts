import type { ItemId } from './items.ts';
import type { Point } from './map.ts';
import type { Cents } from './money.ts';
import type { EventBody, GameEvent, LedgerEntry } from './events.ts';
import { PLACE_BY_ID, PLACES, inPlace, distance, placeAt, type Place } from './map.ts';
import { Rng } from './rng.ts';
import type { EventBody as Body } from './events.ts';
import type { Calendar } from './calendar.ts';
import type { GameClock } from './time.ts';

export type Role = 'owner' | 'seeker';
export type Goods = Partial<Record<ItemId, number>>;

/** Needs run 0–1000. Hunger 0 is full; energy 1000 is fully rested. */
export const NEED_MAX = 1000;

export type Activity =
  | { kind: 'walking'; path: Point[]; dest: string | null; thenSleep: boolean }
  | { kind: 'fishing'; until: number }
  | { kind: 'working'; jobId: number; until: number; worked: number }
  | { kind: 'sleeping'; reason: 'night' | 'nap' | 'collapse'; until: number | null; rough?: true };

export interface Observation {
  t: number;
  text: string;
  /** A line of a conversation they're part of: said to them, to everyone, or by them. */
  talk?: true;
}

export interface Resident {
  id: string;
  name: string;
  role: Role;
  /** The house they live in; null for nobody's, so they sleep rough. */
  homeId: string | null;
  /** Who they're married to, if anyone. */
  spouseId: string | null;
  pos: Point;
  money: Cents;
  items: Goods;
  hunger: number;
  energy: number;
  activity: Activity | null;
  /** Earliest game minute this resident thinks again. */
  thinkAt: number;
  /** Recent things they saw or heard, newest last. */
  recent: Observation[];
  /** What happened when they last tried something, shown when they next think. */
  reply: { ok: boolean; text: string } | null;
  /** The last thing they did that went through (written the same way each time), and when: doing it again straight away doesn't bring the next thought on. */
  lastDone: { what: string; t: number } | null;
  /** Place ids they know of: seen, or heard named. They start knowing only home. */
  knownPlaces: string[];
  /** Resident ids they've met. */
  knownPeople: string[];
}

export interface Shop {
  /** Same as the place id. */
  id: string;
  ownerId: string;
  stock: Goods;
  sellPrices: Partial<Record<ItemId, Cents>>;
  buyPrices: Partial<Record<ItemId, Cents>>;
  /** How many more the owner will buy at the posted price; no entry means no limit. */
  buyLimits: Partial<Record<ItemId, number>>;
}

export interface Job {
  id: number;
  employerId: string;
  workerId: string;
  placeId: string;
  wage: Cents;
  startHour: number;
  hours: number;
  lastWorkedDay: number | null;
}

export interface JobOffer {
  id: number;
  employerId: string;
  workerId: string;
  wage: Cents;
  startHour: number;
  hours: number;
  expires: number;
}

export interface Bundle { items: Goods; cents: Cents }

export interface TradeOffer {
  id: number;
  fromId: string;
  toId: string;
  give: Bundle;
  want: Bundle;
  expires: number;
}

export interface Owed { employerId: string; workerId: string; cents: Cents }

export interface Bed {
  n: number;
  planterId: string | null;
  plantedDay: number;
  wateredDays: number;
  lastWateredDay: number | null;
}

export interface Note { id: number; authorId: string; text: string; t: number }

/** A house and who heads it (holds it); null when nobody does. */
export interface House { id: string; holderId: string | null }

/** Someone offered someone a home in the house they head. */
export interface HomeOffer { id: number; fromId: string; toId: string; houseId: string; expires: number }

/** Someone asked someone to marry them. */
export interface Proposal { id: number; fromId: string; toId: string; expires: number }

/** How close two people have grown: game days on which both spoke to the other (keyed by talkKey). */
export interface Bond { days: number; day: number; a: boolean; b: boolean }

/** Something the town hears of on the next minute (an upgrade's moves, say): an event, and who is told what. */
export interface NewsItem { event: Body; tell: { id: string; text: string }[] }

export interface WorldState {
  /** The save version (SCHEMA_VERSION); older saves are upgraded on load (docs/design/upgrades.md). */
  version: number;
  seed: number;
  /** Last game minute simulated. */
  t: number;
  /** Ties game minutes to real time (4 game minutes a real minute). */
  clock: GameClock;
  /** Where the kampung's calendar starts (1 January, Year 0). */
  calendar: Calendar;
  rng: number;
  nextId: number;
  eventSeq: number;
  ledgerSeq: number;
  residents: Resident[];
  shops: Shop[];
  jobs: Job[];
  jobOffers: JobOffer[];
  trades: TradeOffer[];
  owed: Owed[];
  beds: Bed[];
  notes: Note[];
  lorryHere: boolean;
  /** Keys of one-off notable things that already happened (e.g. a shop's first sale). */
  firsts: string[];
  /** Lines spoken between each pair lately ("a|b" sorted), for the talk soft limit. */
  talk: Record<string, { lines: number; lastT: number }>;
  /** Every house and who heads it. */
  houses: House[];
  homeOffers: HomeOffer[];
  proposals: Proposal[];
  /** How close each pair has grown ("a|b" sorted). */
  bonds: Record<string, Bond>;
  /** Told on the next minute, then cleared. */
  news: NewsItem[];
}

export const LORRY_ID = 'lorry';
export const FARM_BEDS = 8;
export const MAX_RECENT = 12;
export const NEARBY_TILES = 3;
/** M2 decision 1: after about this many lines between two people, the listener isn't woken to answer at once. */
export const TALK_SOFT_LIMIT = 8;
/** A conversation counts as over after this many quiet minutes. */
export const TALK_GAP_MINUTES = 30;

export function talkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The live world: state plus the RNG and buffers of new events and money movements. */
export class World {
  state: WorldState;
  rng: Rng;
  private events: GameEvent[] = [];
  private ledger: LedgerEntry[] = [];
  /** Hears every observation a resident takes in (a mind keeps them as memories). */
  observer: ((residentId: string, t: number, text: string) => void) | null = null;

  constructor(state: WorldState) {
    this.state = state;
    this.rng = new Rng(0);
    this.rng.state = state.rng;
  }

  get t(): number {
    return this.state.t;
  }

  emit(body: EventBody): GameEvent {
    const e = { seq: ++this.state.eventSeq, t: this.state.t, ...body } as GameEvent;
    this.events.push(e);
    return e;
  }

  /** Moves money. 'lorry' is outside the town: money appears from or vanishes into it. */
  transfer(fromId: string, toId: string, cents: Cents, reason: string): void {
    if (!Number.isInteger(cents) || cents <= 0) throw new Error(`bad transfer amount ${cents}`);
    if (fromId !== LORRY_ID) {
      const from = this.resident(fromId);
      if (from.money < cents) throw new Error(`${fromId} cannot cover ${cents}`);
      from.money -= cents;
    }
    if (toId !== LORRY_ID) this.resident(toId).money += cents;
    this.ledger.push({ seq: ++this.state.ledgerSeq, t: this.state.t, from: fromId, to: toId, cents, reason });
  }

  takeEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  takeLedger(): LedgerEntry[] {
    const out = this.ledger;
    this.ledger = [];
    return out;
  }

  nextId(): number {
    return ++this.state.nextId;
  }

  /** A deep copy of the state, safe to save. */
  snapshot(): WorldState {
    this.state.rng = this.rng.state;
    return structuredClone(this.state);
  }

  resident(id: string): Resident {
    const r = this.state.residents.find((x) => x.id === id);
    if (!r) throw new Error(`no resident ${id}`);
    return r;
  }

  residentByName(name: unknown): Resident | null {
    if (typeof name !== 'string') return null;
    const s = name.trim().toLowerCase();
    return this.state.residents.find((r) => r.name.toLowerCase() === s) ?? null;
  }

  shop(id: string): Shop | null {
    return this.state.shops.find((s) => s.id === id) ?? null;
  }

  shopOf(ownerId: string): Shop | null {
    return this.state.shops.find((s) => s.ownerId === ownerId) ?? null;
  }

  placeOf(r: Resident): Place | null {
    return placeAt(r.pos.x, r.pos.y);
  }

  /** Where they live, or null if nowhere. */
  home(r: Resident): Place | null {
    return r.homeId ? PLACE_BY_ID.get(r.homeId)! : null;
  }

  /** Whether they're in their own home (never, with none). */
  atHome(r: Resident): boolean {
    return r.homeId !== null && this.isAt(r, r.homeId);
  }

  isAt(r: Resident, placeId: string): boolean {
    return inPlace(PLACE_BY_ID.get(placeId)!, r.pos);
  }

  /** Same place, or within a few tiles in the open. */
  isNear(a: Resident, b: Resident): boolean {
    if (a.id === b.id) return true;
    const pa = this.placeOf(a);
    if (pa && pa === this.placeOf(b)) return true;
    return distance(a.pos, b.pos) <= NEARBY_TILES;
  }

  nearby(r: Resident): Resident[] {
    return this.state.residents.filter((o) => o.id !== r.id && this.isNear(r, o));
  }

  isAsleep(r: Resident): boolean {
    return r.activity?.kind === 'sleeping';
  }

  /** In-world name of a place; a house is named after whoever heads it ("Ah Huat's house"), an empty one by its number. */
  placeName(p: Place): string {
    if (p.kind !== 'house') return p.name;
    const holder = this.state.houses.find((h) => h.id === p.id)?.holderId;
    const owner = holder ? this.state.residents.find((r) => r.id === holder) : undefined;
    return owner ? `${owner.name}'s house` : p.name;
  }

  jobOf(workerId: string): Job | null {
    return this.state.jobs.find((j) => j.workerId === workerId) ?? null;
  }

  /** Something happened to this resident: they remember it and think again soon. */
  notify(id: string, text: string, talk = false): void {
    this.remember(id, text, talk);
    const r = this.resident(id);
    r.thinkAt = Math.min(r.thinkAt, this.state.t + 1);
  }

  knowsPlace(r: Resident, placeId: string): boolean {
    return r.knownPlaces.includes(placeId);
  }

  knowsPerson(r: Resident, otherId: string): boolean {
    return r.id === otherId || r.knownPeople.includes(otherId);
  }

  learnPlace(r: Resident, placeId: string): void {
    if (r.knownPlaces.includes(placeId)) return;
    r.knownPlaces.push(placeId);
    emitDiscovery(this, r, placeId);
  }

  learnPerson(r: Resident, otherId: string): void {
    if (otherId !== r.id && !r.knownPeople.includes(otherId)) r.knownPeople.push(otherId);
  }

  remember(id: string, text: string, talk = false): void {
    this.observer?.(id, this.state.t, text);
    const r = this.resident(id);
    r.recent.push(talk ? { t: this.state.t, text, talk } : { t: this.state.t, text });
    if (r.recent.length > MAX_RECENT) r.recent.splice(0, r.recent.length - MAX_RECENT);
  }
}

function emitDiscovery(w: World, r: Resident, placeId: string): void {
  const place = PLACE_BY_ID.get(placeId);
  if (place && place.kind !== 'house') w.emit({ type: 'found_place', who: r.id, place: placeId });
}

export function addGoods(g: Goods, item: ItemId, n: number): void {
  const v = (g[item] ?? 0) + n;
  if (v < 0) throw new Error(`negative ${item}`);
  if (v === 0) delete g[item];
  else g[item] = v;
}

export function countGoods(g: Goods, item: ItemId): number {
  return g[item] ?? 0;
}

export const HOUSE_IDS = PLACES.filter((p) => p.kind === 'house').map((p) => p.id);
