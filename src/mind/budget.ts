import { REAL_MS_PER_GAME_MINUTE } from '../sim/time.ts';

/**
 * Spec §5: each resident earns US$0.0139 of thinking a REAL hour (4.8 game
 * hours), saved up while asleep or idle, with a cap. That's a full share: Mak
 * Esah, Aminah and Hassan get half (owner, 2026-10-25; `allowance` in
 * src/seed/cast.ts), and the town's daily cap below holds whatever the shares.
 */
export const HOURLY_ALLOWANCE = 0.0139;
/** About 4 real hours' worth: enough for a plan, a reflection or a run of quick thinks. */
export const BUCKET_CAP = 0.06;
/** Spec §5: past this many dollars in a real day, the whole town rests until real midnight. */
export const TOWN_DAILY_CAP = 3.33;

/**
 * What a think is expected to cost, checked before the call. Kept on the high
 * side: big thinking is Haiku at high effort (about a fifth of a cent a call),
 * not the bigger model the first estimate assumed.
 */
export const ESTIMATE = { routine: 0.0015, big: 0.01 } as const;

export interface BudgetState { level: number; lastT: number }

/** One resident's thinking money: a bucket that fills with real time (counted in game minutes) and empties with each call. */
export class Budget {
  level: number;
  lastT: number;
  /** Their share of the hourly allowance (not saved: it comes from the cast). */
  readonly share: number;

  /** A share holds over short spells too: the bucket, and a fresh one's start, are scaled by it. */
  constructor(t: number, level: number | undefined = undefined, share = 1) {
    this.level = level ?? BUCKET_CAP * share;
    this.lastT = t;
    this.share = share;
  }

  refill(t: number): void {
    if (t > this.lastT) this.level = Math.min(BUCKET_CAP * this.share, this.level + (this.share * HOURLY_ALLOWANCE * (t - this.lastT) * REAL_MS_PER_GAME_MINUTE) / 3_600_000);
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

  static load(s: BudgetState, share = 1): Budget {
    return new Budget(s.lastT, s.level, share);
  }
}
