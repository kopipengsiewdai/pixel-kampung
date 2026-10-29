import { deed } from './bonds.ts';
import { DEFAULT_DIALS, type Dials } from './dials.ts';
import type { ItemId } from './items.ts';
import { settledBy, settles, type DealKind, type Settles } from './talk.ts';
import type { Point } from './map.ts';
import type { Cents } from './money.ts';
import type { EventBody, GameEvent, LedgerEntry } from './events.ts';
import { PLACE_BY_ID, PLACES, inPlace, distance, placeAt, type Place } from './map.ts';
import { Rng } from './rng.ts';
import { dateAt, type Calendar } from './calendar.ts';
import { CAST } from '../seed/cast.ts';
import type { Lesson, LessonOffer, SkillId, SkillState } from './skills.ts';
import type { GameClock } from './time.ts';
import type { OsmanState } from './osman.ts';
import type { Proposal } from './marriage.ts';

/** An owner runs a business; a seeker looks for work; family live with family (Mak Esah, Aminah, Hassan). */
export type Role = 'owner' | 'seeker' | 'family';

/** Under this age, nobody works a shift (owner, 2026-10-25). */
export const GROWN_AGE = 14;
/** From this age, a body tires quicker. */
export const OLD_AGE = 60;
export type Goods = Partial<Record<ItemId, number>>;

/** Needs run 0–1000. Hunger 0 is full; energy 1000 is fully rested. */
export const NEED_MAX = 1000;

export type Activity =
  | { kind: 'walking'; path: Point[]; dest: string | null; thenSleep: boolean }
  | { kind: 'fishing'; until: number }
  | { kind: 'working'; jobId: number; until: number; worked: number }
  | { kind: 'sleeping'; reason: 'night' | 'nap' | 'collapse'; until: number | null }
  /** At school (a child, mornings) or the evening English class (a grown-up): until when, and minutes learnt. */
  | { kind: 'school'; until: number; adult: boolean; learnt: number }
  /** A chore (daily-life.md C): fetching water, mending nets (their own, or helping someone's), sweeping a shop. A worker on shift keeps the shift held in it. */
  | { kind: 'chore'; chore: ChoreKind; until: number; shopId: string | null; forId: string | null; shift: { jobId: number; until: number; worked: number } | null; job: number | null };

export type ChoreKind = 'fetch_water' | 'mend_nets' | 'sweep' | 'cast_net' | 'gather_wood' | 'forage' | 'odd_job';
/** What a bed grows: kangkong, or for the skilled chilli, and for a master a papaya tree. */
export type Crop = 'kangkong' | 'chilli' | 'papaya';

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
  /** The kampung year they were born (age = this year minus it; a birthday is new year). */
  born: number;
  /** Their house; a house can be shared, and goes by the first who lives there. */
  homeId: string;
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
  /** A batch cooking at a shop's stove: busy until it's done (daily-life.md B). */
  stove: { item: ItemId; batches: number; qty: number; shopId: string; until: number } | null;
  /** Nets mended today: the next few catches bring one more fish. */
  mended: { day: number; left: number } | null;
  /** Place ids they know of: seen, or heard named. They start knowing only home. */
  knownPlaces: string[];
  /** Resident ids they've met. */
  knownPeople: string[];
  /** What they've got better at by doing it (docs/design/skills.md); none yet means a novice. */
  skills: Partial<Record<SkillId, SkillState>>;
  /** Forages today (subsistence.md Q1): the day, and how many. */
  foraged: { day: number; n: number } | null;
  /** Since when they've been faint with hunger without a break (subsistence.md Q4). */
  faintFrom: number | null;
  /** Ill from hunger: since when, and since when they've been getting better (hunger first fell below hungry; null until then, or since going faint again). */
  ill: { since: number; better: number | null } | null;
  /** Who they're married to (households.md, Marriage), if anyone. */
  spouseId: string | null;
  /** Where (in words, as it was then: "at home", "at the well") and when they last saw each other resident themselves. */
  lastSeen: Record<string, { where: string; t: number }>;
  /** Money they gave each other resident today, and whether anything came back from them (meals.ts). */
  given: Record<string, { day: number; cents: number; got: boolean }>;
}

