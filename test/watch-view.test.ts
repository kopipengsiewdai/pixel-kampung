import { describe, expect, it } from 'vitest';
import { lightAt } from '../src/watch/light.ts';
import { FrameBuilder, cardOf, layoutOf } from '../src/watch/view.ts';
import { advance } from '../src/sim/tick.ts';
import { act } from '../src/sim/actions/index.ts';
import { MAP_H, MAP_W } from '../src/sim/map.ts';
import { newWorld, put, who } from './helpers.ts';

describe('day and night light', () => {
  it('is clear at noon, dark at midnight, and warm around dawn and dusk', () => {
    expect(lightAt(12 * 60).alpha).toBe(0);
    expect(lightAt(0).alpha).toBeGreaterThan(0.4);
    expect(lightAt(3 * 60).alpha).toBe(lightAt(0).alpha);
    const dusk = lightAt(19 * 60);
    expect(dusk.alpha).toBeGreaterThan(0);
    expect(dusk.alpha).toBeLessThan(lightAt(0).alpha);
    const dawn = lightAt(6 * 60 + 30);
    expect(dawn.alpha).toBeGreaterThan(0);
    expect(dawn.alpha).toBeLessThan(lightAt(0).alpha);
  });

  it('changes smoothly minute to minute', () => {
    for (let m = 0; m < 1440; m++) {
      const a = lightAt(m).alpha;
      const b = lightAt((m + 1) % 1440).alpha;
      expect(Math.abs(a - b)).toBeLessThan(0.05);
    }
  });
});

describe('the layout', () => {
  it('has every tile, every place, and houses named after who lives there', () => {
    const w = newWorld();
    const layout = layoutOf(w);
    expect(layout.w).toBe(MAP_W);
    expect(layout.h).toBe(MAP_H);
    expect(layout.tiles).toHaveLength(MAP_H);
    expect(layout.tiles[0]).toHaveLength(MAP_W);
    expect(layout.tiles[29]![0]).toBe('sea');
    const kinds = new Set(layout.places.map((p) => p.kind));
    for (const k of ['house', 'kopitiam', 'provision_shop', 'market_stall', 'jetty', 'farm', 'well', 'notice_board', 'lorry_stop']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
    const huat = who(w, 'Ah Huat');
    expect(layout.places.find((p) => p.id === huat.homeId)!.name).toBe("Ah Huat's house");
  });
});

describe('frames', () => {
  it('show where everyone is, what they are doing, their money, needs, job and goods', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    siti.items = { fish: 2 };
    const frame = new FrameBuilder().build(w);
    expect(frame.t).toBe(w.t);
    expect(frame.stamp).toBe('Mon 09:00');
    expect(frame.residents).toHaveLength(13);
    const s = frame.residents.find((r) => r.id === siti.id)!;
    expect(s).toMatchObject({ name: 'Siti', role: 'seeker', x: siti.pos.x, y: siti.pos.y, money: siti.money, place: 'the jetty', job: null });
    expect(s.route).toEqual([{ x: siti.pos.x, y: siti.pos.y }]);
    expect(s.carrying).toEqual([{ item: 'fish', qty: 2, label: '2 fish' }]);
    expect(s.hungerWord).toBe('full');
    const huat = frame.residents.find((r) => r.name === 'Ah Huat')!;
    expect(huat.job).toBe('Runs the kopitiam');
    expect(frame.shops.map((x) => x.id).sort()).toEqual(['kopitiam', 'market-stall', 'provision-shop']);
    const kopitiam = frame.shops.find((x) => x.id === 'kopitiam')!;
    expect(kopitiam.sells).toContain('kopi 10¢');
    expect(frame.beds).toHaveLength(8);
  });

  it('give each walker the tiles they stepped through since the last frame', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'kopitiam');
    const fb = new FrameBuilder();
    expect(act(w, siti.id, { verb: 'walk_to', where: 'the jetty' }).ok).toBe(true);
    const f0 = fb.build(w);
    const s0 = f0.residents.find((r) => r.id === siti.id)!;
    expect(s0.activity).toBe('walking');
    expect(s0.doing).toBe('walking to the jetty');
    const a = siti.activity;
    const path = a?.kind === 'walking' ? a.path.map((p) => ({ ...p })) : [];
    advance(w);
    const f1 = fb.build(w);
    const s1 = f1.residents.find((r) => r.id === siti.id)!;
    expect(s1.route).toEqual(path.slice(0, 3));
    expect({ x: s1.x, y: s1.y }).toEqual(path[2]);
  });

  it('describe sleep, shifts and fishing for the owner', () => {
    const w = newWorld(9);
    const fb = new FrameBuilder();
    const siti = put(w, 'Siti', 'jetty');
    expect(act(w, siti.id, { verb: 'fish' }).ok).toBe(true);
    const muthu = who(w, 'Muthu');
    muthu.activity = { kind: 'sleeping', reason: 'collapse', until: null };
    const f = fb.build(w);
    expect(f.residents.find((r) => r.id === siti.id)!.doing).toBe('fishing off the jetty');
    const m = f.residents.find((r) => r.id === muthu.id)!;
    expect(m.sleep).toBe('collapse');
    expect(m.doing).toMatch(/dozed off/);
  });
});

describe('cards', () => {
  it('add the shop, wages and thoughts to what the frame shows', () => {
    const w = newWorld(9);
    const huat = who(w, 'Ah Huat');
    const siti = who(w, 'Siti');
    w.state.owed.push({ employerId: huat.id, workerId: siti.id, cents: 120 });
    const frame = new FrameBuilder().build(w);
    const thoughts = [{ t: w.t, stamp: 'Mon 09:00', kind: 'thought', text: 'Better buy kopi.' }];
    const card = cardOf(frame, huat.id, { thoughts, noticed: [], plan: null, mindNote: null })!;
    expect(card.name).toBe('Ah Huat');
    expect(card.shop!.id).toBe('kopitiam');
    expect(card.wages).toEqual(['Owes Siti $1.20']);
    expect(card.thoughts).toEqual(thoughts);
    const sitiCard = cardOf(frame, siti.id, { thoughts: [], noticed: [], plan: null, mindNote: 'none' })!;
    expect(sitiCard.wages).toEqual(['Owed $1.20 by Ah Huat']);
    expect(sitiCard.shop).toBeNull();
    expect(cardOf(frame, 'nobody', { thoughts: [], noticed: [], plan: null, mindNote: null })).toBeNull();
  });
});
