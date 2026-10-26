/**
 * Mr Lim the village head's body, and his paid odd jobs (village-characters.md,
 * subsistence.md Q3.1). His day is scripted and follows the clock alone, so
 * nothing about where he is needs saving: indoors before a quarter past seven
 * and from six in the evening, out to the notice board each morning to pin the
 * day's odd jobs, round the houses on Monday morning for the rent, and
 * otherwise at his door. His thinking head comes later.
 *
 * Odd jobs: two or three a day, each an hour's work at its place, paid on
 * completion from his own purse (`MR_LIM_ID`, outside the town), so money
 * comes into the kampung through work. At most one a day each.
 */
import { WALK_TILES_PER_MINUTE } from './activities.ts';
import { weekdayAt } from './calendar.ts';
import { findPath, isWalkable, PLACE_BY_ID, type Point } from './map.ts';
import { formatMoney, type Cents } from './money.ts';
import { Rng } from './rng.ts';
import { FUND_ID, GROWN_AGE, MR_LIM_ID, type PlaceOffer, type Resident, type World } from './state.ts';
import { type ActionResult, moneyOf, no, ok } from './actions/common.ts';
import { BUY_WEEKS, heldBy, letTo, offerWords, placeMeant, placeWords } from './households.ts';
import { cleanLine } from './osman.ts';
import { dayIndex, minuteOfDay } from './time.ts';
import { skillLevel } from './skills.ts';
import { PROJECT_JOBS, PROJECT_JOBS_A_DAY, PROJECT_NAMES, PROJECTS, projectJobDone, projectJobOf, projectKind } from './projects.ts';

export const MR_LIM = 'Mr Lim';
/** He sets out for the notice board at a quarter past seven. */
export const PIN_FROM = 7 * 60 + 15;
/** He stays at the board this long, pinning. */
export const PIN_STAY = 10;
/** Indoors for the evening from six. */
export const IN_AT = 18 * 60;
/** The Monday rent round (src/sim/households.ts runs it at the same minute). */
export const ROUND_FROM = 9 * 60;
/** Too late in the day to post jobs (a town that wakes up after this waits for tomorrow's). */
export const LAST_POST = 17 * 60;
export const ODD_JOB_PAY: Cents = 50;
export const ODD_JOB_MINUTES = 60;
/** The most notes the board holds (as pin_note keeps it). */
const BOARD_MAX = 12;

/** What he might want doing, each at its own place. */
export const ODD_JOB_KINDS: readonly { kind: string; placeId: string; what: string }[] = [
  { kind: 'mend_jetty', placeId: 'jetty', what: 'mend the jetty planks' },
  { kind: 'clear_path', placeId: 'village-head', what: "clear the path up to the village head's house" },
  { kind: 'sweep_stop', placeId: 'lorry-stop', what: 'sweep the lorry stop' },
  { kind: 'clean_well', placeId: 'well', what: "scrub out the well's trough" },
  { kind: 'clear_ditch', placeId: 'farm', what: 'clear the ditches past the farm plot' },
];

/** How many ordinary odd jobs he pins a day, and what each pays, at most and least (his head chooses within these). */
export const JOBS_A_DAY_BOUNDS: [number, number] = [2, 4];
export const JOB_PAY_BOUNDS: [Cents, Cents] = [40, 80];

/** What his head is told of the kampung each morning (in his own terms), and what it may decide. */
export interface MrLimBrief { residents: number; broke: number; hungry: number; fund: Cents; yesterday: { posted: number; done: number } }
export interface MrLimHead {
  plan(brief: MrLimBrief, at: { t: number; realMs: number }): Promise<{ jobs?: unknown; pay?: unknown } | null>;
  help?(brief: HelpBrief, at: { t: number; realMs: number }): Promise<HelpAnswer | null>;
  decide?(brief: DecideBrief, at: { t: number; realMs: number }): Promise<DecideAnswer | null>;
}

const clamp = (n: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, Math.round(n)));

/** His own way: more jobs when more of the grown-ups are broke, at the usual pay. */
export function scriptedPlan(w: World): { jobs: number; pay: Cents } {
  const broke = w.state.residents.filter((r) => w.ageOf(r) >= GROWN_AGE && r.money === 0).length;
  return { jobs: clamp(JOBS_A_DAY_BOUNDS[0] + Math.floor(broke / 3), JOBS_A_DAY_BOUNDS), pay: ODD_JOB_PAY };
}

