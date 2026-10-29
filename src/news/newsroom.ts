/**
 * Kampung News (docs/design/news.md): the owner's daily paper. Once a real
 * morning, from about 07:00 SGT, one cheap model call writes an issue from a
 * digest of the saved events, ledger and talk for every kampung day since the
 * last, in a 1960s broadsheet voice, facts only. A computed box of figures
 * ends each issue. Issues are runtime output under $KAMPUNG_HOME/news, kept
 * and listed newest first. Nothing here reaches a resident.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { feedText, isKeyMoment } from '../feed/feed.ts';
import { kinOf } from '../seed/cast.ts';
import { dayCap, MONTHLY_CAP } from '../mind/budget.ts';
import type { CostLog } from '../mind/cost-log.ts';
import type { ModelClient } from '../mind/model.ts';
import { dateAt, MONTHS, type Calendar } from '../sim/calendar.ts';
import type { GameEvent } from '../sim/events.ts';
import { formatMoney } from '../sim/money.ts';
import { dealKind } from '../sim/talk.ts';
import { dayIndex, hhmm, MINUTES_PER_DAY, SGT_OFFSET_MIN } from '../sim/time.ts';
import { boxRow, spendLines, type DayEnd, type DayFacts } from './box.ts';
import type { BoxRow, Issue, IssueSummary } from './types.ts';

export type { Issue, IssueSummary };

/** The first issue looks back this many whole kampung days. */
export const FIRST_ISSUE_DAYS = 5;
/** Most kampung days one issue covers: after a long stretch with none, the latest week, saying how many it leaves out. */
export const MAX_ISSUE_DAYS = 7;
/** Most paid tries at the morning's issue in a real day (a refused or unusable answer counts); then it waits for the next morning. */
export const MAX_TRIES_A_DAY = 3;
/** The hour (SGT) from which the morning's issue is due. */
export const ISSUE_HOUR = 7;
/** Checked against the day's cap before the call: a few cents at most for five days' notes (more for a longer stretch). */
export const NEWS_ESTIMATE = 0.02;
/** Most key moments and talk lines a kampung day puts in the digest. */
export const DIGEST_MOMENTS = 60;
export const DIGEST_TALK = 8;
/** After an issue couldn't be written (the cap spent, the call failed), it's tried again this much later. */
export const RETRY_MS = 10 * 60_000;
/** Most shorter reports kept from the writer. */
export const MAX_REPORTS = 8;

export const NEWS_SYSTEM = [
  'You write Kampung News, a small English-language daily paper for a 1960s kampung, in the plain, brisk voice of a 1960s broadsheet: a headline in capitals, short paragraphs, no flourishes.',
  'Report only what is in the notes you are given. Never invent an event, a quote, a price, a time, a person or a reason. If the notes don\'t say why, don\'t say why.',
  'Quotes must be words from the notes, exactly as they appear there.',
  'The lead story is the biggest event in the notes; then a handful of shorter reports on other things that happened. If little happened, say so plainly.',
  'If the notes say the kampung was quiet for a spell, say so in a short report.',
].join(' ');

const TOOL: Anthropic.Tool = {
  name: 'publish',
  description: 'Publish this issue: the lead story and the shorter reports.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string' },
      lead: { type: 'string' },
      reports: { type: 'array', items: { type: 'object', properties: { headline: { type: 'string' }, text: { type: 'string' } }, required: ['headline', 'text'] } },
    },
    required: ['headline', 'lead', 'reports'],
  },
};

/** What the newsroom reads from the town: read-only. */
export interface NewsDesk {
  /** The game minute now. */
  t(): number;
  calendar: Calendar;
  /** Who lives in the kampung, and whom each is married to (by name), if anyone. */
  residents(): { id: string; name: string; spouse?: string | null }[];
  /** Anyone's name, villagers too, for the feed's wording. */
  names(id: string): string;
  /** A kampung day's saved events, ledger and residents' replies. */
  facts(day: number): Omit<DayFacts, 'end'>;
  /** The last money check's line. */
  ledgerCheck(): string | null;
}

/** The town was down (a quiet spell is dated when it came back, and says how long it lasted). Not the cap's quiet. */
type QuietSpell = Extract<GameEvent, { type: 'quiet_spell' }>;
/** Talk worth a line in the digest: deals, money, houses, marrying, work, illness. */
const NOTABLE_TALK = /\b(marr|wed|rent|owe|debt|lend|borrow|pay|paid|price|sell|buy|job|work|hire|sick|ill|hungry|lorry|house|sorry|angry|thank)/i;

