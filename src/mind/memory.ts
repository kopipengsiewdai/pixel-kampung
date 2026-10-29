import { LEVEL_UP_LINES } from '../sim/skills.ts';
import { newestOfEach } from '../sim/talk.ts';

/** Passing thoughts recalled at most (the newest). */
export const THOUGHTS_RECALLED = 2;
/** "Mei Ling says to Mdm Tan: ...": a line between two others. */
const OVERHEARD = /^(?!You )[^"\n]+? says to (?!you:)[^"\n]+?: "/;
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type MemoryKind = 'noticed' | 'did' | 'thought' | 'plan' | 'reflection';

export interface Memory {
  id: number;
  resident: string;
  t: number;
  kind: MemoryKind;
  text: string;
  importance: number;
}

/** Trivial memories (importance at or below this) fade after FADE_DAYS (M2 decision 2). */
export const TRIVIAL = 3;
export const FADE_DAYS = 14;
export const RECALL_COUNT = 8;

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'you', 'your', 'is', 'it', 'at', 'in', 'on', 'for', 'with', 'i', 'me', 'my', 'says', 'some']);

export function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []);
}

/** How much a memory matters, by rule (no AI cost). 1–10. */
export function importanceOf(kind: MemoryKind, text: string): number {
  if (kind === 'reflection') return 8;
  if (kind === 'plan') return 5;
  const s = text.toLowerCase();
  if (/let you go|quit|accepted your job|now work for|offers you work|you no longer work/.test(s)) return 8;
  // A level reached at a skill: a moment in their working life.
  if (LEVEL_UP_LINES.has(text)) return 7;
  if (/wages|still owes|paid you|owe|lend|borrow|\biou\b|pays you back|lets you off/.test(s)) return 7;
  if (/trade|gave you|turned down|^you pin your note|for you\.$|^you water .+'s beds|^you mend .+'s nets/.test(s)) return 6;
  if (kind === 'thought') return 4;
  if (/says to you|^you say/.test(s)) return 5;
  if (/says:|says to/.test(s)) return 3;
  if (kind === 'did' && /^(you can't|you don't|nobody|there's|that's|it's)/.test(s)) return 3;
  return 2;
}

/**
 * Each resident's memory stream (spec §4), in SQLite under KAMPUNG_HOME:
 * what they noticed, did, thought, planned and concluded. Recall scores by
 * recency, importance and word overlap with what's in front of them now.
 */
export class MemoryStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident TEXT NOT NULL,
        t INTEGER NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        importance INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_by_resident ON memories (resident, t);
    `);
  }

  add(resident: string, t: number, kind: MemoryKind, text: string, importance = importanceOf(kind, text)): void {
    this.db.prepare('INSERT INTO memories (resident, t, kind, text, importance) VALUES (?, ?, ?, ?, ?)')
      .run(resident, t, kind, text.slice(0, 600), importance);
  }

  all(resident: string): Memory[] {
    return this.db.prepare('SELECT id, resident, t, kind, text, importance FROM memories WHERE resident = ? ORDER BY t, id')
      .all(resident) as unknown as Memory[];
  }

  /** The newest n memories of these kinds at or before minute upTo, newest first (for the watch page). */
  latest(resident: string, kinds: readonly string[], upTo: number, n: number): Memory[] {
    return this.db
      .prepare(`SELECT id, resident, t, kind, text, importance FROM memories WHERE resident = ? AND t <= ? AND kind IN (${kinds.map(() => '?').join(',')}) ORDER BY t DESC, id DESC LIMIT ?`)
      .all(resident, upTo, ...kinds, n) as unknown as Memory[];
  }

  /** The replies every resident was given from game minute `from` up to `to` (the paper's box counts refusals). */
  didBetween(from: number, to: number): { resident: string; text: string }[] {
    return this.db.prepare("SELECT resident, text FROM memories WHERE kind = 'did' AND t >= ? AND t < ? ORDER BY t, id")
      .all(from, to) as unknown as { resident: string; text: string }[];
  }

  since(resident: string, t: number): Memory[] {
    return this.all(resident).filter((m) => m.t >= t);
  }

  /** The few memories most worth having in mind right now, oldest first. */
  recall(resident: string, now: number, cue: string, k = RECALL_COUNT): Memory[] {
    const cueWords = words(cue);
    // Who was nearby then isn't who is nearby now: those lines aren't recalled.
    // A line said over and over is one memory, the newest: repeats crowded out everything else.
    const all = newestOfEach(this.all(resident)
      .map((m) => ({ ...m, text: m.text.split('\n').filter((l) => !/^\s*Nearby:/.test(l)).join('\n').trim() }))
      .filter((m) => m.text), (m) => m.text, (m) => m.importance >= 6);
    // Passing thoughts, only the newest few: fed back each time, one idea chewed over filled the mind.
    const thoughts = all.filter((m) => m.kind === 'thought').slice(-THOUGHTS_RECALLED);
    // Talk between two others was only overheard: it was never theirs to keep (older saves kept it).
    const kept = all.filter((m) => (m.kind !== 'thought' || thoughts.includes(m)) && !OVERHEARD.test(m.text));
    const scored = kept.map((m) => {
      const hours = Math.max(0, now - m.t) / 60;
      const recency = Math.pow(0.99, hours);
      const mw = words(m.text);
      let overlap = 0;
      for (const w of mw) if (cueWords.has(w)) overlap++;
      const relevance = mw.size ? Math.min(1, overlap / Math.sqrt(mw.size)) : 0;
      return { m, score: recency + m.importance / 10 + relevance };
    });
    scored.sort((a, b) => b.score - a.score || b.m.t - a.m.t || b.m.id - a.m.id);
    return scored.slice(0, k).map((s) => s.m).sort((a, b) => a.t - b.t || a.id - b.id);
  }

  /** Lets trivial memories older than two weeks go. Returns how many faded. */
  fade(now: number): number {
    const res = this.db.prepare('DELETE FROM memories WHERE importance <= ? AND t < ?').run(TRIVIAL, now - FADE_DAYS * 1440);
    return Number(res.changes);
  }

  close(): void {
    this.db.close();
  }
}
