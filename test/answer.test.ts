import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import type { Intent } from '../src/sim/actions/index.ts';
import { describe as describePerception, perceive, type Perception } from '../src/sim/perception.ts';
import { TALK_SOFT_LIMIT, talkKey } from '../src/sim/state.ts';
import { AFTER_ACTION_MINUTES, QUIET_THINK_MINUTES, REPEAT_MINUTES, Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, sgt, who } from './helpers.ts';

/** Does the same thing every time it gets to think. */
class Repeater implements Brain {
  readonly thoughtAt: number[] = [];
  readonly replies: (string | undefined)[] = [];
  private readonly intent: Intent;
  constructor(intent: Intent) {
    this.intent = intent;
  }
  decide(p: Perception, ctx: { t: number }): Intent | null {
    this.thoughtAt.push(ctx.t);
    this.replies.push(p.reply);
    return this.intent;
  }
  save(): unknown { return null; }
  load(): void {}
}

const idle: Brain = { decide: () => null, save: () => null, load: () => {} };

function townWith(name: string, brain: Brain, place: string) {
  const start = sgt(8, 0) - 1;
  const town = Town.create(1, start, { brains: (r) => (r.name === name ? brain : idle) });
  put(town.world, name, place);
  for (const r of town.world.state.residents) r.thinkAt = start + 100;
  who(town.world, name).thinkAt = start + 1;
  return { town, start };
}

describe('doing the same thing over and over', () => {
  it("doing again what you've just done doesn't bring the next thought on", async () => {
    const brain = new Repeater({ verb: 'look_around' });
    const { town, start } = townWith('Siti', brain, 'well');
    const a = start + 1 + AFTER_ACTION_MINUTES;
    await town.runUntil(a + 2 * QUIET_THINK_MINUTES);
    // The first look brings the next thought on; the same thing again doesn't, so after that only the quiet pace.
    expect(brain.thoughtAt).toEqual([start + 1, a, a + QUIET_THINK_MINUTES, a + 2 * QUIET_THINK_MINUTES]);
  });

  it('they hear, in plain words, that they have just done that', async () => {
    const brain = new Repeater({ verb: 'look_around' });
    const { town, start } = townWith('Siti', brain, 'well');
    await town.runUntil(start + 1 + AFTER_ACTION_MINUTES + QUIET_THINK_MINUTES);
    const nudge = brain.replies.at(-1)!;
    expect(nudge).toMatch(/just done that/);
    expectInWorld(nudge);
    expect(brain.replies[1] ?? '').not.toMatch(/just done that/);
  });

  it('the same thing done again after a while brings the next thought on as usual', async () => {
    const script: (Intent | null)[] = [{ verb: 'look_around' }, null, { verb: 'look_around' }, null];
    const thoughtAt: number[] = [];
    const brain: Brain = { decide: (_p, ctx) => { thoughtAt.push(ctx.t); return script.shift() ?? null; }, save: () => null, load: () => {} };
    const { town, start } = townWith('Siti', brain, 'well');
    const a = start + 1 + AFTER_ACTION_MINUTES;
    await town.runUntil(a + QUIET_THINK_MINUTES + AFTER_ACTION_MINUTES);
    // Looked first, did nothing next; looking again a quiet spell later is more than REPEAT_MINUTES after the first, so it counts afresh.
    expect(REPEAT_MINUTES).toBeLessThan(QUIET_THINK_MINUTES + AFTER_ACTION_MINUTES);
    expect(thoughtAt).toEqual([start + 1, a, a + QUIET_THINK_MINUTES, a + QUIET_THINK_MINUTES + AFTER_ACTION_MINUTES]);
  });
});