/** Each morning before he sets out for the board, his head (when he has one) decides the day's jobs. */
export async function mrLimThinks(w: World, head: MrLimHead | null, realMs: number): Promise<void> {
  const today = dayIndex(w.t);
  const mod = minuteOfDay(w.t);
  if (w.mrLim.day === today || mod < PIN_FROM || mod >= PIN_AT) return;
  const plan = scriptedPlan(w);
  w.mrLim = { ...w.mrLim, day: today, plan };
  if (!head) return;
  const yesterday = w.state.oddJobs.filter((j) => j.project === null);
  const brief: MrLimBrief = {
    residents: w.state.residents.length,
    broke: w.state.residents.filter((r) => r.money === 0).length,
    hungry: w.state.residents.filter((r) => r.hunger >= 700).length,
    fund: w.state.fund,
    yesterday: { posted: yesterday.length, done: yesterday.filter((j) => j.doneBy !== null).length },
  };
  const got = await head.plan(brief, { t: w.t, realMs });
  const jobs = typeof got?.jobs === 'number' && Number.isFinite(got.jobs) ? clamp(got.jobs, JOBS_A_DAY_BOUNDS) : plan.jobs;
  const pay = typeof got?.pay === 'number' && Number.isFinite(got.pay) ? clamp(got.pay, JOB_PAY_BOUNDS) : plan.pay;
  w.mrLim = { ...w.mrLim, day: today, plan: { jobs, pay } };
}

/** Hardship help (village-characters.md power 8): a loan of at most this many weeks' rent, a week's grace once in this many days. */
export const LOAN_WEEKS = 4;
export const GRACE_EVERY_DAYS = 28;
export const GRACE_DAYS = 7;

/** What his head is told of someone asking for help, and what it may answer. */
export interface HelpBrief { name: string; money: Cents; owing: Cents; canGrace: boolean; canLend: Cents; said: string | null }
export type HelpAnswer = { answer?: unknown; amount?: unknown; words?: unknown };

/** Whether r may ask him for help here and now (at his door, once a day). */
export function canAskHelp(w: World, r: Resident): boolean {
  const m = mrLimAt(w, w.t);
  return m.out && m.doing === 'at his door' && w.isAt(r, 'village-head') && w.ageOf(r) >= GROWN_AGE && w.mrLim.asked[r.id] !== dayIndex(w.t);
}

export function askForHelp(w: World, r: Resident, said: string | null = null): ActionResult {
  if (!w.isAt(r, 'village-head')) return no("You'd have to see Mr Lim at the village head's house.");
  if (w.ageOf(r) < GROWN_AGE) return no('Mr Lim pats your head: that is for your elders to ask.');
  if (!canAskHelp(w, r)) return no(w.mrLim.asked[r.id] === dayIndex(w.t) ? "You've already asked Mr Lim today." : "Mr Lim isn't at his door just now.");
  w.mrLim.asked[r.id] = dayIndex(w.t);
  w.mrLim.asks.push({ who: r.id, said });
  return ok('You tell Mr Lim how things stand with you, and ask if he can help.');
}

/** The place r holds that has rent owing, if any. */
const owingPlace = (w: World, r: Resident) => Object.values(w.state.property).find((p) => p.holder === r.id && !p.owned && p.owing > 0) ?? null;

