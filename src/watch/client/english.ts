/**
 * The English button's asking (owner's view only): lines in Malay or another
 * language are asked of the server a small batch at a time. A line the
 * server answers for is kept, as its English or as none. A failed ask (the
 * network, or the server saying no) keeps the lines waiting and tries again,
 * later each time, so a bad moment doesn't leave them untranslated for good.
 */

/** Lines asked for at once: well inside what the server takes. */
export const ASK_BATCH = 20;
/** A moment to gather lines before asking. */
const GATHER_MS = 400;
/** Waits before asking again after a failure, then the last one over and over. */
const RETRY_MS = [1000, 2000, 4000, 8000, 15_000, 30_000];

export type AskEnglish = (texts: string[]) => Promise<(string | null)[]>;

export class EnglishAsker {
  private readonly known = new Map<string, string | null>();
  private readonly waiting = new Set<string>();
  private pending = false;
  private fails = 0;
  private readonly ask: AskEnglish;
  /** Told when some lines have their answer. */
  private readonly answered: () => void;
  private readonly later: (fn: () => void, ms: number) => void;

  constructor(ask: AskEnglish, answered: () => void, later: (fn: () => void, ms: number) => void = (fn, ms) => { setTimeout(fn, ms); }) {
    this.ask = ask;
    this.answered = answered;
    this.later = later;
  }

  /** The English for a line, null if it has none, undefined if not known yet. */
  get(text: string): string | null | undefined {
    return this.known.get(text);
  }

  /** Ask for this line's English, if it isn't known or asked for already. */
  want(text: string): void {
    if (this.known.has(text) || this.waiting.has(text)) return;
    this.waiting.add(text);
    this.soon(GATHER_MS);
  }

  private soon(ms: number): void {
    if (this.pending) return;
    this.pending = true;
    this.later(() => void this.run(), ms);
  }

  private async run(): Promise<void> {
    const texts = [...this.waiting].slice(0, ASK_BATCH);
    let out: unknown = null;
    try {
      out = await this.ask(texts);
    } catch {
      out = null;
    }
    this.pending = false;
    if (!Array.isArray(out)) {
      this.soon(RETRY_MS[Math.min(this.fails++, RETRY_MS.length - 1)]!);
      return;
    }
    this.fails = 0;
    const got = out as unknown[];
    texts.forEach((t, i) => {
      this.waiting.delete(t);
      this.known.set(t, typeof got[i] === 'string' ? got[i] as string : null);
    });
    this.answered();
    if (this.waiting.size) this.soon(GATHER_MS);
  }
}
