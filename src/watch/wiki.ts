/**
 * The Kampung wiki on the watch page: who lives here, the places, how the
 * kampung works (from the rules as they are in the code), its economy day by
 * day, and what's new. Owner's view only, read-only; nothing here ever goes
 * into a resident's prompt.
 */
import { existsSync, readFileSync } from 'node:fs';
import { FISHING_MINUTES, WALK_TILES_PER_MINUTE } from '../sim/activities.ts';
import { DAYS_TO_GROW, HARVEST_YIELD, MAX_BEDS_EACH, TRADE_OFFER_MINUTES } from '../sim/actions/everyone.ts';
import { DEBT_OFFER_MINUTES } from '../sim/actions/debts.ts';
import { JOB_OFFER_MINUTES, MAX_SHIFT_HOURS } from '../sim/actions/owners.ts';
import { dateAt, MONTHS, shortStamp, type Calendar } from '../sim/calendar.ts';
import type { GameEvent } from '../sim/events.ts';
import { ITEMS, LORRY_BUYS, LORRY_SELLS, RECIPES, quantityLabel, type ItemId } from '../sim/items.ts';
import { formatMoney, type Cents } from '../sim/money.ts';
import { FARM_BEDS, NEARBY_TILES } from '../sim/state.ts';
import { LORRY_ARRIVES, LORRY_LEAVES } from '../sim/tick.ts';
import { dayIndex, GAME_MINUTES_PER_REAL_MINUTE, MINUTES_PER_DAY, NIGHT_END_HOUR, NIGHT_START_HOUR, SGT_OFFSET_MIN } from '../sim/time.ts';
import { CARDS } from '../seed/cards.ts';
import { CAST } from '../seed/cast.ts';
import { VERSION } from '../version.ts';
import type { Economy, Frame, Layout, MoneyView, Wiki, WikiPerson, WikiPlace, WikiSection } from './types.ts';
import { placeCardOf } from './view.ts';

/** Today and the days before it that the Economy section shows. */
export const ECONOMY_DAYS = 8;

/** The events the Economy section reads: money changing hands. */
export const ECONOMY_EVENTS: ReadonlySet<string> = new Set(['bought', 'sold', 'lorry_sale', 'lorry_order', 'wages_paid', 'gave', 'traded', 'debt_agreed', 'repaid', 'traveller_bought']);

const dayStart = (d: number) => d * MINUTES_PER_DAY - SGT_OFFSET_MIN;

function dayLabel(w: { calendar: Calendar }, t: number): string {
  const d = dateAt(w, t);
  return `${d.weekday.slice(0, 3)} ${d.day} ${MONTHS[d.month - 1]!.slice(0, 3)}`;
}

export interface EconomyExtras {
  debts?: readonly { debtor: string; creditor: string; cents: Cents }[];
  audit?: string | null;
  spend?: { usd: number; cap: number } | null;
  /** The shops, to open up their money. */
  shops?: readonly { id: string; name: string }[];
}

/**
 * The town's economy from the saved events (no state of its own): per game
 * day, GDP (sales in town and to the lorry, less orders off it), the value
 * and number of all sales, money across the town's edge and money
 * in town at the day's end; today's income and everyone's purse; who works for
 * whom; debts, the last ledger check and today's thinking spend when known.
 */
