import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { Town } from '../src/town.ts';
import { act, newWorld, put, refused, sgt, who } from './helpers.ts';

// Kampung, 2026-10-29: "You don't know anyone called 'Pak Osman'" x30, from people who'd sold him fish that morning.
describe('Pak Osman by name', () => {
  it('at the lorry, he deals from it: not "nobody by that name"', () => {
    const w = newWorld(7, 0);
    w.state.lorryHere = true;
    const raju = put(w, 'Raju', 'lorry-stop');
    for (const name of ['Pak Osman', 'Osman', 'the lorry man', 'lorry man']) {
      const reply = refused(act(w, raju.id, { verb: 'say', to: name, text: 'Selamat pagi!' }));
      expect(reply).not.toMatch(/don't know anyone/);
      expect(reply).toMatch(/deals from his lorry/);
    }
  });

  it('away from it, or with the lorry gone: his lorry comes in the mornings', () => {
    const w = newWorld(15, 0);
    w.state.lorryHere = false;
    const raju = put(w, 'Raju', 'lorry-stop');
    expect(refused(act(w, raju.id, { verb: 'say', to: 'Pak Osman', text: 'Hello' }))).toMatch(/comes to the lorry stop in the mornings/);
    put(w, 'Raju', 'well');
    expect(refused(act(w, raju.id, { verb: 'give', to: 'Pak Osman', money: '10¢' }))).toMatch(/comes to the lorry stop in the mornings/);
  });

  it('asking again this minute won\'t change it: one try, not three', async () => {
    let tries = 0;
    const talker: Brain = { decide: () => { tries++; return { verb: 'say', to: 'Pak Osman', text: 'Pagi!' }; }, save: () => null, load: () => {} };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(15, 0) - 1;
    const town = Town.create(1, start, { brains: (r) => (r.name === 'Raju' ? talker : idle) });
    for (const r of town.world.state.residents) r.thinkAt = start + 1000;
    const raju = put(town.world, 'Raju', 'well');
    raju.thinkAt = start + 1;
    await town.runUntil(start + 1);
    expect(tries).toBe(1);
    expect(who(town.world, 'Raju').reply?.text).toMatch(/lorry/);
  });
});