export interface Shop {
  /** Same as the place id. */
  id: string;
  /** Its keeper; null while it stands free (let go by Mr Lim), shut. */
  ownerId: string | null;
  stock: Goods;
  sellPrices: Partial<Record<ItemId, Cents>>;
  buyPrices: Partial<Record<ItemId, Cents>>;
  /** How many more the owner will buy at the posted price; no entry means no limit. */
  buyLimits: Partial<Record<ItemId, number>>;
  /** Travellers waiting to be served, oldest first: what each wants and when they came. */
  queue: { item: ItemId; t: number }[];
  /** Who is serving a traveller now, what, and until when. */
  serving: { by: string; item: ItemId; until: number }[];
  /** Today's travellers: served (and what they spent), left unserved, found nobody serving (and how many of those the owner has heard of), turned away by price, served by whom, and what those left unserved would have paid. */
  today: { day: number; served: number; cents: Cents; left: number; away: number; awayTold: number; tooDear: Partial<Record<ItemId, number>>; servedBy: Record<string, number>; masterCooked: boolean; lost: Cents };
  /** This hour's travellers, for the hourly feed line. */
  hour: { served: number; cents: Cents; left: number };
  /** The day it was last swept: travellers wait longer in a swept shop. */
  sweptDay: number | null;
  /** Dishes the keeper has stopped selling: what they cook of these stays off the counter. */
  notSelling: ItemId[];
}

/** A shop with a keeper: open for trade. */
export type KeptShop = Shop & { ownerId: string };
export const isKept = (s: Shop | null | undefined): s is KeptShop => !!s && s.ownerId !== null;

