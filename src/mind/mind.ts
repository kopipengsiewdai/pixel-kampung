import type { Brain, ThinkContext } from '../brain/brain.ts';
import type { Card } from '../seed/cards.ts';
import type { Intent } from '../sim/actions/index.ts';
import { ITEMS, type ItemId } from '../sim/items.ts';
import { latelyLines, type Perception } from '../sim/perception.ts';
import { dayIndex, sgtHour } from '../sim/time.ts';
import { Budget, ESTIMATE, TOWN_DAILY_CAP, type BudgetState } from './budget.ts';
import type { CostLog } from './cost-log.ts';
import { MemoryStore, type MemoryKind } from './memory.ts';
import type { ModelClient, ThinkKind, ThinkResponse, Tier } from './model.ts';
import { systemPrompt, userPrompt } from './prompt.ts';
import { DO_TOOL, toIntent } from './tools.ts';

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
  readonly townCap: number;
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
    this.townCap = opts.townCap ?? TOWN_DAILY_CAP;
    this.onError = opts.onError ?? (() => {});
  }

  brainFor(residentId: string, name: string, role: 'owner' | 'seeker', shop: string | null, t: number): MindBrain {
    const card = this.cards.find((c) => c.name === name) ?? { name, age: 30, personality: 'Ordinary.', want: 'a decent life', worry: 'about hard times', knows: '' };
    return new MindBrain(this, residentId, systemPrompt(card, role, shop), t);
  }

  observe = (residentId: string, t: number, text: string): void => {
    this.memory.add(residentId, t, 'noticed', text);
  };

  /** True once the town has spent its daily cap (per real day); announces the quiet once. */
  townSpent(realMs: number, emit: ThinkContext['emit']): boolean {
    const day = this.costs.dayKey(realMs);
    if (this.costs.spentOn(day) < this.townCap) return false;
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

interface MindState {
  budget: BudgetState;
  planDay: number | null;
  plan: string | null;
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

  constructor(mind: Mind, id: string, system: string, t: number) {
    this.mind = mind;
    this.id = id;
    this.system = system;
    this.budget = new Budget(t);
    this.s = { budget: this.budget.save(), planDay: null, plan: null, businessDay: null, businessCalls: 0, reflectedDay: null };
  }

  save(): unknown {
    return { ...this.s, budget: this.budget.save(), model: this.mind.client.saveFor?.(this.id) };
  }

  load(saved: unknown): void {
    // A save from a fake-brain town carries no mind state: start fresh.
    if (!saved || typeof saved !== 'object' || !('budget' in saved)) return;
    const s = saved as MindState;
    this.s = { ...s };
    this.budget = Budget.load(s.budget);
    if (s.model !== undefined) this.mind.client.loadFor?.(this.id, s.model);
  }

  async decide(p: Perception, ctx: ThinkContext): Promise<Intent | null> {
    this.mind.fadeOnceADay(ctx.t);
    if (p.reply) this.remember(ctx.t, 'did', p.reply);
    const today = dayIndex(ctx.t);
    if (this.s.planDay !== today && sgtHour(ctx.t) >= 6) {
      this.s.planDay = today;
      const res = await this.call('plan', 'big', p, ctx);
      if (res?.text) {
        this.s.plan = res.text;
        this.remember(ctx.t, 'plan', `My plan for today: ${res.text}`);
      }
    }
    const kind = this.businessMoment(p, today) ? 'business' : 'act';
    const res = await this.call(kind, kind === 'business' ? 'big' : 'routine', p, ctx);
    if (!res) return needsOnly(p);
    if (res.text) this.remember(ctx.t, 'thought', res.text);
    return res.toolCall?.name === 'do' ? toIntent(res.toolCall.input) : null;
  }

  async reflect(p: Perception, ctx: ThinkContext): Promise<void> {
    const today = dayIndex(ctx.t);
    if (this.s.reflectedDay === today) return;
    this.s.reflectedDay = today;
    const res = await this.call('reflect', 'big', p, ctx);
    if (res?.text) this.remember(ctx.t, 'reflection', res.text);
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

  /** One model call within budget; null if the resident can't think right now. */
  private async call(kind: ThinkKind, tier: Tier, p: Perception, ctx: ThinkContext): Promise<ThinkResponse | null> {
    this.budget.refill(ctx.t);
    if (!this.budget.canSpend(ESTIMATE[tier]) || this.mind.townSpent(ctx.realMs, ctx.emit)) return null;
    const cue = [p.place, ...p.people.map((x) => x.name), ...p.recent.slice(-3), p.reply ?? ''].join(' ');
    // Leave out only what the notes already show, so older things heard can still come back.
    const seen = new Set([...latelyLines(p), ...p.talk]);
    const memories = this.mind.memory.recall(this.id, ctx.t, cue, 16)
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
