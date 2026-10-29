/**
 * Kampung News, "Behind the scenes" (docs/design/news.md Q3): plain figures
 * for the owner, computed from the save with no AI and no cost, one row per
 * kampung day, with a mark where a figure crosses a line. Never shown to a
 * resident.
 */
import type { GameEvent, LedgerEntry } from '../sim/events.ts';
import { LORRY_ID, TEACHER_ID, TRAVELLERS_ID } from '../sim/state.ts';
import type { BoxRow, Mark } from './types.ts';

/** Money crossing the edge of town: the lorry, the road's travellers, the teacher who comes from outside. */
export const EDGE: ReadonlySet<string> = new Set([LORRY_ID, TRAVELLERS_ID, TEACHER_ID]);

/**
 * A reply that reads as a refusal (replies keep no ok flag in memory, so this
 * goes by the wording): an estimate, and labelled one on the page.
 */
export const REFUSAL = /^(You (don't|can't|haven't|need|feel too ill|only|'re not|are not|'re too|'d need|have no|have only|know nothing)|There's (no|nothing|nobody|enough)|Nobody's|That's|Nothing of yours|The kitchen (and your bag )?ha(s|ve) |.* isn't nearby|.* doesn't (sell|buy|have)|.* isn't (buying|selling)|Which do you mean|.* has run out|It's the middle of the night|You're (busy|fetching|mending|sweeping|casting|gathering|looking|in the middle))/;

/** Where a figure gets a warning mark (drafted, news.md). */
export const LINES = { meals: 2, sameRefusal: 10, circles: 30 } as const;
/** How many repeated refusals a row lists. */
export const TOP_REFUSALS = 5;

/** What was so at the end of a kampung day, recorded at midnight (residents by id). */
export interface DayEnd { day: number; hunger1000: string[]; noMoney: string[]; fund: number }

/** One kampung day's saved record: its events, ledger, residents' replies, and how it ended (null before the paper began). */
export interface DayFacts {
  day: number;
  events: readonly GameEvent[];
  ledger: readonly LedgerEntry[];
  did: readonly { resident: string; text: string }[];
  end: DayEnd | null;
}

export function boxRow(f: DayFacts, residents: readonly { id: string; name: string }[]): BoxRow {
  const name = (id: string) => residents.find((r) => r.id === id)?.name ?? id;
  const of = (type: string) => f.events.filter((e) => e.type === type) as unknown as { who: string }[];
  const ate = new Map(residents.map((r) => [r.id, 0]));
  for (const e of of('ate')) ate.set(e.who, (ate.get(e.who) ?? 0) + 1);
  const meals = of('ate').length;
  const under2 = residents.filter((r) => (ate.get(r.id) ?? 0) < LINES.meals).map((r) => `${r.name} ${ate.get(r.id) ?? 0}`);

  const said = new Map<string, { who: string; text: string; n: number }>();
  for (const d of f.did) {
    if (!REFUSAL.test(d.text)) continue;
    const k = `${d.resident}\n${d.text}`;
    const x = said.get(k) ?? { who: name(d.resident), text: d.text, n: 0 };
    x.n++;
    said.set(k, x);
  }
  const refusals = [...said.values()].filter((x) => x.n > 1).sort((a, b) => b.n - a.n).slice(0, TOP_REFUSALS);

  const circles = f.events.filter((e) => e.type === 'circles').length;
  const edgeIn = f.ledger.filter((l) => EDGE.has(l.from) && !EDGE.has(l.to)).reduce((n, l) => n + l.cents, 0);
  const edgeOut = f.ledger.filter((l) => EDGE.has(l.to) && !EDGE.has(l.from)).reduce((n, l) => n + l.cents, 0);
  const hunger1000 = f.end ? f.end.hunger1000.map(name) : null;

  const warn: Mark[] = [];
  if (under2.length) warn.push('meals');
  if (hunger1000?.length) warn.push('hunger');
  if (refusals.some((x) => x.n >= LINES.sameRefusal)) warn.push('refusals');
  if (circles > LINES.circles) warn.push('circles');
  return {
    day: f.day, meals, perResident: residents.length ? meals / residents.length : 0, under2,
    hunger1000, fellIll: of('fell_ill').map((e) => name(e.who)), gotWell: of('got_well').map((e) => name(e.who)),
    refusals, circles, noMoney: f.end ? f.end.noMoney.map(name) : null, fund: f.end?.fund ?? null, edgeIn, edgeOut, warn,
  };
}

/** The AI spend for each real day an issue covers, against that day's cap. */
export function spendLines(days: readonly { day: string; usd: number; cap: number }[]): { day: string; usd: number; cap: number; over: boolean }[] {
  return days.map((d) => ({ ...d, over: d.usd > d.cap }));
}
