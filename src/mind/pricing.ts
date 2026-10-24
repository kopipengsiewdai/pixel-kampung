import type { TokenUsage } from './model.ts';

/** US$ per million tokens. Anthropic list prices (cached 2026-10-06); cache writes are 5-minute TTL. */
export interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }

export const PRICES: Record<string, Price> = {
  // Haiku 5.5's rate for prompts up to 100K tokens; kampung prompts are a few thousand.
  'claude-haiku-5-5': { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.20, cacheWrite: 2.5 },
  // Possible server-side fallbacks for a refused big-tier call.
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

const DEAREST: Price = Object.values(PRICES).reduce((a, b) => ({
  input: Math.max(a.input, b.input), output: Math.max(a.output, b.output),
  cacheRead: Math.max(a.cacheRead, b.cacheRead), cacheWrite: Math.max(a.cacheWrite, b.cacheWrite),
}));

/** Dollars for one call. A model we don't know is priced at the dearest rate, so budgets err safe. */
export function costUsd(model: string, u: TokenUsage): number {
  const p = PRICES[model] ?? DEAREST;
  return (u.input_tokens * p.input + u.output_tokens * p.output
    + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000;
}
