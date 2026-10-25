/**
 * Pak Osman's bounded head (docs/design/village-characters.md): a few short
 * calls a visit on the cheap model, his prices once, up to HAGGLES_PER_VISIT
 * answers to a haggle, and one line of news. Every call is counted in the
 * cost log and the town's daily cap; with the cap spent or the call failing,
 * he answers by his scripted ways. Whatever comes back is clamped by
 * src/sim/osman.ts, so the model can only choose within his bounds.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { formatMoney } from '../sim/money.ts';
import { HAGGLES_PER_VISIT, OSMAN_ID, type HaggleAnswer, type HaggleBrief, type Mood, type OsmanHead, type PriceBrief } from '../sim/osman.ts';
import { ESTIMATE, TOWN_DAILY_CAP } from './budget.ts';
import type { CostLog } from './cost-log.ts';
import type { ModelClient } from './model.ts';

/** Calls a visit at most: one for prices, one for news, and the haggles. */
export const CALLS_PER_VISIT = 2 + HAGGLES_PER_VISIT;

export const OSMAN_SYSTEM = `You are Pak Osman, a lorry driver in your fifties. You drive for a wholesaler at the town market and come out to a small seaside kampung most mornings: you sell rice, coffee powder, bread and kerosene off the back of your lorry and buy the kampung's fish and vegetables to take back to town. You are widowed and save every spare cent for your daughter's schooling in town. You are a hard but fair haggler, soft on the regulars, and you never forget a debt. You like to pass on a bit of news from town. You speak plainly, as a kampung lorry man of the 1960s would, with the odd Malay word.`;

const MOOD: Record<Mood, string> = {
  slow: 'Trade has been slow in the kampung lately: people are holding on to their money.',
  usual: 'Trade in the kampung is about as usual.',
  brisk: 'Money seems to be going round the kampung freely lately.',
};

export const ANSWER_TOOL: Anthropic.Tool = {
  name: 'answer',
  description: 'Give your answer.',
  input_schema: {
    type: 'object',
    properties: {
      sells: { type: 'object', description: 'Your selling price for each thing, in cents, e.g. {"rice": 20}.' },
      buys: { type: 'object', description: 'What you pay for each thing, in cents, e.g. {"fish": 15}.' },
      answer: { type: 'string', enum: ['accept', 'counter', 'refuse'] },
      each: { type: 'integer', description: 'Your counter price for one, in cents.' },
      words: { type: 'string', description: 'What you say, one short line.' },
    },
  },
};

const list = (prices: Record<string, number | undefined>) => Object.entries(prices).map(([k, v]) => `${k} ${formatMoney(v ?? 0)}`).join(', ');

export class ModelOsmanHead implements OsmanHead {
  private readonly client: ModelClient;
  private readonly costs: CostLog;
  private readonly townCap: number;
  /** Told about every failed call (never given the key). */
  private readonly onError: (err: unknown) => void;

  constructor(opts: { client: ModelClient; costs: CostLog; townCap?: number; onError?: (err: unknown) => void }) {
    this.client = opts.client;
    this.costs = opts.costs;
    this.townCap = opts.townCap ?? TOWN_DAILY_CAP;
    this.onError = opts.onError ?? (() => {});
  }

  /** One short call within the town's cap; the tool's input, or null to fall back. */
  private async ask(user: string, fake: unknown, at: { t: number; realMs: number }): Promise<Record<string, unknown> | null> {
    if (this.costs.spentOn(this.costs.dayKey(at.realMs)) + ESTIMATE.routine > this.townCap) return null;
    try {
      const res = await this.client.think({ tier: 'routine', kind: 'trader', residentId: OSMAN_ID, t: at.t, system: OSMAN_SYSTEM, user, tools: [ANSWER_TOOL], hint: { fake } });
      for (const a of res.attempts) this.costs.add({ t: at.t, realMs: at.realMs, resident: OSMAN_ID, kind: 'trader', model: a.model, usage: a.usage });
      const input = res.toolCall?.input;
      return !res.refused && input && typeof input === 'object' ? input as Record<string, unknown> : null;
    } catch (err) {
      this.onError(err);
      this.costs.add({ t: at.t, realMs: at.realMs, resident: OSMAN_ID, kind: 'trader', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: ESTIMATE.routine });
      return null;
    }
  }

  async price(b: PriceBrief, at: { t: number; realMs: number }): Promise<{ sells?: Record<string, unknown>; buys?: Record<string, unknown> } | null> {
    const range = (key: string) => { const r = b.bounds[key]!; return `${formatMoney(r[0])} to ${formatMoney(r[1])}`; };
    const user = [
      `You've just parked at the kampung's lorry stop. ${MOOD[b.mood]}`,
      `On the lorry today: ${list(b.load.brought) || 'nothing much'}; room for about ${b.load.room} more baskets of produce.`,
      `At the town market things fetch: ${list(b.town)}.`,
      `You'd sell between: ${Object.keys(b.scripted.sells).map((k) => `${k} ${range(`sells:${k}`)}`).join(', ')}.`,
      `You'd pay between: ${Object.keys(b.scripted.buys).map((k) => `${k} ${range(`buys:${k}`)}`).join(', ')}.`,
      `Your usual today would be selling ${list(b.scripted.sells)}, and paying ${list(b.scripted.buys)}.`,
      "Set today's prices, in cents.",
    ].join('\n');
    const got = await this.ask(user, b.scripted, at);
    return got ? { sells: got.sells as Record<string, unknown>, buys: got.buys as Record<string, unknown> } : null;
  }

  async haggle(b: HaggleBrief, at: { t: number; realMs: number }): Promise<HaggleAnswer | null> {
    const what = `${b.qty} ${b.item}`;
    const who = `${b.name}${b.cheated ? ', who once let a debt to you run past its week' : b.regular ? ', one of your regulars' : ''}`;
    const user = b.side === 'sells'
      ? `${who} offers you ${formatMoney(b.offered)} for ${what}. Your price is ${formatMoney(b.list)} each; you'd never go below ${formatMoney(b.floor)} each. Accept, counter with a price for one, or refuse, and say a few words.`
      : `${who} asks ${formatMoney(b.offered)} for ${what}. You're paying ${formatMoney(b.list)} each; you'd never pay more than ${formatMoney(b.ceiling)} each. Accept, counter with a price for one, or refuse, and say a few words.`;
    const got = await this.ask(user, b.scripted, at);
    if (!got || !['accept', 'counter', 'refuse'].includes(got.answer as string)) return null;
    return { answer: got.answer as HaggleAnswer['answer'], each: typeof got.each === 'number' ? got.each : undefined, words: typeof got.words === 'string' ? got.words : undefined };
  }

  async gossip(b: { mood: Mood; short: string[]; plenty: string[] }, at: { t: number; realMs: number }): Promise<string | null> {
    const market = [b.short.length ? `${b.short.join(' and ')} short at the market` : '', b.plenty.length ? `plenty of ${b.plenty.join(' and ')}` : ''].filter(Boolean).join('; ');
    const user = `People are gathering at the lorry. Share one short line of news or talk from town, the sort a lorry driver brings${market ? ` (you noticed: ${market})` : ''}. One sentence, in your own voice.`;
    const got = await this.ask(user, null, at);
    return typeof got?.words === 'string' ? got.words : null;
  }
}