/** Answers to anyone who asked for help: his head chooses grace, a loan or no, within his bounds; his own way otherwise. */
export async function mrLimHelps(w: World, head: MrLimHead | null, realMs: number): Promise<void> {
  const today = dayIndex(w.t);
  for (const { who, said } of w.mrLim.asks.splice(0)) {
    const r = w.state.residents.find((x) => x.id === who);
    if (!r) continue;
    const place = owingPlace(w, r);
    const canGrace = !!place && (place.grace === null || today - place.grace.given >= GRACE_EVERY_DAYS);
    const rent = Object.values(w.state.property).find((p) => p.holder === r.id && !p.owned)?.rent ?? w.state.property[r.homeId]?.rent ?? 50;
    const canLend = w.state.loans.some((l) => l.who === r.id) ? 0 : LOAN_WEEKS * rent;
    const scripted: { answer: 'grace' | 'loan' | 'no'; amount: Cents } = canGrace ? { answer: 'grace', amount: 0 }
      : canLend > 0 && r.money < canLend ? { answer: 'loan', amount: canLend } : { answer: 'no', amount: 0 };
    const got = head?.help ? await head.help({ name: r.name, money: r.money, owing: place?.owing ?? 0, canGrace, canLend, said }, { t: w.t, realMs }) : null;
    let answer = got && ['grace', 'loan', 'no'].includes(got.answer as string) ? got.answer as 'grace' | 'loan' | 'no' : scripted.answer;
    if ((answer === 'grace' && !canGrace) || (answer === 'loan' && canLend <= 0)) answer = scripted.answer;
    const amount = answer === 'loan' ? Math.max(1, Math.min(canLend, typeof got?.amount === 'number' && got.amount > 0 ? Math.round(got.amount) : canLend)) : 0;
    // His own words only when they go with what he does.
    const words = got?.answer === answer && typeof got.words === 'string' ? cleanLine(got.words, 200) : null;
    if (answer === 'grace' && place) {
      // A week: through the next six days (asked on a Monday before the round, that round only).
      place.grace = { until: today + GRACE_DAYS - 1, given: today };
      w.emit({ type: 'helped_by_mr_lim', who: r.id, how: 'grace', cents: 0 });
      w.notify(r.id, `${words ? `Mr Lim says to you: "${words}" ` : ''}Mr Lim gives you a week's grace on the rent you owe.`);
    } else if (answer === 'loan') {
      // From the fund while it has enough; out of his own purse while it's short. Either way it's owed back to the fund.
      const fromFund = w.state.fund >= amount;
      w.transfer(fromFund ? FUND_ID : MR_LIM_ID, r.id, amount, "Mr Lim's hardship loan");
      if (fromFund) w.state.fund -= amount;
      w.state.loans.push({ who: r.id, owed: amount, weekly: rent });
      w.emit({ type: 'helped_by_mr_lim', who: r.id, how: 'loan', cents: amount });
      w.notify(r.id, `${words ? `Mr Lim says to you: "${words}" ` : ''}Mr Lim lends you ${formatMoney(amount)}, to be paid back a little at a time when he comes round on Mondays.`);
    } else {
      w.notify(r.id, words ? `Mr Lim says to you: "${words}"` : "Mr Lim shakes his head: he can't help you just now.");
    }
  }
}

/**
 * The housing market (households-build.md "Housing market", Q1–Q3): at his door
 * anyone grown may offer a rent a week, or a price to buy, for a house standing
 * free, or a price for the place they hold. There's no floor. Each evening his
 * head accepts one, counters, or waits for better; his own way otherwise.
 */
export const DECIDE_AT = 17 * 60;
/** His own way: a place free this many days, he takes the best offer he has. */
export const WAIT_DAYS = 3;
/** His head's calls an evening, at most. */
const DECIDE_CALLS = 3;

/** What his head is told of the offers for a place, and what it may answer (an offer by its number). */
export interface DecideBrief { place: string; freeDays: number | null; rent: Cents; offers: { n: number; name: string; kind: 'rent' | 'buy'; cents: Cents }[] }
/** `offer` is an offer's number in the brief; `kind` what a counter is for (a rent a week, or a price to buy). */
export type DecideAnswer = { answer?: unknown; offer?: unknown; cents?: unknown; kind?: unknown; words?: unknown };

const atHisDoor = (w: World) => { const m = mrLimAt(w, w.t); return m.out && m.doing === 'at his door'; };
/** Houses standing free, the longest free first. */
const freeHouses = (w: World) => Object.entries(w.state.property).filter(([id, p]) => id.startsWith('house-') && p.holder === null)
  .sort(([, a], [, b]) => (a.freeSince ?? Infinity) - (b.freeSince ?? Infinity));
/** Whether r holds the house they live in. */
const housed = (w: World, r: Resident) => w.state.property[r.homeId]?.holder === r.id;

/** Whether r has anything to make him an offer for, here and now. */
export function canOffer(w: World, r: Resident): boolean {
  return w.isAt(r, 'village-head') && atHisDoor(w) && w.ageOf(r) >= GROWN_AGE
    && ((freeHouses(w).length > 0 && !housed(w, r)) || heldBy(w, r.id).length > 0);
}

