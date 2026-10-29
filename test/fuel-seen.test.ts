import { describe, expect, it } from 'vitest';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

// Kampung, 2026-10-29, from the live town: in house-9 Aminah held a tin of
// kerosene while Fatimah was told 26 times the stove needed fuel.
const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));

function house9() {
  const w = newWorld(19, 0);
  const home = who(w, 'Fatimah').homeId;
  const fatimah = put(w, 'Fatimah', home);
  const aminah = put(w, 'Aminah', home);
  fatimah.items = { vegetables: 2 };
  aminah.items = { kerosene: 1 };
  w.state.stoves[home] = 0;
  return { w, fatimah, aminah, home };
}

describe('fuel in the hands of the people around a cook', () => {
  it('shows beside them, like food', () => {
    const { w } = house9();
    expect(seen(w, 'Fatimah')).toMatch(/Aminah \([^)]*holding a tin of kerosene\)/);
  });

  it('the stove refusal says who has it, and the stove takes nothing from their hands', () => {
    const { w, fatimah, aminah } = house9();
    const reply = refused(act(w, fatimah.id, { verb: 'cook', item: 'boiled kangkong' }));
    expectInWorld(reply);
    expect(reply).toMatch(/^The stove needs firewood or kerosene/);
    expect(reply).toMatch(/ Aminah has a tin of kerosene\.$/);
    expect(aminah.items.kerosene).toBe(1);
    expect(fatimah.stove).toBeFalsy();
  });

  it('someone asleep is not named; firewood is named as bundles', () => {
    const { w, fatimah, aminah } = house9();
    aminah.activity = { kind: 'sleeping', reason: 'nap' } as never;
    const hassan = put(w, 'Hassan', fatimah.homeId);
    hassan.items = { firewood: 3 };
    const reply = refused(act(w, fatimah.id, { verb: 'cook', item: 'boiled kangkong' }));
    expect(reply).not.toMatch(/Aminah/);
    expect(reply).toMatch(/ Hassan has 3 bundles of firewood\.$/);
  });

  it('nobody with fuel there: the refusal as before', () => {
    const { w, fatimah, aminah } = house9();
    aminah.items = {};
    expect(refused(act(w, fatimah.id, { verb: 'cook', item: 'boiled kangkong' }))).toBe(
      "The stove needs firewood or kerosene for that. There's dry wood to gather past the farm plot, and the lorry sells kerosene.",
    );
  });
});