export function economyOf(
  events: readonly GameEvent[],
  now: { t: number; residents: readonly { id: string; name: string; money: Cents; job: string | null }[] },
  w: { calendar: Calendar },
  extras: EconomyExtras,
): Economy {
  const today = dayIndex(now.t);
  // Back to ECONOMY_DAYS days, but never before the town began.
  const first = Math.max(today - ECONOMY_DAYS + 1, Math.min(today, w.calendar.firstDay));
  const name = (id: string) => now.residents.find((r) => r.id === id)?.name ?? id;
  const days = Array.from({ length: today - first + 1 }, (_, i) => ({
    day: first + i, label: dayLabel(w, dayStart(first + i)), gdp: 0, traded: 0, sales: 0, moneyIn: 0, moneyOut: 0, moneyEnd: 0,
  }));
  const income = new Map<string, Cents>(now.residents.map((r) => [r.id, 0]));
  const earn = (id: string, cents: Cents) => { if (income.has(id)) income.set(id, income.get(id)! + cents); };
  for (const e of events) {
    const d = dayIndex(e.t);
    if (d < first || d > today || e.t > now.t) continue;
    const row = days[d - first]!;
    // Value traded counts every sale; GDP counts what the town itself made: sales in town and to the lorry, less what it bought in.
    const sale = (cents: Cents, gdp = cents) => { row.traded += cents; row.gdp += gdp; row.sales += 1; };
    const isToday = d === today;
    switch (e.type) {
      case 'bought': sale(e.cents); if (isToday) earn(e.from, e.cents); break;
      case 'sold': sale(e.cents); if (isToday) earn(e.who, e.cents); break;
      case 'lorry_sale': sale(e.cents); row.moneyIn += e.cents; if (isToday) earn(e.who, e.cents); break;
      case 'traveller_bought': sale(e.cents); row.moneyIn += e.cents; if (isToday) earn(e.owner, e.cents); break;
      case 'lorry_order': sale(e.cents, -e.cents); row.moneyOut += e.cents; break;
      case 'wages_paid': if (isToday) earn(e.to, e.cents); break;
      case 'gave': if (isToday && e.cents > 0) earn(e.to, e.cents); break;
      case 'traded':
        if (isToday) {
          earn(e.who, e.give.cents);
          earn(e.with, e.want.cents);
        }
        break;
      default: break;
    }
  }
  // Money only enters or leaves town across its edge: each earlier day ended where now stands, less what came in since.
  let money = now.residents.reduce((n, r) => n + r.money, 0);
  for (let i = days.length - 1; i >= 0; i--) {
    days[i]!.moneyEnd = money;
    money -= days[i]!.moneyIn - days[i]!.moneyOut;
  }
  const byCents = (a: { cents: Cents }, b: { cents: Cents }) => b.cents - a.cents;
  return {
    days,
    income: now.residents.map((r) => ({ name: r.name, cents: income.get(r.id)! })).filter((x) => x.cents > 0).sort(byCents),
    wealth: now.residents.map((r) => ({ name: r.name, cents: r.money })).sort(byCents),
    jobs: now.residents.filter((r) => r.job && /^Works /.test(r.job)).map((r) => ({ name: r.name, job: r.job! })),
    debts: extras.debts && extras.debts.length
      ? { total: extras.debts.reduce((n, d) => n + d.cents, 0), list: extras.debts.map((d) => ({ debtor: name(d.debtor), creditor: name(d.creditor), cents: d.cents })) }
      : null,
    audit: extras.audit ?? null,
    spend: extras.spend ?? null,
    accounts: [...(extras.shops ?? []), ...now.residents.map((r) => ({ id: r.id, name: r.name }))],
  };
}

/** The kinds of money a resident or shop sees, in the order shown. */
export const MONEY_KINDS = ['Sales', 'Purchases', 'Wages', 'Gifts', 'Trades', 'Loans', 'Repayments', 'Lorry'] as const;
/** The most entries a money view lists. */
export const MONEY_ENTRIES = 100;

/**
 * A resident's or a shop's money from the events, read-only: income and
 * spending by kind, today and over the last ECONOMY_DAYS game days, and each
 * entry (when, with whom, what, how much). A shop's are its sales, what it
 * buys in, its lorry orders and the wages its owner pays. Null for nobody.
 */
