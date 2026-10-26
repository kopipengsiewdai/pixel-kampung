import { describe, expect, it } from 'vitest';
import { bundleOf } from '../src/sim/actions/common.ts';
import { findItem } from '../src/sim/items.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const offered = (w: World, name: string, verb: string) => perceive(w, who(w, name)).actions.some((a) => a.verb === verb);

describe('talking to someone who does not answer', () => {
  it('after three lines with no answer, a fourth is refused, and they can see it', () => {
    const w = newWorld(9);
    const kow = put(w, 'Ah Kow', 'provision-shop');
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    w.learnPerson(kow, tan.id);
    for (let i = 0; i < 3; i++) {
      accepted(act(w, kow.id, { verb: 'say', to: 'Mdm Tan', text: `I'll put the water by the kitchen door (${i}).` }));
      w.state.t += 5;
    }
    const s = describePerception(perceive(w, kow));
    expect(s).toContain("Mdm Tan hasn't answered you.");
    for (const line of s.split('\n')) expectInWorld(line);
    refused(act(w, kow.id, { verb: 'say', to: 'Mdm Tan', text: 'Mdm, the water is here.' }), /Mdm Tan hasn't answered you\./);
    // Once answered, the talk goes on.
    accepted(act(w, tan.id, { verb: 'say', to: 'Ah Kow', text: 'Leave it there.' }));
    accepted(act(w, kow.id, { verb: 'say', to: 'Mdm Tan', text: 'Yes, Mdm.' }));
  });
});

describe('buying where nobody is minding the shop', () => {
  it('is not offered until someone is serving', () => {
    const w = newWorld(9);
    put(w, 'Siti', 'market-stall');
    const rahim = who(w, 'Rahim');
    put(w, 'Rahim', rahim.homeId);
    expect(offered(w, 'Siti', 'buy')).toBe(false);
    put(w, 'Rahim', 'market-stall');
    expect(offered(w, 'Siti', 'buy')).toBe(true);
  });
});

describe('the names residents use for things', () => {
  it('finds the thing in a longer name, the way people say it', () => {
    expect(findItem('nasi putih')).toBe('bubur');
    expect(findItem('bubur kosong (plain rice porridge)')).toBe('bubur');
    expect(findItem('plain rice from my bag')).toBe('bubur');
    expect(findItem('water from my pail')).toBe('water');
    expect(findItem('a small bowl of soft rice')).toBe('bubur');
    expect(findItem('kopi o')).toBe('kopi');
    expect(findItem('a bicycle')).toBeNull();
  });

  it('a list of things to trade is read as one of each', () => {
    expect(bundleOf({ items: ['fish', 'bread'] })).toEqual({ items: { fish: 1, bread: 1 }, cents: 0 });
  });
});

describe('raw rice', () => {
  it('says it needs a stove', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.items = { rice: 1 };
    refused(act(w, siti.id, { verb: 'eat', item: 'rice' }), /stove/);
  });
});
