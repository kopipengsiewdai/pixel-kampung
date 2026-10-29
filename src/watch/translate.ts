/**
 * English for the owner's watch page: lines residents said or thought in
 * Malay (or anything else) are put into English on the cheap model, in
 * batches, only when the page asks. Every call is in the cost log as
 * "translate" and inside the town's daily cap; translations are kept in a
 * private file under $KAMPUNG_HOME so each line is paid for once.
 * Nothing here reaches the residents.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dayCap, ESTIMATE } from '../mind/budget.ts';
import type { CostLog } from '../mind/cost-log.ts';
import type { ModelClient } from '../mind/model.ts';
import { looksForeign } from './foreign.ts';

/** Most lines one call takes, and one request may ask for. */
export const BATCH = 20;
export const MAX_ASK = 60;
/** Longest line sent (a note or a long thought). */
export const MAX_CHARS = 600;
/** Translations kept on disk; the oldest go first. */
export const KEEP = 5000;

export const TRANSLATE_SYSTEM = 'You translate short lines spoken or thought by villagers in a 1960s Singapore kampung into plain, natural English. Keep names, keep the speaker\'s tone, keep it short, and add nothing. A line already in English stays as it is.';

const TOOL: Anthropic.Tool = {
  name: 'answer',
  description: 'Give the English for each line, in the same order.',
  input_schema: {
    type: 'object',
    properties: { english: { type: 'array', items: { type: 'string' } } },
    required: ['english'],
  },
};

export class Translator {
  private readonly client: ModelClient;
  private readonly costs: CostLog;
  private readonly file: string | null;
  private readonly townCap: number | null;
  private readonly now: () => number;
  private readonly onError: (err: unknown) => void;
  private readonly known = new Map<string, string>();
  /** One call at a time, so the same lines are never paid for twice. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(opts: { client: ModelClient; costs: CostLog; file?: string; townCap?: number; now?: () => number; onError?: (err: unknown) => void }) {
    this.client = opts.client;
    this.costs = opts.costs;
    this.file = opts.file ?? null;
    this.townCap = opts.townCap ?? null;
    this.now = opts.now ?? Date.now;
    this.onError = opts.onError ?? (() => {});
    if (this.file && existsSync(this.file)) {
      try {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
        if (saved && typeof saved === 'object') {
          for (const [k, v] of Object.entries(saved)) if (typeof v === 'string') this.known.set(k, v);
        }
      } catch {
        // A damaged file just means paying for those lines again.
      }
    }
  }

  /**
   * English for each line, or null where it's already English (or can't be had right now).
   * `all`: every line is sent, whatever the foreign-line check says (the paper's quotes: an English line comes back as it was).
   */
  english(texts: readonly string[], opts: { all?: boolean } = {}): Promise<(string | null)[]> {
    const run = this.queue.then(() => this.translate(texts.slice(0, MAX_ASK), opts.all === true));
    this.queue = run.catch(() => {});
    return run;
  }

  private async translate(texts: readonly string[], all: boolean): Promise<(string | null)[]> {
    const wanted = [...new Set(texts.filter((x) => typeof x === 'string' && x.length <= MAX_CHARS && (all || looksForeign(x)) && !this.known.has(x)))];
    for (let i = 0; i < wanted.length; i += BATCH) {
      if (!(await this.call(wanted.slice(i, i + BATCH)))) break;
    }
    return texts.map((x) => this.known.get(x) ?? null);
  }

  private async call(lines: string[]): Promise<boolean> {
    const realMs = this.now();
    if (this.costs.spentOn(this.costs.dayKey(realMs)) + ESTIMATE.routine > (this.townCap ?? dayCap(this.costs, realMs))) return false;
    const user = `Lines:\n${lines.map((l, i) => `${i + 1}. ${JSON.stringify(l)}`).join('\n')}`;
    try {
      const res = await this.client.think({
        tier: 'routine', kind: 'translate', residentId: 'watch-page', t: 0, system: TRANSLATE_SYSTEM, user, tools: [TOOL],
        hint: { fake: { english: lines.map((l) => `(English) ${l}`) } },
      });
      for (const a of res.attempts) this.costs.add({ t: 0, realMs, resident: 'watch-page', kind: 'translate', model: a.model, usage: a.usage });
      const english = (res.toolCall?.input as { english?: unknown } | undefined)?.english;
      if (res.refused || !Array.isArray(english) || english.length !== lines.length) return false;
      lines.forEach((l, i) => {
        const e = english[i];
        if (typeof e === 'string' && e.trim()) this.known.set(l, e.trim().slice(0, MAX_CHARS * 2));
      });
      this.save();
      return true;
    } catch (err) {
      this.onError(err);
      this.costs.add({ t: 0, realMs, resident: 'watch-page', kind: 'translate', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: ESTIMATE.routine });
      return false;
    }
  }

  private save(): void {
    while (this.known.size > KEEP) this.known.delete(this.known.keys().next().value!);
    if (this.file) writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.known)));
  }
}
