/**
 * The playback clock for a replay: where in the recording we are, how fast
 * it plays (game minutes per real minute) and whether it's paused.
 */
export const MAX_SPEED = 10_000;

function checkSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0 || speed > MAX_SPEED) throw new Error(`speed must be between 0 and ${MAX_SPEED}`);
  return speed;
}

export class ReplayPlayer {
  private start: number;
  private end: number;
  private now: () => number;
  private speed: number;
  private paused = false;
  /** Position (a fractional game minute) at the anchor time. */
  private pos: number;
  private anchorMs: number;
  private shown: number;

  constructor(range: { start: number; end: number }, opts: { now?: () => number; speed?: number } = {}) {
    this.start = range.start;
    this.end = Math.max(range.start, range.end);
    this.now = opts.now ?? Date.now;
    this.speed = checkSpeed(opts.speed ?? 60);
    this.pos = this.start;
    this.anchorMs = this.now();
    this.shown = this.start;
  }

  private position(): number {
    if (this.paused) return this.pos;
    return Math.min(this.end, this.pos + ((this.now() - this.anchorMs) / 60_000) * this.speed);
  }

  private reanchor(pos: number): void {
    this.pos = pos;
    this.anchorMs = this.now();
  }

  state(): { t: number; speed: number; paused: boolean; start: number; end: number } {
    return { t: this.shown, speed: this.speed, paused: this.paused, start: this.start, end: this.end };
  }

  /** Moves the clock on. Returns the minutes passed since the last tick, or null if still on the same one. */
  tick(): { from: number; to: number } | null {
    const p = this.position();
    if (p >= this.end && !this.paused) {
      this.reanchor(this.end);
      this.paused = true;
    }
    const t = Math.floor(p);
    if (t === this.shown) return null;
    const from = this.shown;
    this.shown = t;
    return { from, to: t };
  }

  setSpeed(speed: number): void {
    checkSpeed(speed);
    this.reanchor(this.position());
    this.speed = speed;
  }

  pause(): void {
    if (this.paused) return;
    this.reanchor(this.position());
    this.paused = true;
  }

  /** Plays on; from the very end, starts again at the beginning. */
  play(): void {
    if (!this.paused) return;
    if (this.position() >= this.end) {
      this.reanchor(this.start);
      this.shown = this.start;
    } else this.reanchor(this.pos);
    this.paused = false;
  }

  seek(t: number): void {
    const to = Math.max(this.start, Math.min(this.end, Math.floor(t)));
    this.reanchor(to);
    this.shown = to;
  }

  /** The recording grew (a trial still running). */
  extend(end: number): void {
    if (end <= this.end) return;
    const p = this.position();
    this.end = end;
    this.reanchor(p);
  }
}
