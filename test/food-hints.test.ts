import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { FORAGES_A_DAY } from '../src/sim/actions/chores.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { dayIndex } from '../src/sim/time.ts';
import { expectInWorld, newWorld, put, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));

describe('hungry, they know the land has a little to give (1)', () => {
  it('with no food to hand, the coconuts by the jetty and the bananas and kangkong past the farm plot come to mind', () => {
    const w = newWorld(14);
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 800;
    siti.items = {};
    siti.money = 0;
    const s = seen(w, 'Siti');
    expect(s).toContain('There are coconuts on the palms by the jetty, and bananas and wild kangkong past the farm plot.');
    for (const line of s.split('\n')) expectInWorld(line);
  });

  it('not once the day\'s two are foraged, nor when not hungry, nor when ill', () => {
    const w = newWorld(14);
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 800;
    siti.items = {};
    siti.foraged = { day: dayIndex(w.t), n: FORAGES_A_DAY };
    expect(seen(w, 'Siti')).not.toMatch(/coconuts on the palms/);
    siti.foraged = null;
    siti.ill = { since: w.t, better: null };
    expect(seen(w, 'Siti')).not.toMatch(/coconuts on the palms/);
    siti.ill = null;
    siti.hunger = 100;
    expect(seen(w, 'Siti')).not.toMatch(/coconuts on the palms/);
  });

  it('only the places they know', () => {
    const w = newWorld(14);
    const kow = put(w, 'Ah Kow', 'well');
    kow.hunger = 800;
    kow.items = {};
    kow.knownPlaces = kow.knownPlaces.filter((p) => p !== 'jetty' && p !== 'farm');
    expect(seen(w, 'Ah Kow')).not.toMatch(/coconuts|bananas/);
    kow.knownPlaces.push('farm');
    expect(seen(w, 'Ah Kow')).toContain('There are bananas and wild kangkong past the farm plot.');
  });
});

describe('a cook knows what they could make right now (2)', () => {
  it('at the kitchen: the dishes the stock and their own bag make, and in the cook action too', () => {
    const w = newWorld(14);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const shop = w.shop('kopitiam')!;
    shop.stock = { coffee: 1, water: 2 };
    huat.items = { fish: 16 };
    const s = seen(w, 'Ah Huat');
    expect(s).toMatch(/With what's here you could make kopi or grilled fish./);
    expect(s).toMatch(/The kitchen has no rice/);
    const cook = availableActions(w, huat).find((a) => a.verb === 'cook')!;
    expect(cook.says).toMatch(/kopi or grilled fish/);
    for (const line of s.split('\n')) expectInWorld(line);
  });

  it('at home: what they could cook from what they carry, and whether the stove has anything to burn', () => {
    const w = newWorld(14);
    const siti = put(w, 'Siti', who(w, 'Siti').homeId);
    siti.items = { fish: 2 };
    w.state.stoves[siti.homeId] = 0;
    expect(seen(w, 'Siti')).toMatch(/With what you have you could cook grilled fish, but the stove has nothing to burn: dry wood from past the farm plot, or kerosene off the lorry\./);
    siti.items.firewood = 1;
    expect(seen(w, 'Siti')).toMatch(/With what you have you could cook grilled fish\./);
    siti.items = {};
    expect(seen(w, 'Siti')).not.toMatch(/you could cook/);
  });
});