/** A kampung day as the paper writes it: "Tuesday 3 January, Year 0". */
function dayTitle(cal: Calendar, day: number): string {
  const d = dateAt({ calendar: cal }, day * MINUTES_PER_DAY - SGT_OFFSET_MIN);
  return `${d.weekday} ${d.day} ${MONTHS[d.month - 1]}, Year ${d.year}`;
}

/** "Kampung, Tuesday 3 January, Year 0". */
export function dateline(cal: Calendar, t: number): string {
  return `Kampung, ${dayTitle(cal, dayIndex(t))}`;
}

/** Quoted words, in "…", “…” or ‘…’ (an apostrophe inside, as in Don’t, isn't a closing quote). */
function quotes(text: string): string[] {
  const double = [...text.matchAll(/["“]([^"”]{8,})["”]/g)].map((m) => m[1]!);
  const single = [...text.matchAll(/‘(.{8,}?)’(?![a-z])/gi)].map((m) => m[1]!);
  return [...double, ...single].map((q) => q.trim());
}
const squash = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');

export class Newsroom {
  private readonly dir: string;
  private readonly client: ModelClient;
  private readonly costs: CostLog;
  private readonly desk: NewsDesk;
  private readonly translate: ((texts: string[]) => Promise<(string | null)[]>) | null;
  private readonly now: () => number;
  private readonly onError: (err: unknown) => void;
  private townCap: number | null;
  private issues: Issue[] = [];
  private ends = new Map<number, DayEnd>();
  private busy: Promise<Issue | null> | null = null;
  private retryAt = 0;
  private tries = { day: '', n: 0 };

  constructor(opts: {
    dir: string; client: ModelClient; costs: CostLog; desk: NewsDesk;
    translate?: (texts: string[]) => Promise<(string | null)[]>; now?: () => number; townCap?: number; onError?: (err: unknown) => void;
  }) {
    this.dir = join(opts.dir, 'news');
    this.client = opts.client;
    this.costs = opts.costs;
    this.desk = opts.desk;
    this.translate = opts.translate ?? null;
    this.now = opts.now ?? Date.now;
    this.townCap = opts.townCap ?? null;
    this.onError = opts.onError ?? (() => {});
    const issues = join(this.dir, 'issues');
    if (existsSync(issues)) {
      for (const f of readdirSync(issues).filter((x) => /^\d+\.json$/.test(x))) {
        try {
          this.issues.push(JSON.parse(readFileSync(join(issues, f), 'utf8')) as Issue);
        } catch {
          // A damaged issue file is left out of the list; the next issue still follows on.
        }
      }
      this.issues.sort((a, b) => a.n - b.n);
    }
    const days = join(this.dir, 'days.jsonl');
    if (existsSync(days)) {
      for (const line of readFileSync(days, 'utf8').split('\n')) {
        try {
          const e = JSON.parse(line) as DayEnd;
          if (typeof e.day === 'number') this.ends.set(e.day, e);
        } catch {
          // A torn last line: that day's ending is unknown.
        }
      }
    }
  }

  /** Back issues, newest first. */
  list(): IssueSummary[] {
    return [...this.issues].reverse().map((i) => ({ n: i.n, dateline: i.dateline, headline: i.headline, fromDay: i.fromDay, toDay: i.toDay }));
  }

  get(n: number): Issue | null {
    return this.issues.find((i) => i.n === n) ?? null;
  }

  /** The end of a kampung day (at midnight), for that day's row in the box. */
  recordDayEnd(end: DayEnd): void {
    this.ends.set(end.day, end);
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(join(this.dir, 'days.jsonl'), JSON.stringify(end) + '\n');
  }

  private sgtDay(ms: number): string {
    return new Date(ms + SGT_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
  }

  /** From 07:00 SGT, once a real day. */
  due(realMs: number): boolean {
    if (new Date(realMs + SGT_OFFSET_MIN * 60_000).getUTCHours() < ISSUE_HOUR) return false;
    const last = this.issues.at(-1);
    return !last || this.sgtDay(last.publishedMs) < this.sgtDay(realMs);
  }

  /** Writes the morning's issue if it's due and the cap allows; one at a time. */
  publishIfDue(realMs = this.now()): Promise<Issue | null> {
    if (this.busy) return this.busy;
    if (!this.due(realMs) || realMs < this.retryAt) return Promise.resolve(null);
    if (this.tries.day === this.sgtDay(realMs) && this.tries.n >= MAX_TRIES_A_DAY) return Promise.resolve(null);
    this.busy = this.publish(realMs)
      .catch((err: unknown) => { this.onError(err); return null; })
      .then((issue) => { if (!issue) this.retryAt = realMs + RETRY_MS; return issue; })
      .finally(() => { this.busy = null; });
    return this.busy;
  }

  private async publish(realMs: number): Promise<Issue | null> {
    const today = dayIndex(this.desk.t());
    const last = this.issues.at(-1);
    const toDay = today - 1;
    const since = last ? last.toDay + 1 : today - FIRST_ISSUE_DAYS;
    const fromDay = Math.max(since, toDay - MAX_ISSUE_DAYS + 1);
    const leftOut = fromDay - since;
    if (toDay < fromDay) return null;
    // Within the day's cap, or it waits for later: an issue is never skipped.
    const cap = this.townCap ?? dayCap(this.costs, realMs);
    const estimate = NEWS_ESTIMATE * Math.max(1, (toDay - fromDay + 1) / FIRST_ISSUE_DAYS);
    if (this.costs.spentOn(this.costs.dayKey(realMs)) + estimate > cap) return null;

    const residents = this.desk.residents();
    const days: DayFacts[] = [];
    for (let d = fromDay; d <= toDay; d++) days.push({ ...this.desk.facts(d), end: this.ends.get(d) ?? null });
    // Down at some point in these days: a quiet spell recorded in them, or one that ended today but began in them.
    const rangeEnd = (toDay + 1) * MINUTES_PER_DAY - SGT_OFFSET_MIN;
    const spells = [...days.flatMap((d) => d.events), ...this.desk.facts(today).events].filter((e): e is QuietSpell => e.type === 'quiet_spell');
    const gap = spells.some((e) => e.t - e.minutes < rangeEnd && e.t >= fromDay * MINUTES_PER_DAY - SGT_OFFSET_MIN);
    const rows = days.map((d) => ({ ...boxRow(d, residents), date: dayTitle(this.desk.calendar, d.day) }));
    const digest = await this.digest(days, rows, gap, leftOut);

    const day = this.sgtDay(realMs);
    this.tries = { day, n: (this.tries.day === day ? this.tries.n : 0) + 1 };
    let res;
    try {
      res = await this.client.think({
        tier: 'routine', kind: 'news', residentId: 'kampung-news', t: this.desk.t(), system: NEWS_SYSTEM, user: digest, tools: [TOOL],
        hint: { fake: { headline: 'NEWS FROM THE KAMPUNG', lead: 'A quiet stretch in the kampung.', reports: [] } },
      });
    } catch (err) {
      // Unreachable or timed out: it may still be billed, so its estimate counts.
      this.costs.add({ t: this.desk.t(), realMs, resident: 'kampung-news', kind: 'news', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: estimate });
      throw err;
    }
    for (const a of res.attempts) this.costs.add({ t: this.desk.t(), realMs, resident: 'kampung-news', kind: 'news', model: a.model, usage: a.usage });
    const out = res.toolCall?.input as { headline?: unknown; lead?: unknown; reports?: unknown } | undefined;
    if (res.refused || !out || typeof out.headline !== 'string' || typeof out.lead !== 'string') return null;
    // Facts only: a report quoting words that aren't in the notes is dropped.
    const known = squash(digest);
    const onRecord = (text: string) => quotes(text).every((q) => known.includes(squash(q)));
    const reports = (Array.isArray(out.reports) ? out.reports : [])
      .filter((r): r is { headline: string; text: string } => !!r && typeof r.headline === 'string' && typeof r.text === 'string' && r.text.trim() !== '')
      .filter((r) => onRecord(r.headline) && onRecord(r.text))
      .slice(0, MAX_REPORTS)
      .map((r) => ({ headline: r.headline.trim(), text: r.text.trim() }));
    // A lead quoting words not on record goes whole; the first report on record takes its place.
    let headline = out.headline.trim();
    let lead = out.lead.trim();
    if (!lead || !onRecord(headline) || !onRecord(lead)) {
      const first = reports.shift();
      if (!first) return null;
      ({ headline, text: lead } = first);
    }

    // The spend for each real day since the last issue came out (that day whole now), and the month so far.
    const spendDays: { day: string; usd: number; cap: number }[] = [];
    const sinceDay = last ? this.sgtDay(last.publishedMs) : this.sgtDay(realMs - 86_400_000);
    for (let ms = realMs - 86_400_000 * 6; ms <= realMs; ms += 86_400_000) {
      const d = this.costs.dayKey(ms);
      if (d >= sinceDay) spendDays.push({ day: d, usd: this.costs.spentOn(d), cap: dayCap(this.costs, ms) });
    }
    const [y, m, dd] = this.costs.dayKey(realMs).split('-');
    let month = 0;
    for (let k = 1; k <= Number(dd); k++) month += this.costs.spentOn(`${y}-${m}-${String(k).padStart(2, '0')}`);
    const issue: Issue = {
      n: (last?.n ?? 0) + 1, publishedMs: realMs, dateline: dateline(this.desk.calendar, this.desk.t()), fromDay, toDay, gap, leftOut,
      headline, lead, reports,
      box: { rows, spend: spendLines(spendDays), month: { usd: month, cap: MONTHLY_CAP }, ledgerCheck: this.desk.ledgerCheck() },
    };
    mkdirSync(join(this.dir, 'issues'), { recursive: true });
    writeFileSync(join(this.dir, 'issues', `${issue.n}.json`), JSON.stringify(issue));
    this.issues.push(issue);
    return issue;
  }

  /** Who is family to whom, and who is married: so the paper never has to guess. */
  private whoIsWho(): string[] {
    const residents = this.desk.residents();
    const parts = new Map(residents.map((r) => [r.id, [] as string[]]));
    for (const r of residents) {
      for (const k of kinOf(r.id)) parts.get(k.id)?.push(`${r.name}'s ${k.word}`);
      if (r.spouse) parts.get(r.id)!.push(`married to ${r.spouse}`);
    }
    return ["Who's who:", ...residents.map((r) => `${r.name}: ${parts.get(r.id)!.join('; ') || 'no family in the kampung'}.`)];
  }

  /** The notes the writer may report from: each day's key moments, its talk (in English), and plain figures. */
  private async digest(days: readonly DayFacts[], rows: readonly BoxRow[], gap = false, leftOut = 0): Promise<string> {
    const n = (id: string) => this.desk.names(id);
    const talk = days.map((d) => {
      const seen = new Set<string>();
      return (d.events.filter((e) => e.type === 'said') as Extract<GameEvent, { type: 'said' }>[])
        .filter((e) => e.text.split(/\s+/).length >= 4 && (dealKind(e.text) !== null || NOTABLE_TALK.test(e.text)))
        .filter((e) => !seen.has(e.text) && !!seen.add(e.text))
        .slice(0, DIGEST_TALK);
    });
    const texts = talk.flat().map((e) => e.text);
    let english: (string | null)[] = texts.map(() => null);
    if (this.translate && texts.length) {
      try {
        english = await this.translate(texts);
      } catch (err) {
        this.onError(err);
      }
    }
    const inEnglish = new Map(texts.map((t, i) => [t, english[i] ?? t]));
    const out: string[] = ['Notes for the issue, day by day. Times are the kampung clock.'];
    if (leftOut) out.push(`These notes cover only the latest ${days.length} days: no issue came out for the ${leftOut} earlier days, and they go unreported.`);
    if (gap) out.push('The town was down for a spell in these days: the kampung went quiet, and nothing was recorded while it was.');
    out.push('', ...this.whoIsWho());
    days.forEach((d, i) => {
      const row = rows[i]!;
      out.push('', `== ${dayTitle(this.desk.calendar, d.day)} ==`);
      const moments = d.events
        .filter((e) => e.type !== 'said')
        .map((e) => ({ e, f: feedText(e, n) }))
        .filter((x) => x.f && isKeyMoment(x.e, x.f.notable))
        .slice(0, DIGEST_MOMENTS);
      // The same line again and again (a haggle turned down four times) is one line, with how often.
      const folded = new Map<string, { t: number; n: number }>();
      for (const { e, f } of moments) {
        const x = folded.get(f!.text);
        if (x) x.n++;
        else folded.set(f!.text, { t: e.t, n: 1 });
      }
      for (const [text, x] of folded) out.push(`${hhmm(x.t)} ${text}${x.n > 1 ? ` (${x.n} times)` : ''}`);
      if (!moments.length) out.push('Nothing of note was recorded.');
      for (const e of talk[i]!) out.push(`${hhmm(e.t)} ${n(e.who)}${e.to ? ` to ${n(e.to)}` : ''}: "${inEnglish.get(e.text)}"`);
      out.push(`Meals eaten: ${row.meals}.${row.under2.length ? ` Ate fewer than twice: ${row.under2.join(', ')}.` : ''}`);
      if (row.hunger1000?.length) out.push(`Starving at the day's end: ${row.hunger1000.join(', ')}.`);
      if (row.fellIll.length) out.push(`Fell ill: ${row.fellIll.join(', ')}.`);
      if (row.gotWell.length) out.push(`Got well: ${row.gotWell.join(', ')}.`);
      out.push(`Money into the kampung from outside: ${formatMoney(row.edgeIn)}; out of it: ${formatMoney(row.edgeOut)}.`);
    });
    return out.join('\n');
  }
}
