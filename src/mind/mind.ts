import type { Brain, ThinkContext } from '../brain/brain.ts';
import type { Card } from '../seed/cards.ts';
import type { Intent } from '../sim/actions/index.ts';
import { ITEMS, type ItemId } from '../sim/items.ts';
import { latelyLines, type Perception } from '../sim/perception.ts';
import type { Role } from '../sim/state.ts';
import { dayIndex, sgtHour } from '../sim/time.ts';
import { Budget, dayCap, ESTIMATE, type BudgetState } from './budget.ts';
import type { CostLog } from './cost-log.ts';
import { MemoryStore, type MemoryKind } from './memory.ts';
import type { ModelClient, ThinkKind, ThinkResponse, Tier } from './model.ts';
import { systemPrompt, userPrompt } from './prompt.ts';
import { DO_TOOL, toIntent } from './tools.ts';
import { looksForeign } from '../watch/foreign.ts';

/** Owners get the bigger model for at most this many business moments a day (spec §5). */
export const BUSINESS_CALLS_PER_DAY = 3;
const HUNGRY = new Set(['hungry', 'very hungry', 'starving']);

export interface MindOptions {
  client: ModelClient;
  memory: MemoryStore;
  costs: CostLog;
  cards: readonly Card[];
  /** Town daily cap in dollars (spec §5: $3.33). */
  townCap?: number;
  /** Told about every failed call (never given the key). */
  onError?: (err: unknown) => void;
}

/** Everything the residents' minds share: the model, memories, the cost log and the town's cap. */
export class Mind {
  readonly client: ModelClient;
  readonly memory: MemoryStore;
  readonly costs: CostLog;
  readonly cards: readonly Card[];
  /** A fixed cap (trials and tests); null for the month's share (dayCap). */
  readonly townCap: number | null;
  readonly onError: (err: unknown) => void;
  private quietDay: string | null = null;
  private fadedDay: number | null = null;
  /** Each call's prompts, for tests and audits (never persisted). */
  readonly sent: { kind: ThinkKind; system: string; user: string }[] = [];
  keepSent = false;

  constructor(opts: MindOptions) {
    this.client = opts.client;
    this.memory = opts.memory;
    this.costs = opts.costs;
    this.cards = opts.cards;
    this.townCap = opts.townCap ?? null;
    this.onError = opts.onError ?? (() => {});
  }

  /** allowance: their share of the hourly thinking allowance (1 is a full one). */
  brainFor(residentId: string, name: string, role: Role, shop: string | null, t: number, allowance = 1, age?: number): MindBrain {
    const card = this.cards.find((c) => c.name === name) ?? { name, age: 30, personality: 'Ordinary.', want: 'a decent life', worry: 'about hard times', knows: '', languages: '' };
    return new MindBrain(this, residentId, systemPrompt(card, role, shop, age ?? card.age), t, allowance);
  }

  observe = (residentId: string, t: number, text: string): void => {
    this.memory.add(residentId, t, 'noticed', text);
  };

  /** True once the town has spent its daily cap (per real day); announces the quiet once. */
  townSpent(realMs: number, emit: ThinkContext['emit']): boolean {
    const day = this.costs.dayKey(realMs);
    if (this.costs.spentOn(day) < (this.townCap ?? dayCap(this.costs, realMs))) return false;
    if (this.quietDay !== day) {
      this.quietDay = day;
      emit({ type: 'kampung_quiet' });
    }
    return true;
  }

  fadeOnceADay(t: number): void {
    const d = dayIndex(t);
    if (this.fadedDay === d) return;
    this.fadedDay = d;
    this.memory.fade(t);
  }
}

/** A thought with any echo of the instruction to think in English taken off its front. */
export function cleanThought(text: string): string {
  return text.replace(/^\s*[*_(]*\s*(?:think(?:ing)? to (?:myself|yourself))\s*[:)]*\s*[*_)]*\s*:?\s*/i, '').trim();
}

