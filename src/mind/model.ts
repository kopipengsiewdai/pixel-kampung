import type Anthropic from '@anthropic-ai/sdk';

/** Routine thinks and talk run on the cheap model; plans, reflections and owners' big calls on the bigger one. */
export type Tier = 'routine' | 'big';
export type ThinkKind = 'act' | 'business' | 'plan' | 'reflect';

/** Token counts as the API reports them. */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface ThinkRequest {
  tier: Tier;
  kind: ThinkKind;
  residentId: string;
  /** Game minute of the call (the fake model uses it to mimic the 5-minute cache). */
  t: number;
  /** The stable part: who they are. Cached. */
  system: string;
  /** The changing part: what they perceive and remember right now. */
  user: string;
  tools: Anthropic.Tool[];
  /** Free extra context for the fake model only; never sent anywhere. */
  hint?: unknown;
}

export interface ThinkResponse {
  /** The model that actually answered (a fallback may differ from the one asked). */
  model: string;
  text: string;
  toolCall: { name: string; input: unknown } | null;
  usage: TokenUsage;
  refused: boolean;
}

export interface ModelClient {
  think(req: ThinkRequest): Promise<ThinkResponse>;
  /** Per-resident state a deterministic client must carry across a restart. */
  saveFor?(residentId: string): unknown;
  loadFor?(residentId: string, saved: unknown): void;
}
