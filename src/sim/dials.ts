import type { Cents } from './money.ts';

/**
 * The owner's dials: limits on money coming into the town from outside, set
 * in the private settings file ($KAMPUNG_HOME/settings.json, see
 * src/config/settings.ts), never saved with the town.
 *
 * These are training wheels (owner, 2026-10-25): the goal is for residents to
 * run their own economy without our guardrails, so each is loosened and in
 * the end removed as real sinks (rent, Pak Osman, festivals) and the
 * residents' own behaviour take over.
 */
export interface Dials {
  /** What travellers from the road spend at one shop in a game day, at most; once spent, no more come that day. */
  travellerBudgetCents: Cents;
}

export const DEFAULT_DIALS: Readonly<Dials> = {
  travellerBudgetCents: 600,
};