/** Their own thoughts, plans and reflections that aren't in English (from before they thought in English) don't come back to mind; things heard do. */
export function englishOwnWords<T extends { kind: string; text: string }>(memories: readonly T[]): T[] {
  return memories.filter((m) => !['thought', 'plan', 'reflection'].includes(m.kind) || !looksForeign(m.text.replace(/^My plan for today:\s*/, '')));
}

/** Thoughts in a row that come to nothing before today's plan is let go. */
export const PLAN_MISSES = 3;

interface MindState {
  budget: BudgetState;
  planDay: number | null;
  plan: string | null;
  /** Thoughts in a row whose last try came to nothing, while today's plan stands. */
  planMisses: number;
  businessDay: number | null;
  businessCalls: number;
  reflectedDay: number | null;
  model?: unknown;
}

/**
 * A resident driven by a model (M2). Routine moments go to the cheap model;
 * the morning plan, the evening reflection and owners' business moments go to
 * the bigger one. Spending is checked first; with no budget (or no model),
 * the resident rests, eating only food they carry when hungry.
 */
export class MindBrain implements Brain {
  private readonly mind: Mind;
  private readonly id: string;
  private readonly system: string;
  private s: MindState;
  private budget: Budget;

  /** Their share of the hourly thinking allowance. */
  readonly allowance: number;

  constructor(mind: Mind, id: string, system: string, t: number, allowance = 1) {
    this.mind = mind;
    this.id = id;
    this.system = system;
    this.allowance = allowance;
    this.budget = new Budget(t, undefined, allowance);
    this.s = { budget: this.budget.save(), planDay: null, plan: null, planMisses: 0, businessDay: null, businessCalls: 0, reflectedDay: null };
  }

  save(): unknown {
    return { ...this.s, budget: this.budget.save(), model: this.mind.client.saveFor?.(this.id) };
  }

  load(saved: unknown): void {
    // A save from a fake-brain town carries no mind state: start fresh.
    if (!saved || typeof saved !== 'object' || !('budget' in saved)) return;
    const s = saved as MindState;
    this.s = { ...s, planMisses: s.planMisses ?? 0 };
    this.budget = Budget.load(s.budget, this.allowance);
    if (s.model !== undefined) this.mind.client.loadFor?.(this.id, s.model);
  }

  async decide(p: Perception, ctx: ThinkContext): Promise<Intent | null> {
    this.mind.fadeOnceADay(ctx.t);
    if (p.reply) this.remember(ctx.t, 'did', p.reply);
    const today = dayIndex(ctx.t);
    // A plan they can't afford yet waits for the thinking money, later the same day.
    if (this.s.planDay !== today && sgtHour(ctx.t) >= 6 && this.canThink('big', ctx)) {
      this.s.planDay = today;
      const res = await this.call('plan', 'big', p, ctx);
      if (res?.text) {
        this.s.plan = cleanThought(res.text);
        this.s.planMisses = 0;
        this.remember(ctx.t, 'plan', `My plan for today: ${this.s.plan}`);
      }
    }
    // A plan that keeps coming to nothing has plainly failed: it isn't brought up again today.
    if (this.s.plan && p.reply) {
      this.s.planMisses = p.refused ? this.s.planMisses + 1 : 0;
      if (this.s.planMisses >= PLAN_MISSES) {
        this.s.plan = null;
        this.s.planMisses = 0;
      }
    }
    const kind = this.canThink('big', ctx) && this.businessMoment(p, today) ? 'business' : 'act';
    const res = await this.call(kind, kind === 'business' ? 'big' : 'routine', p, ctx);
    if (!res) return needsOnly(p);
    if (res.text && cleanThought(res.text)) this.remember(ctx.t, 'thought', cleanThought(res.text));
    return res.toolCall?.name === 'do' ? toIntent(res.toolCall.input) : null;
  }