export function moneyOf(
  id: string,
  events: readonly GameEvent[],
  now: { t: number; people: readonly { id: string; name: string }[]; shops: readonly { id: string; ownerId: string; name: string }[] },
  w: { calendar: Calendar },
): MoneyView | null {
  const person = now.people.find((p) => p.id === id);
  const shop = now.shops.find((s) => s.id === id);
  if (!person && !shop) return null;
  const name = (x: string) => now.people.find((p) => p.id === x)?.name ?? x;
  const today = dayIndex(now.t);
  const from = today - ECONOMY_DAYS + 1;
  const entries: MoneyView['entries'] = [];
  const add = (e: GameEvent, kind: (typeof MONEY_KINDS)[number], other: string, what: string, cents: Cents) => {
    if (cents !== 0) entries.push({ t: e.t, stamp: shortStamp(w, e.t), kind, with: other, what, cents });
  };
  for (const e of events) {
    if (e.t > now.t || dayIndex(e.t) < from) continue;
    if (shop) {
      if (e.type === 'traveller_bought' && e.shop === id) add(e, 'Sales', 'travellers from the road', quantityLabel(e.item, 1), e.cents);
      else if (e.type === 'bought' && e.shop === id) add(e, 'Sales', name(e.who), quantityLabel(e.item, e.qty), e.cents);
      else if (e.type === 'sold' && e.shop === id) add(e, 'Purchases', name(e.who), quantityLabel(e.item, e.qty), -e.cents);
      else if (e.type === 'lorry_order' && e.shop === id) add(e, 'Lorry', 'the lorry', quantityLabel(e.item, e.qty), -e.cents);
      else if (e.type === 'wages_paid' && e.who === shop.ownerId) add(e, 'Wages', name(e.to), 'wages', -e.cents);
      continue;
    }
    switch (e.type) {
      case 'bought':
        if (e.who === id) add(e, 'Purchases', name(e.from), quantityLabel(e.item, e.qty), -e.cents);
        else if (e.from === id) add(e, 'Sales', name(e.who), quantityLabel(e.item, e.qty), e.cents);
        break;
      case 'sold':
        if (e.who === id) add(e, 'Sales', name(e.to), quantityLabel(e.item, e.qty), e.cents);
        else if (e.to === id) add(e, 'Purchases', name(e.who), quantityLabel(e.item, e.qty), -e.cents);
        break;
      case 'lorry_sale': if (e.who === id) add(e, 'Lorry', 'the lorry', quantityLabel(e.item, e.qty), e.cents); break;
      case 'traveller_bought': if (e.owner === id) add(e, 'Sales', 'travellers from the road', quantityLabel(e.item, 1), e.cents); break;
      case 'lorry_order': if (e.who === id) add(e, 'Lorry', 'the lorry', quantityLabel(e.item, e.qty), -e.cents); break;
      case 'wages_paid':
        if (e.who === id) add(e, 'Wages', name(e.to), 'wages', -e.cents);
        else if (e.to === id) add(e, 'Wages', name(e.who), 'wages', e.cents);
        break;
      case 'gave':
        if (e.who === id) add(e, 'Gifts', name(e.to), 'a gift', -e.cents);
        else if (e.to === id) add(e, 'Gifts', name(e.who), 'a gift', e.cents);
        break;
      case 'traded':
        // The one who took the trade got its "give" and paid its "want".
        if (e.who === id) add(e, 'Trades', name(e.with), 'a trade', e.give.cents - e.want.cents);
        else if (e.with === id) add(e, 'Trades', name(e.who), 'a trade', e.want.cents - e.give.cents);
        break;
      case 'debt_agreed': {
        if (e.kind === 'iou') break;
        // "lend": the one agreeing borrows from the one who offered; "borrow": the one agreeing lends.
        const [lender, borrower] = e.kind === 'lend' ? [e.from, e.who] : [e.who, e.from];
        if (borrower === id) add(e, 'Loans', name(lender), 'borrowed', e.cents);
        else if (lender === id) add(e, 'Loans', name(borrower), 'lent', -e.cents);
        break;
      }
      case 'repaid':
        if (e.who === id) add(e, 'Repayments', name(e.to), 'paid back', -e.cents);
        else if (e.to === id) add(e, 'Repayments', name(e.who), 'paid back', e.cents);
        break;
      default: break;
    }
  }
  const kinds = MONEY_KINDS.map((label) => {
    const row = { label, todayIn: 0, todayOut: 0, weekIn: 0, weekOut: 0 };
    for (const e of entries.filter((x) => x.kind === label)) {
      const isToday = dayIndex(e.t) === today;
      if (e.cents > 0) { row.weekIn += e.cents; if (isToday) row.todayIn += e.cents; }
      else { row.weekOut -= e.cents; if (isToday) row.todayOut -= e.cents; }
    }
    return row;
  }).filter((k) => k.weekIn || k.weekOut);
  return { name: person?.name ?? shop!.name, kinds, entries: entries.sort((a, b) => b.t - a.t).slice(0, MONEY_ENTRIES) };
}

/** "Ah Seng is your son." → son; "Rahim has been your friend since the war." → friend. */
function tiesOf(knows: string, names: readonly string[]): { name: string; how: string }[] {
  const out: { name: string; how: string }[] = [];
  for (const s of knows.split(/(?<=\.)\s+/)) {
    const who = names.find((n) => s.startsWith(`${n} `));
    if (!who) {
      // "You know Fatimah from the well every morning."
      for (const n of names) if (new RegExp(`\\b${n}\\b`).test(s)) out.push({ name: n, how: 'known from before' });
      continue;
    }
    const rest = s.slice(who.length + 1).replace(/[.,].*$/, '');
    const m = /^(?:is|was|has been) (?:your|an?) (.+?)(?: since .*)?$/.exec(rest);
    out.push({ name: who, how: m ? m[1]! : 'known from before' });
  }
  return out;
}

