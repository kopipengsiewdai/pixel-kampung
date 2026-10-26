import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim/tick.ts';
import { newWorld, who } from './helpers.ts';

describe('the rent notice reaches every holder, awake (B6)', () => {
  it('a holder asleep (collapsed) when word goes round hears it once they are up; nobody hears it twice', () => {
    const w = newWorld(7, 50);
    const siti = who(w, 'Siti');
    const huat = who(w, 'Ah Huat');
    siti.activity = { kind: 'sleeping', reason: 'collapse', until: null };
    siti.energy = 0;
    for (let i = 0; i < 15; i++) advance(w);
    const heard = (name: string) => who(w, name).recent.filter((o) => /rent is due each Monday/.test(o.text)).length;
    expect(heard('Ah Huat')).toBe(1);
    expect(heard('Siti')).toBe(0);
    siti.activity = null;
    siti.energy = 900;
    for (let i = 0; i < 5; i++) advance(w);
    expect(heard('Siti')).toBe(1);
    for (let i = 0; i < 60; i++) advance(w);
    expect(heard('Siti')).toBe(1);
    expect(heard('Ah Huat')).toBe(1);
    void huat;
  });
});

describe('the upgrade (save v22)', () => {
  it('before rent starts, every holder hears it once more; minds start with no plan misses; fake brains untouched', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 21)!;
    const world = { t: 1000 * 1440, rentFrom: 1010, rentNoticed: true };
    const brains = { siti: { budget: { level: 1 }, plan: 'x' }, raju: { mem: 1 } };
    const up = step.save!({ world, brains });
    expect(up.world).toMatchObject({ rentToldTo: [], rentNoticed: false });
    expect(up.brains).toEqual({ siti: { budget: { level: 1 }, plan: 'x', planMisses: 0 }, raju: { mem: 1 } });
    const after = step.save!({ world: { ...world, rentFrom: 990 }, brains: {} });
    expect(after.world).toMatchObject({ rentNoticed: true });
  });
});