export function offerForPlace(w: World, r: Resident, item: unknown, money: unknown, buying: boolean): ActionResult {
  if (!w.isAt(r, 'village-head')) return no("You'd have to see Mr Lim at the village head's house about that.");
  if (!atHisDoor(w)) return no("Mr Lim isn't at his door just now.");
  if (w.ageOf(r) < GROWN_AGE) return no('Mr Lim smiles: houses are for your elders to see to.');
  const cents = moneyOf(money);
  if (cents === null || cents === 0) return no("That doesn't sound like money.");
  const s = typeof item === 'string' ? item.toLowerCase() : '';
  const stall = /stall|shop|kopitiam|market/.test(s);
  const held = placeMeant(w, r, item);
  // Their own place when they hold one and say so (or offer to buy "the house" they live in); otherwise a house standing free.
  const own = held !== null && (/\b(my|mine|own|our|ours)\b/.test(s) || stall || (buying && housed(w, r)));
  let placeId: string | null = null;
  if (own) {
    const [id, p] = held;
    if (p.owned) return no('That is yours already.');
    if (p.rentToOwn) return no("You're buying it week by week already: it'll be yours when that's paid.");
    if (!buying) return no('You rent it already: Mr Lim would only hear an offer to buy it.');
    if (p.owing > 0 || (w.state.arrears[r.id] ?? 0) > 0) return no("Mr Lim won't hear an offer while you owe him rent.");
    placeId = id;
  } else if (stall) {
    return no('Mr Lim has no stall free just now.');
  } else {
    if (housed(w, r)) return no('You already have a house of your own.');
    const arrears = w.state.arrears[r.id] ?? 0;
    if (arrears > 0) return no(`Mr Lim won't let you a house while you still owe Mr Lim ${formatMoney(arrears)}.`);
    if (!freeHouses(w).length) return no('Mr Lim has no house free just now.');
  }
  const offer: PlaceOffer = { id: w.nextId(), placeId, who: r.id, kind: buying ? 'buy' : 'rent', cents, t: w.t };
  if (r.money < cents) {
    return no(buying ? `You haven't ${formatMoney(cents)} to pay him.` : `Mr Lim wants the first week paid when he lets a house, and you haven't ${formatMoney(cents)}.`);
  }
  // One offer a person: a new one takes the place of the last.
  w.state.placeOffers = [...w.state.placeOffers.filter((o) => o.who !== r.id), offer];
  return ok(`You offer Mr Lim ${offerWords(offer)}. He says he'll give you his answer ${w.state.offersDay === dayIndex(w.t) ? 'tomorrow evening' : 'this evening'}.`);
}

type Decision = { answer: 'accept'; offer: PlaceOffer } | { answer: 'counter'; cents: Cents; to: PlaceOffer[] } | { answer: 'wait' };

/** His head's answer (offers by their number, 1 up) held to what he can do; his own way when it fails. His words only with his own decision. */
function resolve(got: DecideAnswer | null, offers: PlaceOffer[], scripted: Decision): { d: Decision; words: string | null } {
  const named = typeof got?.offer === 'number' ? offers[got.offer - 1] ?? null : null;
  let d: Decision | null = null;
  if (got?.answer === 'accept' && named) d = { answer: 'accept', offer: named };
  else if (got?.answer === 'counter' && typeof got.cents === 'number' && Number.isFinite(got.cents) && got.cents >= 1) {
    // A counter is for one kind of offer: a rent a week, or a price to buy.
    const kind = got.kind === 'rent' || got.kind === 'buy' ? got.kind : (named ?? offers[0]!).kind;
    const to = named ? (named.kind === kind ? [named] : []) : offers.filter((o) => o.kind === kind);
    if (to.length) d = { answer: 'counter', cents: Math.min(Math.round(got.cents), 1_000_000), to };
  } else if (got?.answer === 'wait') d = { answer: 'wait' };
  if (!d) return { d: scripted, words: null };
  return { d, words: typeof got?.words === 'string' ? cleanLine(got.words, 200) : null };
}

