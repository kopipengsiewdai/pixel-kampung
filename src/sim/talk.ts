/**
 * Talk that goes round in circles (docs/design/talk-circles.md): telling a
 * deal done only in words, what settles it, and the measures a trial prints.
 * All cheap pattern matching on what was said and done: no AI.
 */
import type { GameEvent } from './events.ts';
import { ITEMS } from './items.ts';

/** What a line said to someone claims has happened, if anything. */
export type DealKind = 'paying' | 'deal' | 'job';
/** What an event between two people settles: talk of money or goods, or of a job. */
export type Settles = 'money' | 'job';

// "Here's…" (not "here is the thing"), "take it" ending a clause (not "take it easy"), or I pay / give / hand…
// (not "give up", "give you a call").
const HAND_OVER = /^(?:here('s| is)\b(?! the thing)|take (it|this)\s*(,|$))|\b(i|i'll|i will|let me)\s+(now\s+)?(pay|give(?! up)(?! (you )?a (call|hand|ring|moment|minute|chance))|hand|put|pass|count|settle)\b|\bon the counter\b/;
const MONEY = /\$\s?\d|\b\d+\s?(¢|c|cents?)(?![a-z])|\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+) (dollars?|cents?)\b|\b(money|cash|payment|wages?|change|account|debt|bill|duit)\b/;
const SETTLED = /\b(paid in full|all paid|we('re| are) square|i('ve| have) (paid|settled)|(account|debt|bill) (is )?(settled|cleared)|count(ing)? (it|the money|your money))\b/;
// "Sold" only as a deal struck with them, not stall news ("I sold all my fish today").
const DEAL = /\b(deal|agreed|sold (it )?to you)\b/;
const HIRING = /\b(you('re| are) hired|i('ll| will)? hire you|take you on|come (and )?work for me|you (can )?start (work|today|tomorrow|at)|i('ll| will)? (take|accept) (the|your) (job|offer)|i('ll| will)? work for you|i start (at|today|tomorrow))\b/;
const LATER = /\b(if|maybe|perhaps|tomorrow|later|next|one day|could|would)\b/;
const UNSURE = /\b(if|maybe|perhaps)\b/;

/** Words naming the things anyone can carry, from the item list. */
const FILLER = new Set(['bag', 'bags', 'tin', 'tins', 'cup', 'cups', 'bowl', 'bowls', 'plate', 'plates', 'bunch', 'bunches', 'powder', 'of', 'a', 'an']);
const THING = new RegExp(`\\b(${[...new Set([
  'kangkong', 'loaves',
  ...Object.values(ITEMS).flatMap((d) => [d.id, ...d.aliases]).flatMap((s) => s.toLowerCase().split(/\s+/)),
])].filter((w) => w.length >= 3 && !FILLER.has(w)).join('|')})\\b`);

/** The sentences of a line that state something now: not questions. */
function statements(text: string): string[] {
  const s = text.toLowerCase().replace(/[’‘]/g, "'");
  const parts = s.match(/[^.!?…]+[.!?…]*/g) ?? [];
  return parts.map((p) => p.trim()).filter((p) => p && !p.endsWith('?')).map((p) => p.replace(/[.!…]+$/, '').trim());
}

/**
 * What a line said to someone claims was done in words: paying, a deal in
 * goods, or a job. A question, or a promise for later, claims nothing yet.
 */
export function dealKind(text: string): DealKind | null {
  const now = statements(text);
  const firm = now.filter((p) => !LATER.test(p));
  const all = firm.join(' ');
  const handing = firm.some((p) => HAND_OVER.test(p));
  if ((handing && MONEY.test(all)) || firm.some((p) => SETTLED.test(p))) return 'paying';
  // A deal word counts with money or a thing in the same sentence or the next ("Deal! 3 fish for your bread."),
  // not with a time ("Deal, see you at 6.").
  const goods = (p: string | undefined) => !!p && (MONEY.test(p) || THING.test(p));
  if ((handing && THING.test(all)) || firm.some((p, i) => DEAL.test(p) && (goods(p) || goods(firm[i + 1])))) return 'deal';
  if (now.some((p) => HIRING.test(p) && !UNSURE.test(p))) return 'job';
  return null;
}

