import { GAME_SPEED } from '../sim/time.ts';

/**
 * Spec §5: each resident earns US$0.0139 of thinking a REAL hour (four game
 * hours on the 4x clock), saved up while asleep or idle, with a cap.
 */
export const HOURLY_ALLOWANCE = 0.0139;
/** About 4 real hours' worth: enough for a plan, a reflection or a run of quick thinks. */
export const BUCKET_CAP = 0.06;
/** Spec §5: past this many dollars in a real day, the whole town rests until real midnight. */
export const TOWN_DAILY_CAP = 3.33;

/** What a think is expected to cost, checked before the call. Kept on the high side. */
export const ESTIMATE = { routine: 0.0015, big: 0.04 } as const;

export interface BudgetState { level: number; lastT: number }

/** One resident's thinking money: a bucket that fills with real time (counted in game minutes) and empties with each call. */
export class Budget {
  level: number;
  lastT: number;

  constructor(t: number, level = BUCKET_CAP) {
    this.level = level;
    this.lastT = t;
  }

  refill(t: number): void {
    if (t > this.lastT) this.level = Math.min(BUCKET_CAP, this.level + (HOURLY_ALLOWANCE * (t - this.lastT)) / 60 / GAME_SPEED);
    this.lastT = Math.max(this.lastT, t);
  }

  canSpend(usd: number): boolean {
    return this.level >= usd;
  }

  /** Actual cost can run past the estimate; the bucket may dip below zero and refills from there. */
  spend(usd: number): void {
    this.level -= usd;
  }

  save(): BudgetState {
    return { level: this.level, lastT: this.lastT };
  }

  static load(s: BudgetState): Budget {
    return new Budget(s.lastT, s.level);
  }
}
