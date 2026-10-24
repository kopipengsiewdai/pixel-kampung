import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ThinkRequest, ThinkResponse, Tier } from './model.ts';

export const MODELS: Record<Tier, string> = {
  routine: 'claude-haiku-5-5',
  big: 'claude-sonnet-5-5',
};

/** Thinking effort per kind of think: routine moves stay light. */
const EFFORT = { act: 'low', business: 'medium', plan: 'medium', reflect: 'medium' } as const;
const MAX_TOKENS = { act: 2048, business: 4096, plan: 4096, reflect: 4096 } as const;

export interface AnthropicModelOptions {
  apiKey: string;
  /** Tests pass a stub; production uses the platform fetch. */
  fetch?: typeof fetch;
  maxRetries?: number;
}

/**
 * Real model calls through the official SDK. One user turn per think; the
 * `do` tool and the resident's card form a cached prefix. Throws on API or
 * network failure: the caller treats that as "can't think right now".
 */
export class AnthropicModel implements ModelClient {
  private client: Anthropic;

  constructor(opts: AnthropicModelOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      // No automatic retries: a timed-out request may still be billed, and the
      // resident simply tries again at their next moment.
      maxRetries: opts.maxRetries ?? 0,
      timeout: 300_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  async think(req: ThinkRequest): Promise<ThinkResponse> {
    const params = {
      model: MODELS[req.tier],
      max_tokens: MAX_TOKENS[req.kind],
      system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
      tools: req.tools,
      tool_choice: { type: 'auto' as const },
      output_config: { effort: EFFORT[req.kind] },
      messages: [{ role: 'user' as const, content: req.user }],
    };
    // Big-tier calls opt into server-side fallbacks: a refused plan is retried on another model
    // inside the same call. Its cost is logged at the model that actually answered.
    const msg = req.tier === 'big'
      ? await this.client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await this.client.messages.create(params);
    const refused = msg.stop_reason === 'refusal';
    let text = '';
    let toolCall: ThinkResponse['toolCall'] = null;
    if (!refused) {
      for (const block of msg.content) {
        if (block.type === 'text') text += (text ? '\n' : '') + block.text;
        else if (block.type === 'tool_use' && !toolCall) toolCall = { name: block.name, input: block.input };
      }
    }
    const usage = {
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
    };
    // A fallback call bills every attempt (a declined one too); top-level usage covers only the last.
    const iterations = 'iterations' in msg.usage ? msg.usage.iterations : null;
    const attempts = Array.isArray(iterations) && iterations.length
      ? iterations.map((it) => ({
        model: ('model' in it && it.model) || msg.model,
        usage: {
          input_tokens: it.input_tokens, output_tokens: it.output_tokens,
          cache_read_input_tokens: it.cache_read_input_tokens ?? 0, cache_creation_input_tokens: it.cache_creation_input_tokens ?? 0,
        },
      }))
      : [{ model: msg.model, usage }];
    return { model: msg.model, text: text.trim(), toolCall, refused, usage, attempts };
  }
}