/** Each evening (or the first time the town is awake after five): his answers to the offers made at his door. */
export async function mrLimDecides(w: World, head: MrLimHead | null, realMs: number): Promise<void> {
  const today = dayIndex(w.t);
  if (w.state.offersDay === today || minuteOfDay(w.t) < DECIDE_AT) return;
  w.state.offersDay = today;
  const byId = (id: string) => w.state.residents.find((x) => x.id === id);
  // Offers that no longer stand go: a house found meanwhile, a place no longer theirs; owing him rent since, he won't hear it.
  w.state.placeOffers = w.state.placeOffers.filter((o) => {
    const r = byId(o.who);
    if (!r) return false;
    const p = o.placeId === null ? null : w.state.property[o.placeId];
    if (o.placeId === null ? housed(w, r) : !p || p.holder !== r.id || p.owned || p.rentToOwn) return false;
    if ((w.state.arrears[r.id] ?? 0) > 0 || (p?.owing ?? 0) > 0) {
      w.notify(r.id, "Mr Lim won't take your offer while you owe him rent.");
      return false;
    }
    return true;
  });
  if (!w.state.placeOffers.length) return;
  let calls = 0;
  const ask = async (place: string, freeDays: number | null, rent: Cents, offers: PlaceOffer[]) => {
    if (!head?.decide || calls >= DECIDE_CALLS) return null;
    calls++;
    return head.decide({ place, freeDays, rent, offers: offers.map((o, i) => ({ n: i + 1, name: w.nameOf(o.who), kind: o.kind, cents: o.cents })) }, { t: w.t, realMs });
  };
  const drop = (o: PlaceOffer) => { w.state.placeOffers = w.state.placeOffers.filter((x) => x !== o); };
  const says = (words: string | null) => (words ? `Mr Lim says to you: "${words}" ` : '');
  let let_ = false;
  /** Carries out an answer for a place; true when he let or sold it (or the offer fell through), so the next may be weighed. */
  const settle = ({ d, words }: { d: Decision; words: string | null }, placeId: string, offers: PlaceOffer[]): boolean => {
    if (d.answer === 'wait') {
      if (words) for (const o of offers) w.notify(o.who, `Mr Lim says to you: "${words}"`);
      return false;
    }
    if (d.answer === 'counter') {
      for (const o of d.to) {
        drop(o);
        w.notify(o.who, `${says(words)}Mr Lim won't take ${offerWords(o)}: he'd take ${formatMoney(d.cents)}${o.kind === 'rent' ? ' a week' : ''}.`);
      }
      return false;
    }
    const o = d.offer;
    const r = byId(o.who)!;
    drop(o);
    if (r.money < o.cents) {
      w.notify(r.id, `Mr Lim would have taken your offer of ${offerWords(o)}, but you haven't the money now.`);
      return true;
    }
    for (const id of letTo(w, r, placeId, o.kind, o.cents)) moved.add(id);
    let_ = true;
    w.notify(r.id, `${says(words)}Mr Lim takes your offer of ${offerWords(o)}. ${o.kind === 'rent' ? 'You pay the first week now, and the house is your home.'
      : `You pay him ${formatMoney(o.cents)}, and ${o.placeId === null ? 'the house is yours, and your home' : `${placeWords(o).replace(/^your /, 'the ')} is yours now`}: nobody can take it.`}`);
    return true;
  };
  const moved = new Set<string>();
  const housedNow = (o: PlaceOffer) => { const r = byId(o.who); return !r || housed(w, r) || moved.has(r.id); };
  // How he weighs offers: a price to buy against a year's rent.
  const worth = (o: PlaceOffer) => (o.kind === 'buy' ? o.cents : o.cents * BUY_WEEKS);
  // Houses standing free: the best offer first, one house at a time.
  for (;;) {
    const free = freeHouses(w);
    // Someone housed by an offer taken this evening (their family's) has no need of another.
    for (const o of w.state.placeOffers.filter((x) => x.placeId === null && housedNow(x))) drop(o);
    const offers = w.state.placeOffers.filter((o) => o.placeId === null).sort((a, b) => worth(b) - worth(a) || a.t - b.t);
    if (!free.length || !offers.length) break;
    const [houseId, house] = free[0]!;
    const freeDays = today - (house.freeSince ?? today);
    // His own way: half the old rent will do (or half a year's to buy); after a few days free, the best rent he has.
    // A house sold is gone for good: he never sells for less than half a year's rent of his own accord.
    const fair = (o: PlaceOffer) => worth(o) * 2 >= house.rent * BUY_WEEKS || (o.kind === 'rent' && freeDays >= WAIT_DAYS);
    const pick = offers.find(fair);
    const scripted: Decision = pick ? { answer: 'accept', offer: pick } : { answer: 'wait' };
    const got = await ask('a house standing free', freeDays, house.rent, offers);
    if (!settle(resolve(got, offers, scripted), houseId, offers)) break;
  }
  if (!freeHouses(w).length) {
    for (const o of w.state.placeOffers.filter((x) => x.placeId === null)) {
      drop(o);
      w.notify(o.who, 'Mr Lim has let the house to someone else: he has none free now.');
    }
  }
  // Offers to buy the place they hold, each on its own.
  for (const o of w.state.placeOffers.filter((x) => x.placeId !== null)) {
    const p = w.state.property[o.placeId!]!;
    // His own way: half a year's rent.
    const price = Math.ceil((p.rent * BUY_WEEKS) / 2);
    const scripted: Decision = o.cents >= price ? { answer: 'accept', offer: o } : { answer: 'counter', cents: price, to: [o] };
    const place = `${placeWords(o).replace(/^your /, 'the ')} they rent from you`;
    const got = await ask(place, null, p.rent, [o]);
    settle(resolve(got, [o], scripted), o.placeId!, [o]);
  }
  if (let_) pinToLet(w);
}