describe('someone is waiting for your answer', () => {
  function spokenTo() {
    const w = newWorld(9);
    put(w, 'Ah Kow', 'provision-shop');
    put(w, 'Mdm Tan', 'provision-shop');
    accepted(act(w, who(w, 'Ah Kow').id, { verb: 'say', text: 'Any work going?', to: 'Mdm Tan' }));
    return w;
  }
  const waiting = (w: ReturnType<typeof newWorld>, name: string) => perceive(w, who(w, name)).waiting;

  it('the one spoken to sees that they are being waited on, in plain words', () => {
    const w = spokenTo();
    expect(waiting(w, 'Mdm Tan')).toEqual(['Ah Kow']);
    const text = describePerception(perceive(w, who(w, 'Mdm Tan')));
    expect(text).toContain('Ah Kow is waiting for your answer.');
    expectInWorld('Ah Kow is waiting for your answer.');
    // The speaker isn't waiting on anyone's account but their own.
    expect(waiting(w, 'Ah Kow')).toEqual([]);
  });

  it('goes once they answer', () => {
    const w = spokenTo();
    w.state.t += 1;
    accepted(act(w, who(w, 'Mdm Tan').id, { verb: 'say', text: 'Not today, sorry.', to: 'Ah Kow' }));
    expect(waiting(w, 'Mdm Tan')).toEqual([]);
  });

  it('an answer to everyone counts too', () => {
    const w = spokenTo();
    w.state.t += 1;
    accepted(act(w, who(w, 'Mdm Tan').id, { verb: 'say', text: 'Nobody is hiring this week!' }));
    expect(waiting(w, 'Mdm Tan')).toEqual([]);
  });

  it('goes once they have left', () => {
    const w = spokenTo();
    put(w, 'Ah Kow', 'jetty');
    expect(waiting(w, 'Mdm Tan')).toEqual([]);
  });

  it('goes once the chat has run long', () => {
    const w = spokenTo();
    w.state.talk[talkKey(who(w, 'Ah Kow').id, who(w, 'Mdm Tan').id)] = { lines: TALK_SOFT_LIMIT + 1, lastT: w.t };
    expect(waiting(w, 'Mdm Tan')).toEqual([]);
  });

  it('goes after a while: they have stopped waiting', () => {
    const w = spokenTo();
    w.state.t += 30;
    expect(waiting(w, 'Mdm Tan')).toEqual([]);
  });

  it('lines said to someone else are not yours to answer', () => {
    const w = spokenTo();
    put(w, 'Siti', 'provision-shop');
    expect(waiting(w, 'Siti')).toEqual([]);
  });
});

describe('an answer closes the exchange', () => {
  it("someone answering what you said isn't kept waiting on you, so nobody goes back and forth for its own sake", () => {
    const w = newWorld(9);
    put(w, 'Ah Kow', 'provision-shop');
    put(w, 'Mdm Tan', 'provision-shop');
    accepted(act(w, who(w, 'Ah Kow').id, { verb: 'say', text: 'Any work going?', to: 'Mdm Tan' }));
    w.state.t += 1;
    accepted(act(w, who(w, 'Mdm Tan').id, { verb: 'say', text: 'Not today, sorry.', to: 'Ah Kow' }));
    expect(perceive(w, who(w, 'Ah Kow')).waiting).toEqual([]);
    expect(perceive(w, who(w, 'Mdm Tan')).waiting).toEqual([]);
  });
});

describe('v3 → v4: residents remember what they last did', () => {
  it('a living town starts with nothing remembered, and carries on as before', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadSql, fixtureSql } = await import('./saves.ts');
    const { SqliteStore } = await import('../src/store/sqlite-store.ts');
    const dir = mkdtempSync(join(tmpdir(), 'kampung-answer-'));
    try {
      const path = join(dir, 'kampung.db');
      loadSql(fixtureSql(2), path);
      const store = new SqliteStore(path);
      const town = Town.resume({ store })!;
      expect(town.world.state.residents.every((r) => r.lastDone === null)).toBe(true);
      await town.runUntil(town.t + 30);
      expect(town.world.state.residents.some((r) => r.lastDone !== null)).toBe(true);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