/** The two people an event is between, and what talk it settles; null if it settles none. */
export function settledBy(e: GameEvent): { a: string; b: string; kind: Settles } | null {
  const pair = (a: string, b: string, kind: Settles) => (b === 'lorry' ? null : { a, b, kind });
  switch (e.type) {
    case 'gave': return pair(e.who, e.to, 'money');
    case 'traded': return pair(e.who, e.with, 'money');
    case 'trade_offered': return pair(e.who, e.to, 'money');
    case 'trade_declined': return pair(e.who, e.from, 'money');
    case 'debt_offered': return pair(e.who, e.to, 'money');
    case 'debt_agreed': return pair(e.who, e.from, 'money');
    case 'debt_refused': return pair(e.who, e.from, 'money');
    case 'repaid': return pair(e.who, e.to, 'money');
    case 'let_off': return pair(e.who, e.debtor, 'money');
    case 'bought': return pair(e.who, e.from, 'money');
    case 'sold': return pair(e.who, e.to, 'money');
    case 'wages_paid': return pair(e.who, e.to, 'money');
    case 'job_offered': return pair(e.who, e.to, 'job');
    case 'hired': return pair(e.who, e.by, 'job');
    case 'let_go': return pair(e.who, e.worker, 'job');
    case 'quit': return pair(e.who, e.from, 'job');
    default: return null;
  }
}

/** What settles words of a kind: money or goods for paying and deals, a job for a job. */
export function settlesBy(kind: DealKind): Settles {
  return kind === 'job' ? 'job' : 'money';
}

/** Whether an event settles words of a kind. */
export function settles(kind: DealKind, by: Settles): boolean {
  return settlesBy(kind) === by;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface TalkMeasures {
  /** Runs of lines between one pair, said to each other, with no gap over 30 minutes. */
  chats: number;
  lines: number;
  meanLines: number;
  longest: number;
  /** Chats with something done between the two during them or within 5 minutes of the last line. */
  ledChats: number;
  ledChatShare: number;
  /** The share of lines that were in such chats. */
  ledLineShare: number;
  /** Lines claiming a deal done in words, and how many were followed by the deal within a few minutes. */
  wordDeals: number;
  wordDealsBacked: number;
  /** Times a pair reached the point of going round in circles. */
  circles: number;
}

/** Talk measures over a trial's events (pure: the events in order). */
export function talkMeasures(events: readonly GameEvent[], opts: { gap?: number; after?: number; backed?: number } = {}): TalkMeasures {
  const gap = opts.gap ?? 30;
  const after = opts.after ?? 5;
  const backedWithin = opts.backed ?? 5;
  const chats: { key: string; start: number; end: number; lines: number; led: boolean }[] = [];
  const open = new Map<string, (typeof chats)[number]>();
  const settled: { key: string; t: number; kind: Settles }[] = [];
  const words: { key: string; t: number; kind: DealKind }[] = [];
  let circles = 0;
  for (const e of events) {
    if (e.type === 'said' && e.to) {
      const key = pairKey(e.who, e.to);
      let c = open.get(key);
      if (!c || e.t - c.end > gap) {
        c = { key, start: e.t, end: e.t, lines: 0, led: false };
        chats.push(c);
        open.set(key, c);
      }
      c.lines++;
      c.end = e.t;
      const kind = dealKind(e.text);
      if (kind) words.push({ key, t: e.t, kind });
    } else if (e.type === 'circles') circles++;
    const s = settledBy(e);
    if (s) settled.push({ key: pairKey(s.a, s.b), t: e.t, kind: s.kind });
  }
  for (const c of chats) c.led = settled.some((s) => s.key === c.key && s.t >= c.start && s.t <= c.end + after);
  const lines = chats.reduce((n, c) => n + c.lines, 0);
  const led = chats.filter((c) => c.led);
  return {
    chats: chats.length,
    lines,
    meanLines: chats.length ? lines / chats.length : 0,
    longest: chats.reduce((m, c) => Math.max(m, c.lines), 0),
    ledChats: led.length,
    ledChatShare: chats.length ? led.length / chats.length : 0,
    ledLineShare: lines ? led.reduce((n, c) => n + c.lines, 0) / lines : 0,
    wordDeals: words.length,
    wordDealsBacked: words.filter((w) => settled.some((s) => s.key === w.key && settles(w.kind, s.kind) && s.t >= w.t && s.t <= w.t + backedWithin)).length,
    circles,
  };
}