const TO_LET = 'To let, or for sale:';

/** What his note of the houses standing free says, or null with none free. */
const toLetText = (w: World): string | null => {
  const n = freeHouses(w).length;
  return n ? `${TO_LET} ${n === 1 ? 'a house' : `${n} houses`}, standing free. Make Mr Lim an offer at his door, a rent a week or a price to buy. Mr Lim.` : null;
};

/** His note on the board of the houses standing free, kept up to date. */
export function pinToLet(w: World): void {
  w.state.notes = w.state.notes.filter((n) => !(n.authorId === MR_LIM_ID && n.text.startsWith(TO_LET)));
  const text = toLetText(w);
  if (!text) return;
  w.state.notes.push({ id: w.nextId(), authorId: MR_LIM_ID, text, t: w.t });
  if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
  w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
}

/** A better-paid job for someone with good English (school.md): keeping Mr Lim's ledger, at his house. */
export const LEDGER_JOB = { kind: 'keep_ledger', placeId: 'village-head', what: "keep Mr Lim's ledger", pay: 100, english: 3 } as const;

/** Whether r is fit for a job (the ledger wants good English). */
export const fitFor = (w: World, r: Resident, kind: string) => kind !== LEDGER_JOB.kind || (w.ageOf(r) >= GROWN_AGE && skillLevel(r, 'english') >= LEDGER_JOB.english);

const pts = (from: Point, to: Point): Point[] => [from, ...(findPath(from, to) ?? [])];
const minutes = (path: Point[]) => Math.ceil((path.length - 1) / WALK_TILES_PER_MINUTE);
const along = (path: Point[], e: number): Point => path[Math.min(path.length - 1, e * WALK_TILES_PER_MINUTE)]!;

/** Where he stands by day: on the doorstep, just below his house. */
const DOOR: Point = (() => {
  const h = PLACE_BY_ID.get('village-head')!;
  const step = { x: h.spot.x, y: h.rect.y + h.rect.h };
  return isWalkable(step.x, step.y) ? step : h.spot;
})();
const BOARD = PLACE_BY_ID.get('notice-board')!.spot;
const TO_BOARD = pts(DOOR, BOARD);
const FROM_BOARD = pts(BOARD, DOOR);
/** Past each house's doorstep, along the top row, and home. */
const ROUND: Point[] = (() => {
  const stops = Array.from({ length: 10 }, (_, i) => {
    const h = PLACE_BY_ID.get(`house-${i + 1}`)!;
    return { x: h.spot.x, y: h.rect.y + h.rect.h };
  });
  const out: Point[] = [DOOR];
  for (const s of [...stops, DOOR]) out.push(...(findPath(out.at(-1)!, s) ?? []));
  return out;
})();

/** The minute of the day he reaches the board and pins the day's jobs. */
export const PIN_AT = PIN_FROM + minutes(TO_BOARD);

