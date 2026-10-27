import { describe, expect, it } from 'vitest';
import { CHORE_MINUTES, ILL_FETCH_MINUTES } from '../src/sim/actions/chores.ts';
import { advance } from '../src/sim/tick.ts';
import { accepted, act, expectInWorld, newWorld, put, refused } from './helpers.ts';

// Owner, 2026-10-28 ("Both"): Siti and Mak Esah, ill, were told they were short
// of water ten times and more, and never cooked.
describe('the ill and water (subsistence.md Q4, amended 2026-10-28)', () => {
  it('someone ill may still fetch a pail, slowly', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.ill = { since: w.t, better: null };
    siti.items = {};
    accepted(act(w, siti.id, { verb: 'fetch_water' }));
    expect(ILL_FETCH_MINUTES).toBeGreaterThan(CHORE_MINUTES.fetch_water);
    for (let i = 0; i < ILL_FETCH_MINUTES - 1; i++) advance(w);
    expect(siti.items.water ?? 0).toBe(0);
    advance(w);
    expect(siti.items.water).toBe(1);
  });

  it('one pail at a time: carrying one, they can\'t manage another', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.ill = { since: w.t, better: null };
    siti.items = { water: 1 };
    expectInWorld(refused(act(w, siti.id, { verb: 'fetch_water' }), /pail/));
    // Well, they carry as many as they like.
    siti.ill = null;
    accepted(act(w, siti.id, { verb: 'fetch_water' }));
  });

  it('fishing, foraging, firewood and odd jobs stay too much for them', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    siti.ill = { since: w.t, better: null };
    expectInWorld(refused(act(w, siti.id, { verb: 'fish' })));
    expectInWorld(refused(act(w, siti.id, { verb: 'forage' })));
    put(w, 'Siti', 'farm');
    expectInWorld(refused(act(w, siti.id, { verb: 'gather_firewood' })));
    expectInWorld(refused(act(w, siti.id, { verb: 'do_odd_job' })));
  });

  it('anyone who sees them, kin or neighbour, notices they\'re too ill to fetch water, once a day', () => {
    const w = newWorld(9);
    const aminah = put(w, 'Aminah', 'kopitiam');
    aminah.ill = { since: w.t, better: null };
    aminah.items = {};
    const raju = put(w, 'Raju', 'kopitiam');
    const fatimah = put(w, 'Fatimah', 'kopitiam');
    advance(w);
    const line = 'Aminah looked ill, too weak to be fetching water.';
    expectInWorld(line);
    expect(raju.recent.filter((m) => m.text === line)).toHaveLength(1);
    expect(fatimah.recent.filter((m) => m.text === line)).toHaveLength(1);
    for (let i = 0; i < 30; i++) advance(w);
    expect(raju.recent.filter((m) => m.text === line)).toHaveLength(1);
  });

  it('with water in hand, kin just see them ill; a neighbour thinks nothing of it', () => {
    const w = newWorld(9);
    const aminah = put(w, 'Aminah', 'kopitiam');
    aminah.ill = { since: w.t, better: null };
    aminah.items = { water: 1 };
    const raju = put(w, 'Raju', 'kopitiam');
    const fatimah = put(w, 'Fatimah', 'kopitiam');
    advance(w);
    expect(fatimah.recent.some((m) => m.text === 'Aminah looked ill.')).toBe(true);
    expect(raju.recent.some((m) => /Aminah looked ill/.test(m.text))).toBe(false);
  });

  it('kin who saw them with water still notice later that day when it has gone', () => {
    const w = newWorld(9);
    const aminah = put(w, 'Aminah', 'kopitiam');
    aminah.ill = { since: w.t, better: null };
    aminah.items = { water: 1 };
    const fatimah = put(w, 'Fatimah', 'kopitiam');
    advance(w);
    aminah.items = {};
    advance(w);
    expect(fatimah.recent.some((m) => m.text === 'Aminah looked ill, too weak to be fetching water.')).toBe(true);
  });

  it('seen at the well drawing a pail, they aren\'t thought too weak to be fetching it', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.ill = { since: w.t, better: null };
    siti.items = {};
    accepted(act(w, siti.id, { verb: 'fetch_water' }));
    const raju = put(w, 'Raju', 'well');
    advance(w);
    expect(raju.recent.some((m) => /too weak to be fetching water/.test(m.text))).toBe(false);
  });

  it('carrying a pail, they aren\'t offered another', async () => {
    const { availableActions } = await import('../src/sim/actions/index.ts');
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.ill = { since: w.t, better: null };
    siti.items = {};
    expect(availableActions(w, siti).map((a) => a.verb)).toContain('fetch water');
    siti.items = { water: 1 };
    expect(availableActions(w, siti).map((a) => a.verb)).not.toContain('fetch water');
  });

  it('a pail for themselves, yes; fetching water for pay, no (paid work stays blocked)', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'well');
    const siti = put(w, 'Siti', 'well');
    huat.money = 500;
    siti.ill = { since: w.t, better: null };
    accepted(act(w, huat.id, { verb: 'ask_errand', to: 'Siti', text: 'fetch water', money: '10¢' }));
    expectInWorld(refused(act(w, siti.id, { verb: 'agree', from: 'Ah Huat' }), /too weak/));
  });
});
