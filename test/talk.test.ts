import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import type { Intent } from '../src/sim/actions/index.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive, type Perception } from '../src/sim/perception.ts';
import { TALK_SOFT_LIMIT } from '../src/sim/state.ts';
import { QUIET_THINK_MINUTES, Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, sgt } from './helpers.ts';

/** Always has something to say to their partner, whenever they get to think. */
class Chatterbox implements Brain {
  readonly thoughtAt: number[] = [];
  private readonly partner: string;
  constructor(partner: string) {
    this.partner = partner;
  }
  decide(p: Perception, ctx: { t: number }): Intent | null {
    this.thoughtAt.push(ctx.t);
    return p.people.some((x) => x.name === this.partner) ? { verb: 'say', text: 'Morning! About that deal...', to: this.partner } : null;
  }
  save(): unknown { return null; }
  load(): void {}
}

const idle: Brain = { decide: () => null, save: () => null, load: () => {} };

/** Ah Seng and Raju face each other at the well, each always answering; everyone else stays home. */
function chattyPair() {
  const events: GameEvent[] = [];
  const brains = new Map<string, Chatterbox>();
  const start = sgt(8, 0) - 1;
  const town = Town.create(1, start, {
    onEvent: (e) => events.push(e),
    brains: (r) => {
      if (r.name !== 'Ah Seng' && r.name !== 'Raju') return idle;
      const b = new Chatterbox(r.name === 'Ah Seng' ? 'Raju' : 'Ah Seng');
      brains.set(r.name, b);
      return b;
    },
  });
  const seng = put(town.world, 'Ah Seng', 'well');
  const raju = put(town.world, 'Raju', 'well');
  for (const r of town.world.state.residents) r.thinkAt = start + 100;
  seng.thinkAt = start + 1; // Ah Seng opens; Raju only thinks when spoken to, or later
  raju.thinkAt = start + 3;
  return { town, events, seng: brains.get('Ah Seng')!, raju: brains.get('Raju')!, start };
}

describe('talk does not ping-pong', () => {
  it("a speaker waits for an answer: they don't think again the minute after speaking", async () => {
    const { town, seng, raju, start } = chattyPair();
    await town.runUntil(start + 1);
    expect(seng.thoughtAt).toEqual([start + 1]);
    await town.runUntil(start + 2);
    // Raju was spoken to, so he answers; Ah Seng, who only spoke, does not think again yet.
    expect(raju.thoughtAt).toEqual([start + 2]);
    expect(seng.thoughtAt).toEqual([start + 1]);
    await town.runUntil(start + 3);
    // Raju's answer wakes Ah Seng.
    expect(seng.thoughtAt).toEqual([start + 1, start + 3]);
  });

  it('two people who always answer each other say far fewer lines over an hour', async () => {
    const { town, events, start } = chattyPair();
    await town.runUntil(start + 60);
    const lines = events.filter((e) => e.type === 'said').length;
    // Before: a line from each, every minute (about 120 an hour).
    // Now: line by line up to the soft limit, then the quiet pace.
    expect(lines).toBeGreaterThan(TALK_SOFT_LIMIT);
    expect(lines).toBeLessThanOrEqual(TALK_SOFT_LIMIT + 2 * Math.ceil(60 / QUIET_THINK_MINUTES));
  });

  it('after the chat has run long, both still speak at the quiet pace', async () => {
    const { town, seng, raju, start } = chattyPair();
    await town.runUntil(start + 60);
    for (const b of [seng, raju]) {
      const late = b.thoughtAt.filter((t) => t > start + 30);
      for (let i = 1; i < late.length; i++) expect(late[i]! - late[i - 1]!).toBe(QUIET_THINK_MINUTES);
      expect(late.length).toBeGreaterThan(0);
    }
  });
});

describe('what a resident hears of their own conversation', () => {
  it("a speaker remembers what they said, and sees the talk so far, oldest first", () => {
    const w = newWorld();
    const seng = put(w, 'Ah Seng', 'well');
    const raju = put(w, 'Raju', 'well');
    accepted(act(w, seng.id, { verb: 'say', text: 'Morning, Raju!', to: 'Raju' }));
    w.state.t++;
    accepted(act(w, raju.id, { verb: 'say', text: 'Morning! Fish for rice?', to: 'Ah Seng' }));
    w.state.t++;
    accepted(act(w, seng.id, { verb: 'say', text: 'Deal.' }));
    const p = perceive(w, seng);
    expect(p.talk).toEqual([
      'You say to Raju: "Morning, Raju!"',
      'Raju says to you: "Morning! Fish for rice?"',
      'You say: "Deal."',
    ]);
    const text = describePerception(p);
    expect(text).toContain('The talk so far:\n- You say to Raju: "Morning, Raju!"');
    expectInWorld(text);
    // Shown once, under the talk, not again under "Lately".
    expect(text.split('Morning, Raju!').length).toBe(2);
    expect(perceive(w, raju).talk).toEqual([
      'Ah Seng says to you: "Morning, Raju!"',
      'You say to Ah Seng: "Morning! Fish for rice?"',
      'Ah Seng says: "Deal."',
    ]);
  });

  it('talk overheard between others is not your conversation, and old talk falls away', () => {
    const w = newWorld();
    const seng = put(w, 'Ah Seng', 'well');
    put(w, 'Raju', 'well');
    const siti = put(w, 'Siti', 'well');
    accepted(act(w, seng.id, { verb: 'say', text: 'Fish for rice?', to: 'Raju' }));
    expect(perceive(w, siti).talk).toEqual([]);
    expect(perceive(w, siti).recent.at(-1)).toMatch(/Ah Seng says to Raju/);
    w.state.t += 31;
    expect(perceive(w, seng).talk).toEqual([]);
    expect(describePerception(perceive(w, seng))).toContain('You say to Raju: "Fish for rice?"');
  });
});
