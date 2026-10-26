import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SGT_OFFSET_MIN } from '../sim/time.ts';
import type { ThinkKind, TokenUsage } from './model.ts';
import { costUsd } from './pricing.ts';

export interface CostEntry {
  t: number;
  /** The real moment of the call, by the town's clock: the cost counts towards that real day. */
  realMs: number;
  resident: string;
  kind: ThinkKind;
  model: string;
  usage: TokenUsage;
  /** Set for a call that failed without a bill to read: its estimated cost, counted to be safe. */
  estimatedUsd?: number;
}

/** A cost-log line that can't be read (cut off by a power cut) is counted as this many dollars. */
export const UNREADABLE_LINE_USD = 0.04;

/** Dollars recorded in one cost-log file. Unreadable lines count conservatively. */
export function sumCostFile(file: string): number {
  let sum = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const usd = (JSON.parse(line) as { usd?: unknown }).usd;
      sum += typeof usd === 'number' && Number.isFinite(usd) ? usd : UNREADABLE_LINE_USD;
    } catch {
      sum += UNREADABLE_LINE_USD;
    }
  }
  return sum;
}

/**
 * One JSONL file a day under $KAMPUNG_HOME/costs/ (private, never committed):
 * every call's model, tokens and real cost, by resident. Totals are rebuilt
 * from the file on start, so the town's daily cap survives a restart.
 */
export class CostLog {
  private totals = new Map<string, number>();
  private readonly dir: string | null;

  /** `dir` null keeps totals in memory only (fast sims). */
  constructor(dir: string | null) {
    this.dir = dir;
  }

  /** The real Singapore date of a real moment, e.g. "2026-11-02": the town's cap is per real day. */
  dayKey(realMs: number): string {
    return new Date(realMs + SGT_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
  }

  add(e: CostEntry): number {
    const usd = e.estimatedUsd ?? costUsd(e.model, e.usage);
    const day = this.dayKey(e.realMs);
    this.totals.set(day, this.spentOn(day) + usd);
    if (this.dir) {
      mkdirSync(this.dir, { recursive: true });
      appendFileSync(join(this.dir, `${day}.jsonl`), JSON.stringify({
        t: e.t, at: new Date(e.realMs).toISOString(), resident: e.resident, kind: e.kind, model: e.model,
        input: e.usage.input_tokens, output: e.usage.output_tokens,
        cacheRead: e.usage.cache_read_input_tokens ?? 0, cacheWrite: e.usage.cache_creation_input_tokens ?? 0, usd,
        ...(e.estimatedUsd !== undefined ? { estimated: true } : {}),
      }) + '\n');
    }
    return usd;
  }

  /** How many calls `resident` made from game minute `sinceT` on, in the given real days' logs (none kept in memory only). */
  callsSince(resident: string, sinceT: number, days: readonly string[]): number {
    if (!this.dir) return 0;
    let n = 0;
    for (const day of days) {
      const file = join(this.dir, `${day}.jsonl`);
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const e = JSON.parse(line) as { resident?: string; t?: number };
          if (e.resident === resident && (e.t ?? -1) >= sinceT) n++;
        } catch {
          // A torn last line: skip it.
        }
      }
    }
    return n;
  }

  spentOn(day: string): number {
    const known = this.totals.get(day);
    if (known !== undefined) return known;
    const file = this.dir ? join(this.dir, `${day}.jsonl`) : null;
    const sum = file && existsSync(file) ? sumCostFile(file) : 0;
    this.totals.set(day, sum);
    return sum;
  }
}
