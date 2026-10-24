import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayIndex, msFromGameMinute } from '../sim/time.ts';
import type { ThinkKind, TokenUsage } from './model.ts';
import { costUsd } from './pricing.ts';

export interface CostEntry {
  t: number;
  resident: string;
  kind: ThinkKind;
  model: string;
  usage: TokenUsage;
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

  /** Singapore calendar date of a game minute, e.g. "2026-11-02". */
  dayKey(t: number): string {
    return new Date(msFromGameMinute(dayIndex(t) * 1440)).toISOString().slice(0, 10);
  }

  add(e: CostEntry): number {
    const usd = costUsd(e.model, e.usage);
    const day = this.dayKey(e.t);
    this.totals.set(day, this.spentOn(day) + usd);
    if (this.dir) {
      mkdirSync(this.dir, { recursive: true });
      appendFileSync(join(this.dir, `${day}.jsonl`), JSON.stringify({
        t: e.t, at: new Date(msFromGameMinute(e.t)).toISOString(), resident: e.resident, kind: e.kind, model: e.model,
        input: e.usage.input_tokens, output: e.usage.output_tokens,
        cacheRead: e.usage.cache_read_input_tokens ?? 0, cacheWrite: e.usage.cache_creation_input_tokens ?? 0, usd,
      }) + '\n');
    }
    return usd;
  }

  spentOn(day: string): number {
    const known = this.totals.get(day);
    if (known !== undefined) return known;
    let sum = 0;
    const file = this.dir ? join(this.dir, `${day}.jsonl`) : null;
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.trim()) sum += (JSON.parse(line) as { usd: number }).usd;
      }
    }
    this.totals.set(day, sum);
    return sum;
  }
}
