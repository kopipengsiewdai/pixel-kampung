import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { Town } from '../src/town.ts';
import { act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));

describe('a kitchen short of something: no going round in circles (B1)', () => {
  it('"short of rice" ends the thought: one try, not three', async () => {
    let tries = 0;
    const cook: Brain = { decide: () => { tries++; return { verb: 'cook', item: 'fish porridge' }; }, save: () => null, load: () => {} };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(14, 0) - 1;
    const town = Town.create(1, start, { brains: (r) => (r.name === 'Ah Huat' ? cook : idle) });
    const w = town.world;
    for (const r of w.state.residents) r.thinkAt = start + 1000;
    const huat = put(w, 'Ah Huat', 'kopitiam');
    delete w.shop('kopitiam')!.stock.rice;
    huat.items = { fish: 16 };
    huat.thinkAt = start + 1;
    await town.runUntil(start + 1);
    expect(tries).toBe(1);
    expect(huat.reply?.text).toMatch(/short of rice/);
  });

  it('the stove wanting fuel ends the thought too', async () => {
    let tries = 0;
    const cook: Brain = { decide: () => { tries++; return { verb: 'cook', item: 'bubur' }; }, save: () => null, load: () => {} };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(14, 0) - 1;
    const town = Town.create(1, start, { brains: (r) => (r.name === 'Siti' ? cook : idle) });
    const w = town.world;
    for (const r of w.state.residents) r.thinkAt = start + 1000;
    const siti = put(w, 'Siti', who(w, 'Siti').homeId);
    siti.items = { rice: 2, water: 2 };
    w.state.stoves[siti.homeId] = 0;
    siti.thinkAt = start + 1;
    await town.runUntil(start + 1);
    expect(tries).toBe(1);
  });

  it('in the kitchen, the cook sees what it lacks, and whether the lorry has it today', () => {
    const w = newWorld(5, 0);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    delete w.shop('kopitiam')!.stock.rice;
    huat.items = {};
    const before = seen(w, 'Ah Huat');
    expect(before).toMatch(/The kitchen has no rice: no fish porridge, vegetable rice or bubur without it\./);
    expect(before).not.toMatch(/lorry has rice/);
    while (!w.state.osman.visit) advance(w);
    put(w, 'Ah Huat', 'kopitiam');
    const after = seen(w, 'Ah Huat');
    expect(after).toMatch(/The lorry at the lorry stop has rice today\./);
    for (const line of after.split('\n')) expectInWorld(line);
  });
});

describe('the stove wanting fuel says where fuel comes from (B2)', () => {
  it('dry wood past the farm plot, kerosene off the lorry', () => {
    const w = newWorld(14);
    const siti = put(w, 'Siti', who(w, 'Siti').homeId);
    siti.items = { rice: 2, water: 2 };
    w.state.stoves[siti.homeId] = 0;
    const text = refused(act(w, siti.id, { verb: 'cook', item: 'bubur' }));
    expect(text).toMatch(/firewood or kerosene/);
    expect(text).toMatch(/dry wood .*past the farm plot/);
    expect(text).toMatch(/kerosene .*lorry|lorry .*kerosene/);
    expectInWorld(text);
  });
});