export function peopleOf(frame: Frame, layout: Layout): WikiPerson[] {
  const names = CAST.map((c) => c.name);
  return frame.residents.map((r) => {
    const card = CARDS.find((c) => c.name === r.name);
    return {
      id: r.id,
      name: r.name,
      role: r.role === 'owner' ? 'runs a shop' : 'looking for work',
      age: card?.age ?? null,
      personality: card?.personality ?? null,
      want: card?.want ?? null,
      worry: card?.worry ?? null,
      home: layout.places.find((p) => p.id === r.homeId)?.name ?? null,
      job: r.job,
      money: r.money,
      ties: card ? tiesOf(card.knows, names) : [],
    };
  });
}

const USES: Record<string, string> = {
  kopitiam: 'The coffee shop: kopi and cooked dishes, made in its kitchen from coffee powder, fish, vegetables and rice. It buys fish and vegetables when its owner wants them.',
  provision_shop: 'Dry goods: rice, coffee powder and bread, ordered off the morning lorry.',
  market_stall: 'The wet market: fresh fish and vegetables, sold and bought.',
  notice_board: 'Notes anyone can pin up and read: work wanted, things for sale.',
  well: 'The village well, where people meet in the morning.',
  lorry_stop: 'Where the morning lorry stops: owners order stock from it, and anyone can sell it fish and vegetables.',
  farm: 'Beds of kangkong anyone can plant, water and harvest.',
  jetty: 'Fishing off the end of the jetty.',
  house: 'A home: where its people sleep.',
};

