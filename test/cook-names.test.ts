import { describe, expect, it } from 'vitest';
import { findItem } from '../src/sim/items.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

// Kampung, 2026-10-29, from the live town, game day 20770.
describe('dishes asked for by what they are made of', () => {
  it('"bubur nasi" is bubur (Siti was told she didn\'t know how to make it 31 times)', () => {
    expect(findItem('bubur nasi')).toBe('bubur');
    const w = newWorld(9, 0);
    const siti = put(w, 'Siti', who(w, 'Siti').homeId);
    siti.items = { rice: 1, water: 1, firewood: 1 };
    accepted(act(w, siti.id, { verb: 'cook', item: 'bubur nasi' }));
    expect(siti.stove?.item).toBe('bubur');
  });

  it('"cook kangkong" with only greens to hand is boiled kangkong (Aminah, 12 times)', () => {
    const w = newWorld(9, 0);
    const aminah = put(w, 'Aminah', who(w, 'Aminah').homeId);
    aminah.items = { vegetables: 2, firewood: 1 };
    accepted(act(w, aminah.id, { verb: 'cook', item: 'kangkong' }));
    expect(aminah.stove?.item).toBe('boiled kangkong');
  });

  it('with nothing to make it from yet, the plain dish: they hear what it takes', () => {
    const w = newWorld(9, 0);
    const aminah = put(w, 'Aminah', who(w, 'Aminah').homeId);
    aminah.items = { firewood: 1 };
    const reply = refused(act(w, aminah.id, { verb: 'cook', item: 'kangkong' }));
    expect(reply).not.toMatch(/know how to make/);
    expect(reply).toMatch(/vegetables/);
  });

  it('more than one dish they could make from it: they hear the choices, in-world', () => {
    const w = newWorld(9, 0);
    const aminah = put(w, 'Aminah', who(w, 'Aminah').homeId);
    aminah.items = { vegetables: 2, rice: 1, firewood: 1 };
    const reply = refused(act(w, aminah.id, { verb: 'cook', item: 'kangkong' }));
    expectInWorld(reply);
    expect(reply).toBe('Boiled kangkong, or vegetable rice? Say which.');
    expect(aminah.stove).toBeFalsy();
  });

  it('a dish they don\'t know is still unknown', () => {
    const w = newWorld(9, 0);
    const aminah = put(w, 'Aminah', who(w, 'Aminah').homeId);
    aminah.items = { chilli: 2 };
    refused(act(w, aminah.id, { verb: 'cook', item: 'chilli' }), /know how to make/);
  });
});

describe('after review', () => {
  it('at a fire, greens named: they hear it can\'t go over a fire, not that they don\'t know it', () => {
    const w = newWorld(14);
    const aminah = put(w, 'Aminah', 'jetty');
    aminah.items = { firewood: 1 };
    accepted(act(w, aminah.id, { verb: 'light_fire' }));
    aminah.items = { vegetables: 2 };
    const reply = refused(act(w, aminah.id, { verb: 'cook', item: 'kangkong' }));
    expectInWorld(reply);
    expect(reply).toMatch(/open fire/);
  });

  it('in a kitchen with fish, rice and water: grilled fish or fish porridge, asked which', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    w.shop('kopitiam')!.stock = { fish: 2, rice: 1, water: 1, vegetables: 1 };
    huat.items = {};
    expect(refused(act(w, huat.id, { verb: 'cook', item: 'fish' }))).toBe('Grilled fish, or fish porridge? Say which.');
    expect(refused(act(w, huat.id, { verb: 'cook', item: 'rice' }))).toBe('Bubur, fish porridge, or vegetable rice? Say which.');
  });

  it('sharing something held that is no meal, or a name they don\'t know: said so, with what they hold', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    const aminah = put(w, 'Aminah', 'well');
    aminah.hunger = 700;
    fatimah.items = { rice: 1, bubur: 1, 'grilled fish': 2 };
    const rice = refused(act(w, fatimah.id, { verb: 'share_meal', item: 'rice' }));
    expect(rice).toMatch(/^You can't eat raw rice/);
    expect(rice).toMatch(/You are holding 2 grilled fish and a bowl of bubur\.$/);
    expect(refused(act(w, fatimah.id, { verb: 'share_meal', item: 'nasi lemak' }))).toMatch(/^You don't have anything called "nasi lemak"\. You are holding/);
  });
});

describe('sharing a food they are not holding', () => {
  it('says what they do hold, so they can share that instead (Fatimah, 11 times)', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    const aminah = put(w, 'Aminah', 'well');
    aminah.hunger = 700;
    fatimah.items = { vegetables: 2, water: 1 };
    const reply = refused(act(w, fatimah.id, { verb: 'share_meal', item: 'boiled kangkong' }));
    expectInWorld(reply);
    expect(reply).toBe('You have no boiled kangkong in hand. You are holding 2 bunches of vegetables.');
  });
});
