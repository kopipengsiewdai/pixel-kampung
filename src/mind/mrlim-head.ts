/**
 * Mr Lim's bounded head (docs/design/village-characters.md, households-build.md
 * PR B): a few short calls on the cheap model. Each morning, how much paid work
 * to put up and what it pays, from what he sees of the kampung. Every call is
 * counted in the cost log and the town's daily cap; whatever comes back is held
 * within his bounds by src/sim/mr-lim.ts, and with the cap spent or a call
 * failing he goes his own (scripted) way.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { formatMoney } from '../sim/money.ts';
import { type DecideAnswer, type DecideBrief, type HelpAnswer, type HelpBrief, JOB_PAY_BOUNDS, JOBS_A_DAY_BOUNDS, type MrLimBrief, type MrLimHead, type ReviewAnswer, type ReviewBrief } from '../sim/mr-lim.ts';
import { MR_LIM_ID } from '../sim/state.ts';
import { dayCap, ESTIMATE } from './budget.ts';
import type { CostLog } from './cost-log.ts';
import type { ModelClient } from './model.ts';

export const MR_LIM_SYSTEM = `You are Mr Lim, the village head of a small seaside kampung in the 1960s. You own the houses and stalls and let them, you keep the village fund, and out of your own pocket you pay villagers for odd jobs about the place: mending, clearing, carrying. You are private, careful with money but not unkind, and you would rather people earned their rice than went hungry. You speak plainly and briefly.`;

export const PLAN_TOOL: Anthropic.Tool = {
  name: 'plan',
  description: "Decide today's odd jobs.",
  input_schema: {
    type: 'object',
    properties: {
      jobs: { type: 'integer', description: `How many odd jobs to put up today, ${JOBS_A_DAY_BOUNDS[0]} to ${JOBS_A_DAY_BOUNDS[1]}.` },
      pay: { type: 'integer', description: `What each pays, in cents, ${JOB_PAY_BOUNDS[0]} to ${JOB_PAY_BOUNDS[1]}.` },
    },
    required: ['jobs', 'pay'],
  },
};

export const HELP_TOOL: Anthropic.Tool = {
  name: 'help',
  description: 'Answer someone asking for help.',
  input_schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', enum: ['grace', 'loan', 'no'] },
      amount: { type: 'integer', description: 'For a loan: how much, in cents.' },
      words: { type: 'string', description: 'What you say to them, one short line.' },
    },
    required: ['answer'],
  },
};

export const DECIDE_TOOL: Anthropic.Tool = {
  name: 'decide',
  description: 'Answer the offers for a place.',
  input_schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', enum: ['accept', 'counter', 'wait'] },
      offer: { type: 'integer', description: 'The number of the offer you accept, or answer with a counter (leave out to counter every offer of that kind).' },
      cents: { type: 'integer', description: 'For a counter: what you would take, in cents.' },
      kind: { type: 'string', enum: ['rent', 'buy'], description: 'For a counter: a rent a week, or a price to buy outright.' },
      words: { type: 'string', description: 'What you say to them, one short line.' },
    },
    required: ['answer'],
  },
};

export const REVIEW_TOOL: Anthropic.Tool = {
  name: 'review',
  description: 'Set new rents for the houses you let, or none.',
  input_schema: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        description: 'Only the houses whose rent you change; leave empty to change none.',
        items: {
          type: 'object',
          properties: {
            house: { type: 'integer', description: 'The number of the house.' },
            rent: { type: 'integer', description: 'Its new rent a week, in cents.' },
          },
          required: ['house', 'rent'],
        },
      },
      words: { type: 'string', description: 'What you say to a tenant whose rent you change, one short line.' },
    },
    required: ['changes'],
  },
};

export class ModelMrLimHead implements MrLimHead {
  private readonly client: ModelClient;
  private readonly costs: CostLog;
  private readonly onError: (err: unknown) => void;

  constructor(opts: { client: ModelClient; costs: CostLog; onError?: (err: unknown) => void }) {
    this.client = opts.client;
    this.costs = opts.costs;
    this.onError = opts.onError ?? (() => {});
  }

  /** One short call within the town's cap; the tool's input, or null to fall back. */
  private async ask(user: string, at: { t: number; realMs: number }, tool: Anthropic.Tool = PLAN_TOOL): Promise<Record<string, unknown> | null> {
    if (this.costs.spentOn(this.costs.dayKey(at.realMs)) + ESTIMATE.routine > dayCap(this.costs, at.realMs)) return null;
    try {
      const res = await this.client.think({ tier: 'routine', kind: 'trader', residentId: MR_LIM_ID, t: at.t, system: MR_LIM_SYSTEM, user, tools: [tool], hint: { fake: null } });
      for (const a of res.attempts) this.costs.add({ t: at.t, realMs: at.realMs, resident: MR_LIM_ID, kind: 'trader', model: a.model, usage: a.usage });
      const input = res.toolCall?.input;
      return !res.refused && input && typeof input === 'object' ? input as Record<string, unknown> : null;
    } catch (err) {
      this.onError(err);
      this.costs.add({ t: at.t, realMs: at.realMs, resident: MR_LIM_ID, kind: 'trader', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: ESTIMATE.routine });
      return null;
    }
  }

  async plan(b: MrLimBrief, at: { t: number; realMs: number }): Promise<{ jobs?: unknown; pay?: unknown } | null> {
    const user = [
      `It's early morning. Of the ${b.residents} villagers, ${b.broke} have no money at all and ${b.hungry} look hungry.`,
      `Yesterday you put up ${b.yesterday.posted} odd jobs and ${b.yesterday.done} were done.`,
      `The village fund holds ${formatMoney(b.fund)}.`,
      `How many odd jobs will you put up today (${JOBS_A_DAY_BOUNDS[0]} to ${JOBS_A_DAY_BOUNDS[1]}), and what will each pay (${formatMoney(JOB_PAY_BOUNDS[0])} to ${formatMoney(JOB_PAY_BOUNDS[1])})?`,
    ].join('\n');
    return this.ask(user, at);
  }

  async help(b: HelpBrief, at: { t: number; realMs: number }): Promise<HelpAnswer | null> {
    const choices = [b.canGrace ? `a week's grace on the ${formatMoney(b.owing)} rent they owe` : '', b.canLend > 0 ? `a loan of up to ${formatMoney(b.canLend)}, paid back a little each Monday` : '', 'no'].filter(Boolean);
    const user = [
      `${b.name} comes to your door asking for help. They have ${formatMoney(b.money)}${b.owing ? ` and owe ${formatMoney(b.owing)} in rent` : ''}.`,
      `You could give: ${choices.join('; or ')}.`,
      'Decide, and say a few words to them.',
    ].join('\n');
    return this.ask(user, at, HELP_TOOL);
  }

  async decide(b: DecideBrief, at: { t: number; realMs: number }): Promise<DecideAnswer | null> {
    const free = b.freeDays === null ? '' : ` It has stood empty ${b.freeDays === 0 ? 'since today' : `${b.freeDays} day${b.freeDays === 1 ? '' : 's'}`}.`;
    const user = [
      `This evening you look over the offers for ${b.place}.${free} Its rent has been ${formatMoney(b.rent)} a week.`,
      ...b.offers.map((o) => `Offer ${o.n}: ${o.name} offers ${formatMoney(o.cents)}${o.kind === 'rent' ? ' a week to rent it' : ' to buy it outright'}.`),
      'You may accept one offer, counter with what you would take, or wait for better. Decide, and say a few words.',
    ].join('\n');
    return this.ask(user, at, DECIDE_TOOL);
  }

  async review(b: ReviewBrief, at: { t: number; realMs: number }): Promise<ReviewAnswer | null> {
    const user = [
      `It's Monday evening, and you look over the rents of the houses you let. ${b.free === 0 ? 'No house stands free' : `${b.free} house${b.free === 1 ? ' stands' : 's stand'} free`}, and ${b.offers === 0 ? 'nobody is waiting' : `${b.offers} ${b.offers === 1 ? 'person is' : 'people are'} waiting`} on an offer for one.`,
      ...b.lets.map((l) => `House ${l.n}: ${l.name} pays ${formatMoney(l.rent)} a week${l.owing ? `, and owes ${formatMoney(l.owing)}` : ''}.`),
      "A new rent starts a week from today. A tenant who won't pay a higher rent leaves the house; a lower one they take gladly. A rent can go at most to double, or down to half, at a time. Change any rents you want to, or none.",
    ].join('\n');
    return this.ask(user, at, REVIEW_TOOL);
  }
}