  async reflect(p: Perception, ctx: ThinkContext): Promise<void> {
    const today = dayIndex(ctx.t);
    if (this.s.reflectedDay === today || !this.canThink('big', ctx)) return;
    this.s.reflectedDay = today;
    const res = await this.call('reflect', 'big', p, ctx);
    if (res?.text) this.remember(ctx.t, 'reflection', cleanThought(res.text));
  }

  private remember(t: number, kind: MemoryKind, text: string): void {
    this.mind.memory.add(this.id, t, kind, text);
  }

  /** Owners' big calls: opening up for the day, or meeting the lorry. At most three a day. */
  private businessMoment(p: Perception, today: number): boolean {
    if (!p.business) return false;
    if (this.s.businessDay !== today) {
      this.s.businessDay = today;
      this.s.businessCalls = 0;
    }
    if (this.s.businessCalls >= BUSINESS_CALLS_PER_DAY) return false;
    const atLorry = p.lorry?.here === true;
    const opening = p.business.atShop && this.s.businessCalls === 0;
    if (!atLorry && !opening) return false;
    this.s.businessCalls++;
    return true;
  }

  /** Whether a think of this tier is within the resident's money and the town's cap right now. */
  private canThink(tier: Tier, ctx: ThinkContext): boolean {
    this.budget.refill(ctx.t);
    return this.budget.canSpend(ESTIMATE[tier]) && !this.mind.townSpent(ctx.realMs, ctx.emit);
  }

  /** One model call within budget; null if the resident can't think right now. */
  private async call(kind: ThinkKind, tier: Tier, p: Perception, ctx: ThinkContext): Promise<ThinkResponse | null> {
    this.budget.refill(ctx.t);
    if (!this.budget.canSpend(ESTIMATE[tier]) || this.mind.townSpent(ctx.realMs, ctx.emit)) return null;
    const cue = [p.place, ...p.people.map((x) => x.name), ...p.recent.slice(-3), p.reply ?? ''].join(' ');
    // Leave out only what the notes already show, so older things heard can still come back.
    const seen = new Set([...latelyLines(p), ...p.talk]);
    const memories = englishOwnWords(this.mind.memory.recall(this.id, ctx.t, cue, 16))
      .filter((m, i, all) => !seen.has(m.text) && all.findIndex((x) => x.text === m.text) === i)
      .slice(-8);
    const user = userPrompt(kind, p, memories, this.s.plan);
    if (this.mind.keepSent) this.mind.sent.push({ kind, system: this.system, user });
    let res: ThinkResponse;
    try {
      res = await this.mind.client.think({
        tier, kind, residentId: this.id, t: ctx.t, system: this.system, user,
        // The same tool on every call, even plans, so the cached prefix is identical.
        tools: [DO_TOOL],
        hint: p,
      });
    } catch (err) {
      // Unreachable, overloaded or timed out: rest and try again later. A timed-out
      // request may still be billed, so its estimate is charged and logged to be safe.
      this.mind.onError(err);
      const usd = this.mind.costs.add({
        t: ctx.t, realMs: ctx.realMs, resident: this.id, kind, model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: ESTIMATE[tier],
      });
      this.budget.spend(usd);
      return null;
    }
    for (const a of res.attempts) {
      this.budget.spend(this.mind.costs.add({ t: ctx.t, realMs: ctx.realMs, resident: this.id, kind, model: a.model, usage: a.usage }));
    }
    return res.refused ? null : res;
  }
}

/** With no thinking to spare: rest, but eat food you're carrying when hungry (M2 decision 7). */
export function needsOnly(p: Perception): Intent | null {
  if (!HUNGRY.has(p.hunger)) return null;
  const food = p.carrying
    .filter((c) => ITEMS[c.item].food)
    .sort((a, b) => (ITEMS[b.item].food!.hunger) - (ITEMS[a.item].food!.hunger));
  return food[0] ? { verb: 'eat', item: food[0].item as ItemId } : null;
}