/** Where Mr Lim is at minute t, what he's doing, and whether he's out to be seen. */
export function mrLimAt(w: World, t: number): { pos: Point; doing: string; out: boolean } {
  const mod = minuteOfDay(t);
  if (mod < PIN_FROM || mod >= IN_AT) return { pos: DOOR, doing: 'indoors', out: false };
  const e = mod - PIN_FROM;
  const there = minutes(TO_BOARD);
  if (e < there) return { pos: along(TO_BOARD, e), doing: 'on his way to the notice board', out: true };
  if (e < there + PIN_STAY) return { pos: BOARD, doing: 'pinning notices on the board', out: true };
  if (e < there + PIN_STAY + minutes(FROM_BOARD)) return { pos: along(FROM_BOARD, e - there - PIN_STAY), doing: 'on his way home', out: true };
  if (weekdayAt(w.state, t) === 'Monday' && mod >= ROUND_FROM && mod < ROUND_FROM + minutes(ROUND)) {
    return { pos: along(ROUND, mod - ROUND_FROM), doing: 'going round the houses for the rent', out: true };
  }
  return { pos: DOOR, doing: 'at his door', out: true };
}

/** Today's odd jobs. */
export function jobsToday(w: World): World['state']['oddJobs'] {
  const today = dayIndex(w.t);
  return w.state.oddJobs.filter((j) => j.day === today);
}

/** Who is at a job now, if anyone. */
export function workingAt(w: World, id: number): Resident | null {
  return w.state.residents.find((r) => r.activity?.kind === 'chore' && r.activity.job === id) ?? null;
}

/** Whether r has done a job for him today. */
export const doneToday = (w: World, r: Resident) => jobsToday(w).some((j) => j.doneBy === r.id);

/** Today's job at r's place that nobody has done or is doing, if there is one. */
export function openJobHere(w: World, r: Resident): World['state']['oddJobs'][number] | null {
  // The best-paid first: someone who can keep the ledger is offered it before the path.
  return jobsToday(w).filter((j) => j.doneBy === null && w.isAt(r, j.placeId) && !workingAt(w, j.id) && fitFor(w, r, j.kind))
    .sort((a, b) => b.pay - a.pay)[0] ?? null;
}

export const whatOf = (kind: string) => (kind === LEDGER_JOB.kind ? LEDGER_JOB.what : ODD_JOB_KINDS.find((k) => k.kind === kind)?.what ?? projectJobOf(kind)?.what ?? 'odd work');

