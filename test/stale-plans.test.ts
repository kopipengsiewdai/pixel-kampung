import { describe, expect, it } from 'vitest';
import { CostLog } from '../src/mind/cost-log.ts';
import { FakeModel } from '../src/mind/fake-model.ts';
import { MemoryStore } from '../src/mind/memory.ts';
import { Mind, PLAN_MISSES } from '../src/mind/mind.ts';
import { userPrompt } from '../src/mind/prompt.ts';
import { CARDS } from '../src/seed/cards.ts';
import { perceive } from '../src/sim/perception.ts';
import { realMsAt } from '../src/sim/time.ts';
import { expectInWorld, newWorld, put } from './helpers.ts';

describe('plans that go stale (B4)', () => {
  it('the morning plan is asked from where they are and what they hold', () => {
    const w = newWorld(7);
    const raju = put(w, 'Raju', w.state.residents.find((r) => r.name === 'Raju')!.homeId);
    raju.items = { fish: 2 };
    const ask = userPrompt('plan', perceive(w, raju), [], null).split('\n').at(-1)!;
    expect(ask).toMatch(/You're at home/);
    expect(ask).toMatch(/carrying 2 fish/);
    expectInWorld(ask);
    raju.items = {};
    expect(userPrompt('plan', perceive(w, raju), [], null).split('\n').at(-1)).toMatch(/carrying nothing/);
  });

  it('after several tries in a row come to nothing, the plan stops being shown; a thing done keeps it', async () => {
    const mind = new Mind({ client: new FakeModel(3), memory: new MemoryStore(':memory:'), costs: new CostLog(null), cards: CARDS });
    mind.keepSent = true;
    const w = newWorld(7);
    const raju = put(w, 'Raju', 'well');
    const brain = mind.brainFor(raju.id, 'Raju', raju.role, null, w.t);
    const ctx = () => ({ t: w.t, realMs: realMsAt(w.state.clock, w.t), residentId: raju.id, emit: () => {} });
    const think = async (ok: boolean) => {
      raju.reply = { ok, text: ok ? 'You fetch a pail of water.' : "You're not sure how to do that." };
      await brain.decide(perceive(w, raju), ctx());
      w.state.t += 10;
      return mind.sent.at(-1)!.user;
    };
    expect(await think(true)).toMatch(/Your plan for today/);
    for (let i = 0; i < PLAN_MISSES - 1; i++) expect(await think(false)).toMatch(/Your plan for today/);
    expect(await think(true)).toMatch(/Your plan for today/);
    for (let i = 0; i < PLAN_MISSES; i++) await think(false);
    expect(await think(false)).not.toMatch(/Your plan for today/);
    // Gone for the day, even once something works.
    expect(await think(true)).not.toMatch(/Your plan for today/);
  });
});