export function placesOf(frame: Frame, layout: Layout): WikiPlace[] {
  return layout.places.map((p) => {
    const card = placeCardOf(frame, layout, p.id);
    return {
      id: p.id, name: p.name, kind: p.kind, use: USES[p.kind] ?? '',
      owner: card?.shop?.owner ?? null,
      workers: card?.shop?.workers ?? [],
      home: card?.home ? card.home.of ?? 'nobody' : null,
    };
  });
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const prices = (list: Partial<Record<ItemId, Cents>>) => Object.entries(list).map(([i, c]) => `${i} ${formatMoney(c!)}`).join(', ');

/** How the kampung works, for someone watching it: built from the rules in the code, so it stays true. */
export function howItWorks(): WikiSection[] {
  const foods = (Object.values(ITEMS)).filter((d) => d.food).sort((a, b) => b.food!.hunger - a.food!.hunger)
    .map((d) => `${d.id} (${d.food!.hunger}${d.food!.energy ? `, and ${d.food!.energy} energy` : ''})`).join(', ');
  const recipes = Object.values(RECIPES).map((r) => `${Object.entries(r!.needs).map(([i, n]) => quantityLabel(i as ItemId, n!)).join(' and ')} make ${r!.yields} ${r!.makes}`).join('; ');
  const realHoursPerDay = MINUTES_PER_DAY / GAME_MINUTES_PER_REAL_MINUTE / 60;
  return [
    {
      title: 'Time and the calendar',
      paras: [
        `The kampung keeps its own clock: ${GAME_MINUTES_PER_REAL_MINUTE} game minutes pass every real minute, so a game day takes ${realHoursPerDay === 5 ? 'five' : realHoursPerDay} real hours and the same game hour comes at a different real time each day.`,
        'Its calendar began on Monday, 1 January, Year 0, the day the town first ran.',
        `Night is ${hhmm(NIGHT_START_HOUR * 60)} to ${hhmm(NIGHT_END_HOUR * 60)}: at ${hhmm(NIGHT_START_HOUR * 60)} everyone stops, walks home and sleeps, and nobody thinks until morning.`,
      ],
    },
    {
      title: 'Needs',
      paras: [
        'Everyone gets hungry and tired. Hunger rises while awake (more slowly asleep); energy falls while awake and comes back with sleep.',
        `Food takes hunger away (on a scale to 1000): ${foods}. Raw rice and coffee powder can't be eaten as they are.`,
        'Someone who runs out of energy dozes off where they stand. Nobody dies.',
      ],
    },
    {
      title: 'Money and shops',
      paras: [
        'Money is in cents, and it only moves when someone pays: buying, selling, wages, gifts, trades, loans and paying them back. Nothing changes hands because of words alone.',
        'Owners set every price themselves, both for selling and for buying from others (with a limit if they like). A shop serves only while someone is minding it: the owner, or a worker on shift.',
        `Anyone can offer a trade, which lapses after ${TRADE_OFFER_MINUTES} minutes if nobody answers.`,
      ],
    },
    {
      title: 'Cooking',
      paras: [
        `Only the kopitiam cooks, by its owner or a worker on shift, from what's in its kitchen: ${recipes}.`,
      ],
    },
    {
      title: 'Fishing and farming',
      paras: [
        `Anyone can fish off the jetty: a session takes ${FISHING_MINUTES} minutes and may land nothing or a few fish.`,
        `The farm plot has ${FARM_BEDS} beds; anyone can tend up to ${MAX_BEDS_EACH}. Kangkong is ready after ${DAYS_TO_GROW} days with water on ${DAYS_TO_GROW} different days, and gives ${HARVEST_YIELD} bunches a bed.`,
      ],
    },
    {
      title: 'The lorry',
      paras: [
        `The lorry comes every morning, ${hhmm(LORRY_ARRIVES)} to ${hhmm(LORRY_LEAVES)}, at the lorry stop: the town's link with the outside.`,
        `Owners order stock from it (money leaves town): ${prices(LORRY_SELLS)}. It's left at their shop.`,
        `Anyone can sell it fish and vegetables (money comes into town): ${prices(LORRY_BUYS)}.`,
      ],
    },
    {
      title: 'Work and wages',
      paras: [
        `An owner offers a job in person: a wage a shift, a start hour, up to ${MAX_SHIFT_HOURS} hours. The offer lapses after ${JOB_OFFER_MINUTES / 60} hours, and someone can hold one job at a time.`,
        'Working a shift earns its wage for the minutes worked. Wages are owed until the owner pays them, in person, in full or in part.',
      ],
    },
    {
      title: 'Getting about and talking',
      paras: [
        `People walk ${WALK_TILES_PER_MINUTE} tiles a minute along the paths. "Nearby" means in the same place, or within ${NEARBY_TILES} tiles in the open; people talk with whoever is nearby.`,
        'Nobody knows a place or a person until they come across them or are told: everyone discovers the kampung for themselves.',
      ],
    },
    {
      title: 'Debts',
      paras: [
        `Anyone can lend someone money, ask to borrow, or write an IOU saying they owe someone; nobody owes anything until the other one agrees, and an offer lapses after ${DEBT_OFFER_MINUTES} minutes. Agreeing to a loan hands the money over; an IOU moves none.`,
        'What everyone owes and is owed is in front of them every moment, summed per person. Paying back goes oldest debt first and can be part; the one owed can let them off. No interest, and no due dates.',
        'Every purse began the money ledger with an opening entry, and once a game day the live town checks every purse against it (see Economy).',
      ],
    },
    {
      title: 'Coming later',
      paras: ['Households and marriages, the village head, travellers on the coast road and Pak Osman the lorry trader will each get their own section here as they arrive.'],
    },
  ];
}

/** The changelog as sections, newest first: each "## " heading and its "- " lines. */
export function newsOf(changelog: string): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  for (const raw of changelog.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) out.push({ title: line.slice(3).trim(), lines: [] });
    else if (line.startsWith('- ') && out.length) out.at(-1)!.lines.push(line.slice(2).trim());
    else if (/^\s+\S/.test(raw) && out.at(-1)?.lines.length) out.at(-1)!.lines[out.at(-1)!.lines.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

const CHANGELOG = new URL('../../CHANGELOG.md', import.meta.url);
let news: { title: string; lines: string[] }[] | null = null;

/** The changelog of the code that's running, read once. */
function runningNews(): { title: string; lines: string[] }[] {
  news ??= existsSync(CHANGELOG) ? newsOf(readFileSync(CHANGELOG, 'utf8')) : [];
  return news;
}

/** The whole wiki for a frame, from the events in hand. */
export function wikiOf(frame: Frame, layout: Layout, events: readonly GameEvent[], w: { calendar: Calendar }, extras: EconomyExtras): Wiki {
  return {
    version: VERSION,
    people: peopleOf(frame, layout),
    places: placesOf(frame, layout),
    how: howItWorks(),
    economy: economyOf(events, { t: frame.t, residents: frame.residents }, w, {
      ...extras, shops: frame.shops.map((s) => ({ id: s.id, name: layout.places.find((p) => p.id === s.id)?.name ?? s.name })),
    }),
    news: runningNews(),
  };
}
