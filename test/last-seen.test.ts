import { describe, expect, it } from 'vitest';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { act, newWorld, put, refused, who } from './helpers.ts';

// Kampung, 2026-10-29: "X isn't nearby" says where they last saw X themselves, never where X is now.
const run = (w: World, n: number) => {
  for (let i = 0; i < n; i++) {
    advance(w);
    for (const r of w.state.residents) { r.activity = null; r.hunger = 100; r.energy = 900; }
  }
};
const callFor = (w: World, from: string, to: string) => refused(act(w, who(w, from).id, { verb: 'say', to, text: 'Hello!' }));

describe('where you last saw someone', () => {
  it('seen at the kopitiam early in the morning, then gone unseen to the well: still the kopitiam', () => {
    const w = newWorld(6, 10);
    put(w, 'Muthu', 'kopitiam');
    put(w, 'Ah Huat', 'kopitiam');
    run(w, 1);
    put(w, 'Muthu', 'farm');
    run(w, 1);
    put(w, 'Ah Huat', 'well');
    run(w, 40);
    put(w, 'Muthu', 'kopitiam');
    const reply = callFor(w, 'Muthu', 'Ah Huat');
    expect(reply).toMatch(/^Ah Huat isn't nearby\. You last saw Ah Huat at the kopitiam, early this morning\./);
    expect(reply).not.toMatch(/well/);
  });

  it('seen at their own house: "at home"', () => {
    const w = newWorld(14, 0);
    const huat = who(w, 'Ah Huat');
    put(w, 'Muthu', huat.homeId);
    put(w, 'Ah Huat', huat.homeId);
    run(w, 1);
    put(w, 'Muthu', 'well');
    run(w, 40);
    expect(callFor(w, 'Muthu', 'Ah Huat')).toMatch(/You last saw Ah Huat at home, this afternoon\./);
  });

  it('not seen today: since yesterday; never seen: not lately', () => {
    const w = newWorld(18, 0);
    put(w, 'Muthu', 'kopitiam');
    put(w, 'Ah Huat', 'kopitiam');
    run(w, 1);
    put(w, 'Muthu', 'well');
    put(w, 'Ah Huat', 'farm');
    run(w, 14 * 60);
    expect(callFor(w, 'Muthu', 'Ah Huat')).toMatch(/You haven't seen Ah Huat since yesterday\./);
    expect(callFor(w, 'Muthu', 'Rahim')).toMatch(/You haven't seen Rahim lately\./);
  });

  it('where they were, not where the one who saw them stood: from the well, Ah Huat in the provision shop next door', () => {
    const w = newWorld(10, 0);
    const muthu = put(w, 'Muthu', 'well');
    const huat = put(w, 'Ah Huat', 'provision-shop');
    huat.pos = { x: 20, y: muthu.pos.y };
    muthu.pos = { x: 22, y: muthu.pos.y };
    expect(w.isNear(muthu, huat)).toBe(true);
    expect(w.placeOf(muthu)?.id).not.toBe(w.placeOf(huat)?.id);
    run(w, 1);
    put(w, 'Ah Huat', 'farm');
    run(w, 40);
    expect(callFor(w, 'Muthu', 'Ah Huat')).toMatch(/You last saw Ah Huat at the provision shop, this morning\./);
  });

  it('worded as it was then: a house named for who lived there when they saw it', () => {
    const w = newWorld(14, 0);
    const huat = who(w, 'Ah Huat');
    put(w, 'Muthu', huat.homeId);
    put(w, 'Ah Huat', huat.homeId);
    run(w, 1);
    put(w, 'Muthu', 'well');
    huat.homeId = 'rough';
    run(w, 40);
    expect(callFor(w, 'Muthu', 'Ah Huat')).toMatch(/You last saw Ah Huat at home, this afternoon\./);
  });

  it('a little while ago, if it was in the last half hour', () => {
    const w = newWorld(10, 0);
    put(w, 'Muthu', 'well');
    put(w, 'Ah Huat', 'well');
    run(w, 1);
    put(w, 'Ah Huat', 'farm');
    run(w, 10);
    expect(callFor(w, 'Muthu', 'Ah Huat')).toMatch(/You last saw Ah Huat at the well a little while ago\./);
  });

  it('the upgrade (save v32): nobody has seen anyone yet', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 31)!;
    const world = { residents: [{ id: 'siti' }, { id: 'raju' }] };
    const up = step.save!({ world, brains: {} }).world as { residents: { lastSeen: unknown }[] };
    expect(up.residents.map((r) => r.lastSeen)).toEqual([{}, {}]);
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});