/** Each minute: once he's at the board (or the town wakes later in the day), yesterday's jobs come down and today's go up. */
export function mrLimMinute(w: World): void {
  const today = dayIndex(w.t);
  const mod = minuteOfDay(w.t);
  // A new day: notes for jobs nobody did come down (the jobs were only for their day).
  const stale = new Set(w.state.oddJobs.filter((j) => j.day !== today && j.doneBy === null).map((j) => j.noteId));
  if (stale.size && w.state.notes.some((n) => stale.has(n.id))) w.state.notes = w.state.notes.filter((n) => !stale.has(n.id));
  // What stands free, for offers: up while he's about, and changed when that does.
  if (mod >= PIN_AT && mod < IN_AT && (w.state.notes.find((n) => n.authorId === MR_LIM_ID && n.text.startsWith(TO_LET))?.text ?? null) !== toLetText(w)) pinToLet(w);
  if (w.state.oddJobsDay === today || mod < PIN_AT || mod >= LAST_POST) return;
  w.state.oddJobsDay = today;
  const old = new Set(w.state.oddJobs.filter((j) => j.doneBy === null).map((j) => j.noteId));
  w.state.notes = w.state.notes.filter((n) => !old.has(n.id));
  w.state.oddJobs = [];
  const rng = new Rng((Math.imul(w.state.seed ^ 0x1b873593, 2654435761) ^ Math.imul(today + 1, 40503)) >>> 0);
  const kinds = [...ODD_JOB_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const k = rng.int(0, i);
    [kinds[i], kinds[k]] = [kinds[k]!, kinds[i]!];
  }
  // Today's plan (his head's, or his own way if he hasn't thought today).
  const plan = w.mrLim.day === today ? w.mrLim.plan : scriptedPlan(w);
  for (const k of kinds.slice(0, plan.jobs)) {
    const text = `Wanted: someone to ${k.what}. An hour's work, ${formatMoney(plan.pay)} when it's done. Mr Lim.`;
    const noteId = w.nextId();
    w.state.notes.push({ id: noteId, authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    w.state.oddJobs.push({ id: w.nextId(), kind: k.kind, placeId: k.placeId, pay: plan.pay, day: today, doneBy: null, noteId, project: null });
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
  }
  // Someone in the kampung reads and writes English well: his ledger wants keeping.
  if (w.state.residents.some((r) => fitFor(w, r, LEDGER_JOB.kind))) {
    const text = `Wanted: someone with good English to ${LEDGER_JOB.what}. An hour's work, ${formatMoney(LEDGER_JOB.pay)} when it's done. Mr Lim.`;
    const noteId = w.nextId();
    w.state.notes.push({ id: noteId, authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    w.state.oddJobs.push({ id: w.nextId(), kind: LEDGER_JOB.kind, placeId: LEDGER_JOB.placeId, pay: LEDGER_JOB.pay, day: today, doneBy: null, noteId, project: null });
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
  }
  // Beside them, the next jobs on whatever he's having built.
  for (const p of w.state.projects) {
    if (p.builtDay !== null) continue;
    const next = (PROJECT_JOBS[p.id] ?? []).map((j, i) => ({ ...j, i })).filter((j) => !p.done.includes(j.i)).slice(0, PROJECT_JOBS_A_DAY);
    if (!next.length) continue;
    // One note a building, so the board keeps room for everyone else's.
    const wanted = next.map((j) => `someone to ${j.what}`);
    const text = `Wanted, for ${PROJECT_NAMES[p.id] ?? 'the new building'}: ${wanted.join(', and ')}. An hour's work each, ${formatMoney(ODD_JOB_PAY)} when it's done. Mr Lim.`;
    const noteId = w.nextId();
    w.state.notes.push({ id: noteId, authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    for (const j of next) w.state.oddJobs.push({ id: w.nextId(), kind: projectKind(p.id, j.i), placeId: j.placeId, pay: ODD_JOB_PAY, day: today, doneBy: null, noteId, project: p.id });
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
  }
}

/** A job finished: paid from his purse, its note taken down. */
export function finishOddJob(w: World, r: Resident, id: number | null): void {
  const job = w.state.oddJobs.find((j) => j.id === id);
  if (!job || job.doneBy !== null) return;
  job.doneBy = r.id;
  // The note comes down once nothing on it is still wanted; until then it asks only for what's left.
  const left = w.state.oddJobs.filter((j) => j.noteId === job.noteId && j.doneBy === null);
  if (!left.length) w.state.notes = w.state.notes.filter((n) => n.id !== job.noteId);
  else {
    const note = w.state.notes.find((n) => n.id === job.noteId);
    const name = job.project ? PROJECT_NAMES[job.project] ?? 'the new building' : null;
    if (note && name) note.text = `Wanted, for ${name}: ${left.map((j) => `someone to ${whatOf(j.kind)}`).join(', and ')}. An hour's work each, ${formatMoney(ODD_JOB_PAY)} when it's done. Mr Lim.`;
  }
  w.transfer(MR_LIM_ID, r.id, job.pay, 'odd job for Mr Lim');
  const what = whatOf(job.kind);
  w.emit({ type: 'odd_job_done', who: r.id, what, cents: job.pay });
  w.remember(r.id, `You finish the job for Mr Lim (${what}), and Mr Lim pays you ${formatMoney(job.pay)}.`);
  const pj = job.project ? projectJobOf(job.kind) : null;
  if (pj && projectJobDone(w, pj.project, pj.index)) {
    // The last job done: it's built, and Mr Lim lets it be known.
    const name = PROJECT_NAMES[pj.project] ?? 'the new building';
    const text = PROJECTS[pj.project]?.ready ?? `${name[0]!.toUpperCase()}${name.slice(1)} is ready. Mr Lim.`;
    w.state.notes.push({ id: w.nextId(), authorId: MR_LIM_ID, text, t: w.t });
    if (w.state.notes.length > BOARD_MAX) w.state.notes.shift();
    w.emit({ type: 'note_pinned', who: MR_LIM_ID, text });
    w.emit({ type: 'built', what: name });
  }
}
