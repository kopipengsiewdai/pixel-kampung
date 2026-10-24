import { FakeBrain } from '../brain/fake-brain.ts';
import type { Perception } from '../sim/perception.ts';
import type { ModelClient, ThinkRequest, ThinkResponse } from './model.ts';
import { MODELS } from './anthropic-model.ts';
import { fromIntent } from './tools.ts';

/** Rough tokens for a piece of text: about 4 characters a token. */
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CACHE_MINUTES = 5;
const OUTPUT_TOKENS = { act: 60, business: 120, plan: 220, reflect: 320 } as const;

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

  constructor(seed: number) {
    this.seed = seed;
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
    if (req.kind === 'plan') text = 'Today: eat, earn a little, see who is about.';
    else if (req.kind === 'reflect') text = 'A long day. I should keep some money aside for tomorrow.';
    else {
      const intent = this.brain(req.residentId).decide(req.hint as Perception);
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