/** A paid errand (daily-life.md C): asked, then taken up, then done when the runner hands the thing over. */
export interface Errand {
  id: number;
  askerId: string;
  runnerId: string;
  kind: 'water' | 'take';
  /** For "take": what, and to whom. */
  item: ItemId | null;
  toId: string | null;
  cents: Cents;
  taken: boolean;
  /** Asked: lapses unanswered; taken: lapses at the day's end. */
  expires: number;
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

/** since: the day the wages were first owed (relationships.md: a full waking day unpaid costs trust). */
export interface Owed { employerId: string; workerId: string; cents: Cents; since?: number }

/**
 * Money one account owes another (daily-life.md A). Accounts are residents'
 * ids for now; later also outside accounts. One per debtor, creditor and kind:
 * a new debt adds to it, keeping when it began.
 */
export interface Debt {
  id: number;
  debtor: string;
  creditor: string;
  cents: Cents;
  since: number;
  kind: 'loan' | 'iou';
  /** No due dates yet (owner, 2026-10-25). */
  due: number | null;
  /** An IOU's words: what it's for. */
  what: string | null;
}

/** A price offered at a shop's counter, below what it asks: waiting on whoever minds the counter. */
export interface PriceOffer {
  id: number;
  buyerId: string;
  shopId: string;
  item: ItemId;
  qty: number;
  /** The whole sum offered. */
  cents: Cents;
  expires: number;
}

/** Money offered or asked about, waiting on the other one's yes: a loan offered, a loan asked for, or an IOU. */
export interface DebtOffer {
  id: number;
  kind: 'lend' | 'borrow' | 'iou';
  /** Who offered or asked. */
  fromId: string;
  /** Who it waits on. */
  toId: string;
  cents: Cents;
  what: string | null;
  expires: number;
}

export interface Bed {
  n: number;
  planterId: string | null;
  plantedDay: number;
  wateredDays: number;
  lastWateredDay: number | null;
  /** The day it ripens, once it's had its waterings: harvested that day, it gives more. */
  readyDay: number | null;
  crop: Crop;
  /** A papaya tree: the day its fruit was last picked. */
  pickedDay: number | null;
}

export interface Note { id: number; authorId: string; text: string; t: number }

/** One of Mr Lim's paid odd jobs (subsistence.md Q3.1): what, where, its pay, the day it was pinned, who did it, and its note. */
export interface OddJob { id: number; kind: string; placeId: string; pay: Cents; day: number; doneBy: string | null; noteId: number; project: string | null }

/** Something Mr Lim has built through odd jobs: which of its jobs are done, and the day it was finished. */
export interface Project { id: string; done: number[]; builtDay: number | null }

/** A cooking fire: where, who lit it, and when it burns out. */
export interface Fire { id: number; x: number; y: number; by: string; until: number }

export interface WorldState {
  /** The save version (SCHEMA_VERSION); older saves are upgraded on load (docs/design/upgrades.md). */
  version: number;
  seed: number;
  /** Last game minute simulated. */
  t: number;
  /** Ties game minutes to real time (a game day every five real hours). */
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
  debts: Debt[];
  debtOffers: DebtOffer[];
  priceOffers: PriceOffer[];
  errands: Errand[];
  /** Masters showing someone how, today; and offers to, waiting. */
  lessons: Lesson[];
  lessonOffers: LessonOffer[];
  /** Asked to marry, waiting on a yes or no until the end of the day. */
  proposals: Proposal[];
  beds: Bed[];
  notes: Note[];
  /** Whether the lorry is at the stop (Pak Osman's visit, below, is the whole of it). */
  lorryHere: boolean;
  /** Pak Osman the lorry trader: today's visit, his ledger of residents and what he's been asked to bring. */
  osman: OsmanState;
  /** Batches of kerosene left in each house's stove, by house id (docs/design/home-cooking.md). */
  stoves: Record<string, number>;
  /** The day each resident last took in a relative faint with hunger, by "who>whom". */
  faintSeen: Record<string, number>;
  /** The day each resident last took in a relative looking ill, by "who>whom" (subsistence.md Q4). */
  illSeen: Record<string, number>;
  /** Each resident's view of each person they know, by "who>whom" (docs/design/relationships.md). */
  bonds: Record<string, Bond>;
  /** Every house and stall, by place id, and who holds it (households.md). */
  property: Record<string, Property>;
  /** Offers waiting on Mr Lim's answer, one a person, and the last day he answered them. */
  placeOffers: PlaceOffer[];
  offersDay: number;
  /** The Monday he last looked over the rents. */
  rentReviewDay: number;
  placeDeals: PlaceDeal[];
  /** The day rent is first due (a Monday), and whether everyone has been told. */
  rentFrom: number;
  rentNoticed: boolean;
  /** The holders who have heard when rent starts (each hears it awake). */
  rentToldTo: string[];
  /** The last Monday Mr Lim came round. */
  lastRoundDay: number;
  /** Mr Lim's hardship loans still owed, by whom, and what they pay back a round (a week's rent); repaid into the fund. */
  loans: { who: string; owed: Cents; weekly: Cents }[];
  /** Rent still owed from a house lost, by who held it. */
  arrears: Record<string, Cents>;
  /** Who each person sleeping rough was turned out with (the holder), so they come home together. */
  evictedWith: Record<string, string>;
  /** What the village fund holds, in cents. */
  fund: number;
  /** Mr Lim's odd jobs pinned today (and any done), and the day he last pinned them. */
  oddJobs: OddJob[];
  oddJobsDay: number;
  /** What Mr Lim is building, or has built, through odd jobs. */
  projects: Project[];
  /** Cooking fires burning outdoors. */
  fires: Fire[];
  /** Keys of one-off notable things that already happened (e.g. a shop's first sale). */
  firsts: string[];
  /** Lines spoken between each pair lately ("a|b" sorted), for the talk soft limit. */
  talk: Record<string, TalkRecord>;
}

/** A house or stall: who holds it, its rent a week, whether bought, buying week by week, what's owed and since what day. */
export interface Property {
  /** A week's grace Mr Lim has given on rent owing: until which day, and the day he gave it (hardship help). */
  grace: { until: number; given: number } | null;
  /** The day it was last left free (null while someone holds it). */
  freeSince: number | null;
  /** A new rent the holder has been given notice of (by Mr Lim, or their landlord): from which day, and whether they've agreed (a lower rent needs no agreeing). */
  notice: { rent: Cents; from: number; agreed: boolean } | null;
  /** A resident who owns it and lets it to the holder (null: it's Mr Lim's, or the holder's own). */
  landlord: string | null;
  holder: string | null;
  rent: Cents;
  owned: boolean;
  rentToOwn: { paid: number; of: number } | null;
  owing: Cents;
  since: number | null;
}

/** An offer between residents to sell or let a house one of them owns, standing until agreed, refused or lapsed. */
export interface PlaceDeal { id: number; fromId: string; toId: string; placeId: string; kind: 'sale' | 'let'; cents: Cents; expires: number; /** Whose it was, and whether let, when offered: it stands only while that's so. */ ownerId: string; wasLet: boolean }

/** An offer made at Mr Lim's door (households-build.md "Housing market"): for a house standing free (no place), or to buy the place they hold. */
export interface PlaceOffer { id: number; placeId: string | null; who: string; kind: 'rent' | 'buy'; cents: Cents; t: number }

/** One resident's view of another: trust (money, keeping your word) and fondness (company, kindness), -100 to 100. */
export interface Bond {
  trust: number;
  fondness: number;
  /** The day the counts below are for: warmth from talk today, and the kinds of deed already counted today. */
  day: number;
  talk: number;
  counted: string[];
}

/** A pair's chat lately (talk-circles.md). */
export interface TalkRecord {
  lines: number;
  lastT: number;
  /** Lines since the two last did something together (a trade, a gift, a hire...) or one walked off. */
  idle: number;
  /** A deal one of them talked of as done, with nothing done yet: who said it, what kind, and when first. */
  word: { by: string; kind: DealKind; t: number; broken?: boolean; awake?: number } | null;
  /** Lines one of them has said to the other in a row with no answer, and when the last was. */
  unanswered?: { by: string; n: number; t: number };
  /** The words of their lines lately (within REPEAT_MINUTES), newest last: the same said again carries on the same chat. */
  said?: { t: number; words: string[] }[];
  /** The idle count before a walk last set it back, and when: saying again (at some length) what was said before then picks it up. */
  idleWas?: { n: number; t: number };
  /** The last gift between them ("giver>thing"): the same gift again doesn't settle their talk. */
  gift?: string;
}

/** Lines said again within this many minutes count as the same chat going on. */
export const REPEAT_MINUTES = 180;
/** Lines kept per pair for telling a repeat. */
export const SAID_KEPT = 8;
/** A line needs this many words to count as the same thing said again for picking an old count back up (not "Thank you, Siti."). */
export const REPEAT_WORDS = 5;

/** A walk: a pair's idle count starts again (kept, in case they come back and only say the same again). */
function setBack(rec: TalkRecord): void {
  if (rec.idle > 0) rec.idleWas = { n: Math.max(rec.idleWas?.n ?? 0, rec.idle), t: rec.lastT };
  rec.idle = 0;
}

/** After this many lines to someone with no answer, a speaker can see they aren't answering. */
export const UNANSWERED_LINES = 3;

export const LORRY_ID = 'lorry';
/** Where each purse's money stood when the ledger began: a town's start, or the upgrade that began it. */
export const OPENING_ID = 'kampung-opening';
/** Accounts outside the town: money appears from or vanishes into them. */
/** Customers from the coast road: their money comes from outside the town. */
export const TRAVELLERS_ID = 'travellers';
/** The village fund (rent and sales in, Mr Lim's help out) and Mr Lim's own purse (households-build.md). */
export const FUND_ID = 'village-fund';
export const MR_LIM_ID = 'mr-lim';
/** Miss de Souza the teacher's purse: lesson fees go out of town with her (school.md). */
export const TEACHER_ID = 'miss-de-souza';
export const OUTSIDE: ReadonlySet<string> = new Set([LORRY_ID, OPENING_ID, TRAVELLERS_ID, FUND_ID, MR_LIM_ID, TEACHER_ID]);
/** Village characters who aren't residents but can be named (a note's author, someone in the feed). */
export const VILLAGER_NAMES: Readonly<Record<string, string>> = { [MR_LIM_ID]: 'Mr Lim', [TEACHER_ID]: 'Miss de Souza' };
export const FARM_BEDS = 8;
export const MAX_RECENT = 12;
export const NEARBY_TILES = 3;
/** M2 decision 1: after about this many lines between two people, the listener isn't woken to answer at once. */
export const TALK_SOFT_LIMIT = 8;
/** A conversation counts as over after this many quiet minutes. */
export const TALK_GAP_MINUTES = 60;
/** After this many lines with nothing done between them, two people see they're going round in circles, and further lines stop waking the listener. */
export const CIRCLE_LINES = 6;
/** After going round in circles this many lines more (a second notice), two people have said all there is to say. */
export const SAID_ALL_LINES = 2 * CIRCLE_LINES;
/** A deal talked of as done shows as only words once this many minutes pass with nothing done. */
export const WORD_MINUTES = 3;

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
  /** The owner's dials, from the private settings (not saved with the town). */
  dials: Dials = { ...DEFAULT_DIALS };
  /** Mr Lim's plan for the day's odd jobs, from his head or his own way (not saved: a restart plans again). */
  mrLim: { day: number; plan: { jobs: number; pay: number }; asks: { who: string; said: string | null }[]; asked: Record<string, number> } = { day: -1, plan: { jobs: 2, pay: 50 }, asks: [], asked: {} };
  /** What's been said to the teacher, waiting for her answer, and her day's calls, openings and answers to each (not saved: a restart forgets them, and her head counts its calls from the cost log). */
  teacher: { asks: { who: string; text: string }[]; day: number; calls: number; opened: string[]; answered: Record<string, number> } = { asks: [], day: -1, calls: 0, opened: [], answered: {} };

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
    this.settleTalk(e);
    deed(this, e);
    return e;
  }

  /** Something done between two people settles their talk of it; anyone walking off starts their chats' count again. */
  private settleTalk(e: GameEvent): void {
    const settle = (a: string, b: string, kind: Settles) => {
      const rec = this.state.talk[talkKey(a, b)];
      if (!rec) return;
      // The same thing given again, between the same two, doesn't start their count over (money always does).
      const gift = e.type === 'gave' && e.item ? `${e.who}>${e.item}` : null;
      if (!gift || rec.gift !== gift) {
        rec.idle = 0;
        // Something really done: the old count is gone, not just set aside.
        delete rec.idleWas;
      }
      if (gift) rec.gift = gift;
      // The other one doing something with them is an answer too (not the speaker's own offer).
      if (rec.unanswered && e.type !== 'circles' && 'who' in e && e.who !== rec.unanswered.by) delete rec.unanswered;
      if (rec.word && settles(rec.word.kind, kind)) rec.word = null;
    };
    const s = settledBy(e);
    if (s) settle(s.a, s.b, s.kind);
    // A sale across the counter is with whoever served it, too: a worker on shift there.
    if ((e.type === 'bought' || e.type === 'sold') && e.shop) {
      for (const r of this.state.residents) {
        const a = r.activity;
        if (a?.kind === 'working' && this.state.jobs.some((j) => j.id === a.jobId && j.placeId === e.shop)) settle(e.who, r.id, 'money');
      }
    }
    if (e.type === 'walked' || e.type === 'went_with') {
      for (const [k, rec] of Object.entries(this.state.talk)) if (k.split('|').includes(e.who)) setBack(rec);
    }
  }

  /** Moves money. Outside accounts (the lorry...) aren't purses: money appears from or vanishes into them. */
  transfer(fromId: string, toId: string, cents: Cents, reason: string): void {
    if (!Number.isInteger(cents) || cents <= 0) throw new Error(`bad transfer amount ${cents}`);
    if (!OUTSIDE.has(fromId)) {
      const from = this.resident(fromId);
      if (from.money < cents) throw new Error(`${fromId} cannot cover ${cents}`);
      from.money -= cents;
    }
    if (!OUTSIDE.has(toId)) this.resident(toId).money += cents;
    this.ledger.push({ seq: ++this.state.ledgerSeq, t: this.state.t, from: fromId, to: toId, cents, reason });
  }

  /** Writes down everyone's money as it stands as the ledger's opening entries (a new town), moving none. */
  openBalances(): void {
    for (const r of this.state.residents) {
      if (r.money > 0) this.ledger.push({ seq: ++this.state.ledgerSeq, t: this.state.t, from: OPENING_ID, to: r.id, cents: r.money, reason: 'opening' });
    }
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

  /** A resident's name, or a village character's. */
  nameOf(id: string): string {
    return this.state.residents.find((x) => x.id === id)?.name ?? VILLAGER_NAMES[id] ?? id;
  }

  resident(id: string): Resident {
    const r = this.state.residents.find((x) => x.id === id);
    if (!r) throw new Error(`no resident ${id}`);
    return r;
  }

  /** Someone by name, or by what `by` calls them in their family ("Mak"). */
  residentByName(name: unknown, by?: Resident): Resident | null {
    if (typeof name !== 'string') return null;
    const s = name.trim().toLowerCase();
    const found = this.state.residents.find((r) => r.name.toLowerCase() === s);
    if (found || !by) return found ?? null;
    const calls = CAST.find((c) => c.name === by.name)?.calls ?? {};
    const kin = Object.entries(calls).find(([word]) => word.toLowerCase() === s)?.[1];
    return kin ? this.state.residents.find((r) => r.name === kin) ?? null : null;
  }

  /** Their age this kampung year. */
  ageOf(r: Resident): number {
    return dateAt(this.state, this.t).year - r.born;
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

  /** Where they sleep: their house, or the jetty if they have none. */
  home(r: Resident): Place {
    return PLACE_BY_ID.get(r.homeId) ?? PLACE_BY_ID.get('jetty')!;
  }

  isAt(r: Resident, placeId: string): boolean {
    // No such place (someone sleeping rough has no house): they're not at it.
    const p = PLACE_BY_ID.get(placeId);
    return !!p && inPlace(p, r.pos);
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

  /** Whether two people already have work between them: a job, or an offer of one not yet taken up. */
  workBetween(a: string, b: string): boolean {
    const pair = (x: { employerId: string; workerId: string }) => (x.employerId === a && x.workerId === b) || (x.employerId === b && x.workerId === a);
    return this.state.jobs.some(pair) || this.state.jobOffers.some(pair);
  }

  isAsleep(r: Resident): boolean {
    return r.activity?.kind === 'sleeping';
  }

  /** In-world name of a place; houses are named after who lives there. */
  placeName(p: Place): string {
    if (p.kind !== 'house') return p.name;
    const owner = this.state.residents.find((r) => r.homeId === p.id);
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
    if (!this.state.residents.some((o) => o.id === otherId)) return;
    if (otherId !== r.id && !r.knownPeople.includes(otherId)) r.knownPeople.push(otherId);
  }

  remember(id: string, text: string, talk = false): void {
    this.observer?.(id, this.state.t, text);
    this.hear(id, text, talk);
  }

  /** In the moment only (the notes), not kept in long-term memory: talk between two others, overheard. */
  hear(id: string, text: string, talk = false): void {
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

/** The keeper, when they're at their own stall: what they carry sells there too (owner via Kampung, 2026-10-28). */
export function keeperHere(w: World, shop: Shop): Resident | null {
  if (!isKept(shop)) return null;
  const k = w.resident(shop.ownerId);
  // Minding it, as anyone serving is: not asleep, nor walking off.
  return w.isAt(k, shop.id) && k.activity?.kind !== 'sleeping' && k.activity?.kind !== 'walking' ? k : null;
}

/** How many a stall has to sell: its stock, and what its keeper carries while they're there. */
export function onCounter(w: World, shop: Shop, item: ItemId): number {
  const k = keeperHere(w, shop);
  return countGoods(shop.stock, item) + (k ? countGoods(k.items, item) : 0);
}

/** Sold off the counter: from the stock first, then from what the keeper carries. */
export function takeFromCounter(w: World, shop: Shop, item: ItemId, qty: number): void {
  const fromStock = Math.min(qty, countGoods(shop.stock, item));
  addGoods(shop.stock, item, -fromStock);
  if (qty > fromStock) addGoods(keeperHere(w, shop)!.items, item, -(qty - fromStock));
}

export const HOUSE_IDS = PLACES.filter((p) => p.kind === 'house').map((p) => p.id);
