import type { Intent } from '../sim/actions/index.ts';
import type { EventBody } from '../sim/events.ts';
import type { Perception } from '../sim/perception.ts';

/** Harness facts a brain may need that are not part of what the resident perceives. */
export interface ThinkContext {
  t: number;
  residentId: string;
  /** Adds an event to the town's log (e.g. "the kampung is quiet"). */
  emit: (e: EventBody) => void;
}

/**
 * What drives a resident. A brain sees only the resident's perception and
 * answers with one thing to try, or null to potter about for a while.
 * The fake brain (M1) is free and deterministic; the mind brain (M2) calls a model.
 */
export interface Brain {
  decide(p: Perception, ctx: ThinkContext): Intent | null | Promise<Intent | null>;
  /** Called once each evening while the resident is up, to look back on the day. */
  reflect?(p: Perception, ctx: ThinkContext): void | Promise<void>;
  /** Anything the brain needs to carry across a save and a restart. */
  save(): unknown;
  load(saved: unknown): void;
}
