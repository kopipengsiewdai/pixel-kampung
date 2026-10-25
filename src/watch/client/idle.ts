/**
 * Idle life on the watch page: what a resident waiting between thoughts looks
 * like, so nobody stands frozen. Purely visual, owner's view only: it never
 * changes the town, the save or what anyone perceives. No Phaser here, so it
 * can be tested on its own.
 */
import type { ResidentView } from '../types.ts';

export type IdleKind = 'none' | 'sit' | 'sweep' | 'fish' | 'wander' | 'look';

/** Facing, as the sprite sheet's columns have it. */
export const DOWN = 0;
export const UP = 1;
export const LEFT = 2;
export const RIGHT = 3;

export interface IdlePose {
  /** Pixels from where they really stand. */
  dx: number;
  dy: number;
  /** Which way to face, or null to keep facing as they were. */
  facing: number | null;
  /** True while they're taking steps (walk frames). */
  stepping: boolean;
}

/** What they'd be doing while they wait, from what they're up to and where. */
export function idleKindOf(r: ResidentView, placeKind: string | null): IdleKind {
  if (r.activity === 'walking' || r.activity === 'sleeping') return 'none';
  if (r.activity === 'fishing') return 'fish';
  if (r.activity === 'working' || r.doing === 'minding the shop') return 'sweep';
  if (placeKind === 'kopitiam') return 'sit';
  if (placeKind === 'house') return 'look';
  return 'wander';
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h ^ (h >>> 16);
}

const STILL: IdlePose = { dx: 0, dy: 0, facing: null, stepping: false };

/** Where and how to draw someone idling, `ms` into the page's clock; `seed` keeps people out of step. */
export function idlePose(kind: IdleKind, ms: number, seed: number): IdlePose {
  const t = ms + seed * 977;
  switch (kind) {
    case 'sit': {
      // Sat at a table (drawn a little lower), turning now and then to whoever's about.
      const k = Math.floor(t / 4000);
      return { dx: 0, dy: 3, facing: [DOWN, LEFT, DOWN, RIGHT][hash(k, seed) % 4]!, stepping: false };
    }
    case 'look': {
      const k = Math.floor(t / 3000);
      return { dx: 0, dy: 0, facing: [DOWN, LEFT, RIGHT, DOWN, UP][hash(k, seed) % 5]!, stepping: false };
    }
    case 'sweep': {
      // A little to and fro in front of the counter.
      const dx = Math.round(2.5 * Math.sin(t / 450));
      return { dx, dy: 0, facing: Math.cos(t / 450) >= 0 ? RIGHT : LEFT, stepping: true };
    }
    case 'fish': {
      // Facing the water; now and then a tug on the line.
      const phase = (t % 2600) / 2600;
      return { dx: 0, dy: phase < 0.12 ? 1 : 0, facing: DOWN, stepping: false };
    }
    case 'wander': {
      // Every few seconds, a stroll of a tile or so one way, a look about, and back.
      const period = 9000 + (seed % 5) * 700;
      const k = Math.floor(t / period);
      const phase = (t % period) / period;
      const h = hash(k, seed);
      const dir = h % 2 ? 1 : -1;
      const dist = (h % 3 === 0 ? 1.4 : 0.7) * 16;
      if (phase < 0.2) return { dx: Math.round(dir * dist * (phase / 0.2)), dy: 0, facing: dir > 0 ? RIGHT : LEFT, stepping: true };
      if (phase < 0.5) return { dx: Math.round(dir * dist), dy: 0, facing: [DOWN, UP, dir > 0 ? RIGHT : LEFT][h % 3]!, stepping: false };
      if (phase < 0.7) return { dx: Math.round(dir * dist * (1 - (phase - 0.5) / 0.2)), dy: 0, facing: dir > 0 ? LEFT : RIGHT, stepping: true };
      return { dx: 0, dy: 0, facing: DOWN, stepping: false };
    }
    default:
      return STILL;
  }
}

/** Speech bubbles stay short: the first few words of a long line. */
export function bubbleText(text: string, max = 40): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const words = cut.lastIndexOf(' ') > max / 2 ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  return `${words.replace(/[\s,.;:!?-]+$/, '')}…`;
}
