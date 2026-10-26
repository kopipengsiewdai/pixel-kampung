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
