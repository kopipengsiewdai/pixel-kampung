/** Where "now" comes from. Injected so tests and fast sims control time. */
export interface Clock {
  nowMs(): number;
}

export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }
}

export class ManualClock implements Clock {
  private ms: number;

  constructor(ms: number) {
    this.ms = ms;
  }

  nowMs(): number {
    return this.ms;
  }

  set(ms: number): void {
    this.ms = ms;
  }

  advanceMinutes(n: number): void {
    this.ms += n * 60_000;
  }
}
