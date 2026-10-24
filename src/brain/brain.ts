import type { Intent } from '../sim/actions/index.ts';
import type { Perception } from '../sim/perception.ts';

/**
 * What drives a resident. A brain sees only the resident's perception and
 * answers with one thing to try, or null to potter about for a while.
 * The fake brain (M1) is free and deterministic; the real one (M2) calls a model.
 */
export interface Brain {
  decide(p: Perception): Intent | null | Promise<Intent | null>;
  /** Anything the brain needs to carry across a save and a restart. */
  save(): unknown;
  load(saved: unknown): void;
}
