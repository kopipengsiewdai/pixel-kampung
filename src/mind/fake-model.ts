import { FakeBrain } from '../brain/fake-brain.ts';
import type { Intent } from '../sim/actions/index.ts';
import type { Perception } from '../sim/perception.ts';
import type { ModelClient, ThinkKind, ThinkRequest, ThinkResponse } from './model.ts';
import { MODELS } from './anthropic-model.ts';
import { fromIntent } from './tools.ts';

/** Rough tokens for a piece of text: about 4 characters a token. */
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CACHE_MINUTES = 5;

/** Deals done only in words, as the living town talked them (for the circles mode). */
const NARRATED = [
  'I put the money on the counter. Count it in front of me.',
  "Here's your 30¢ for the kopi, count it.",
  "You're hired. Come tomorrow at eight.",
  'Deal! Two fish for your bread.',
  'I count it now, every cent. All paid.',
  'Agreed, three bags of rice for you.',
];
const OUTPUT_TOKENS = { act: 60, business: 120, plan: 220, reflect: 320, trader: 60, translate: 400 } as const satisfies Record<ThinkKind, number>;

/**
 * A free stand-in for the model. It decides with the fake-brain policy (from
 * the perception passed as a hint) and reports token counts shaped like the
 * real thing, including cache reads within 5 minutes of the same resident's
 * last call, so budgets and the cost log run for real at $0.
 */
export class FakeModel implements ModelClient {
  private brains = new Map<string, FakeBrain>();
  private lastCall = new Map<string, number>();
  private readonly seed: number;
  private readonly chatty: boolean;
  private readonly circles: boolean;

  /**
   * chatty: always answer whoever last spoke to you, as the residents in paid
   * trial 2 did, so a free trial shows what talk costs.
   */
  constructor(seed: number, opts: { chatty?: boolean; circles?: boolean } = {}) {
    this.seed = seed;
    this.chatty = opts.chatty ?? false;
    this.circles = opts.circles ?? false;
  }

  /** An answer to the last line someone said to you, if they're still here. */
  private answer(p: Perception): Intent | null {
    const who = /^(.+?) says(?: to you)?: "/.exec(p.talk.at(-1) ?? '')?.[1];
    if (!who || !p.people.some((x) => x.name === who && x.doing !== 'asleep')) return null;
    return { verb: 'say', text: 'Morning! Yes, about that deal...', to: who };
  }

  /**
   * circles: talk deals instead of doing them, as the living town did, answering
   * whoever spoke last with a deal narrated in words. Told that the words have
   * nothing behind them, or that the talk goes round in circles, half the time
   * (by seed, minute and resident; nothing saved) it pays 20¢ if it can, or walks off.
   */
  private narrate(p: Perception, id: string, t: number): Intent | null {
    const stuck = p.unbacked[0]?.name ?? p.circles[0];
    if (stuck) {
      let h = (this.seed ^ t) >>> 0;
      for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
      if (h % 2 === 0) return p.money >= 20 ? { verb: 'give', to: stuck, money: 20 } : { verb: 'walk_to', where: 'home' };
    }
    const who = /^(.+?) says(?: to you)?: "/.exec(p.talk.at(-1) ?? '')?.[1];
    if (!who || !p.people.some((x) => x.name === who && x.doing !== 'asleep')) return null;
    return { verb: 'say', text: NARRATED[(t + id.length) % NARRATED.length]!, to: who };
  }

  /** Someone is waiting for your answer: give them one, as a resident told so plainly would. */
  private answerWaiting(p: Perception): Intent | null {
    const who = p.waiting?.[0];
    return who ? { verb: 'say', text: 'Sorry, give me a moment... yes?', to: who } : null;
  }

  private brain(id: string): FakeBrain {
    let b = this.brains.get(id);
    if (!b) {
      let h = this.seed >>> 0;
      for (const c of id) h = (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0);
      b = new FakeBrain(h);
      this.brains.set(id, b);
    }
    return b;
  }

  saveFor(id: string): unknown {
    const lastCall: Record<string, number> = {};
    for (const tier of ['routine', 'big']) {
      const t = this.lastCall.get(`${id}:${tier}`);
      if (t !== undefined) lastCall[tier] = t;
    }
    return { brain: this.brain(id).save(), lastCall };
  }

  loadFor(id: string, saved: unknown): void {
    const s = saved as { brain: unknown; lastCall: Record<string, number> };
    this.brain(id).load(s.brain);
    for (const [tier, t] of Object.entries(s.lastCall)) this.lastCall.set(`${id}:${tier}`, t);
  }

  async think(req: ThinkRequest): Promise<ThinkResponse> {
    const key = `${req.residentId}:${req.tier}`;
    const prefix = roughTokens(req.system) + roughTokens(JSON.stringify(req.tools));
    const last = this.lastCall.get(key);
    const warm = last !== undefined && req.t - last < CACHE_MINUTES;
    this.lastCall.set(key, req.t);
    let text = '';
    let toolCall: ThinkResponse['toolCall'] = null;
    // A village character's call: the hint carries the answer his scripted ways would give, and the fake gives it back.
    if (req.kind === 'trader' || req.kind === 'translate') toolCall = { name: req.tools[0]?.name ?? 'answer', input: (req.hint as { fake?: unknown } | undefined)?.fake ?? {} };
    else if (req.kind === 'plan') text = 'Today: eat, earn a little, see who is about.';
    else if (req.kind === 'reflect') text = 'A long day. I should keep some money aside for tomorrow.';
    else {
      const p = req.hint as Perception;
      const intent = (this.circles ? this.narrate(p, req.residentId, req.t) : null) ?? (this.chatty ? this.answer(p) : null) ?? this.answerWaiting(p) ?? this.brain(req.residentId).decide(p);
      toolCall = { name: 'do', input: intent ? fromIntent(intent) : { action: 'potter about' } };
      // Now and then a passing thought, as a real model would write before acting.
      if (req.kind === 'business' || req.t % 7 === 0) text = intent ? `Better ${intent.verb.replace(/_/g, ' ')}.` : 'Nothing to do just now.';
    }
    const usage = {
      input_tokens: roughTokens(req.user),
      output_tokens: OUTPUT_TOKENS[req.kind],
      cache_read_input_tokens: warm ? prefix : 0,
      cache_creation_input_tokens: warm ? 0 : prefix,
    };
    return { model: MODELS[req.tier], text, toolCall, refused: false, usage, attempts: [{ model: MODELS[req.tier], usage }] };
  }
}
