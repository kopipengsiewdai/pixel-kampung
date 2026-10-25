import { describe, expect, it } from 'vitest';
import { act } from '../src/sim/actions/index.ts';
import { bubbleText, idleKindOf, idlePose, type IdleKind } from '../src/watch/client/idle.ts';
import { FrameBuilder, layoutOf } from '../src/watch/view.ts';
import type { ResidentView } from '../src/watch/types.ts';
import { accepted, newWorld, put, who } from './helpers.ts';

function viewOf(w: ReturnType<typeof newWorld>, name: string): { r: ResidentView; place: string | null } {
  const frame = new FrameBuilder().build(w);
  const r = frame.residents.find((x) => x.name === name)!;
  const layout = layoutOf(w);
  const p = layout.places.find((pl) => r.x >= pl.rect.x && r.x < pl.rect.x + pl.rect.w && r.y >= pl.rect.y && r.y < pl.rect.y + pl.rect.h);
  return { r, place: p?.kind ?? null };
}

describe('idle life: what someone waiting between thoughts looks like', () => {
  it('picks a pose from what they are doing and where', () => {
    const w = newWorld(9);
    put(w, 'Siti', 'kopitiam');
    put(w, 'Mdm Tan', 'provision-shop');
    put(w, 'Raju', 'jetty');
    accepted(act(w, who(w, 'Raju').id, { verb: 'fish' }));
    put(w, 'Muthu', 'well');
    w.resident(who(w, 'Ah Kow').id).pos = { x: 20, y: 13 }; // out on the footpath
    const kind = (name: string): IdleKind => { const v = viewOf(w, name); return idleKindOf(v.r, v.place); };
    expect(kind('Siti')).toBe('sit');
    expect(kind('Mdm Tan')).toBe('sweep'); // minding her own shop
    expect(kind('Raju')).toBe('fish');
    expect(kind('Muthu')).toBe('wander');
    expect(kind('Ah Kow')).toBe('wander');
  });

  it('someone walking or asleep has no idle pose', () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    siti.activity = { kind: 'sleeping', reason: 'nap', until: null };
    const v = viewOf(w, 'Siti');
    expect(idleKindOf(v.r, v.place)).toBe('none');
    expect(idleKindOf({ ...v.r, activity: 'walking' }, v.place)).toBe('none');
  });

  it('stays within a tile or so of where they really are, and comes back', () => {
    for (const kind of ['sit', 'sweep', 'fish', 'wander', 'look'] as IdleKind[]) {
      let back = false;
      for (let ms = 0; ms < 60_000; ms += 50) {
        const p = idlePose(kind, ms, 3);
        expect(Math.abs(p.dx), kind).toBeLessThanOrEqual(T * 1.5);
        expect(Math.abs(p.dy), kind).toBeLessThanOrEqual(4);
        if (ms > 0 && p.dx === 0 && p.dy === (kind === 'sit' ? 3 : 0)) back = true;
      }
      expect(back, kind).toBe(true);
    }
  });

  it('a wanderer actually wanders, and people do not all move in step', () => {
    const xs = new Set<number>();
    for (let ms = 0; ms < 30_000; ms += 100) xs.add(Math.round(idlePose('wander', ms, 1).dx));
    expect(xs.size).toBeGreaterThan(3);
    const a = Array.from({ length: 100 }, (_, i) => idlePose('wander', i * 300, 1).dx);
    const b = Array.from({ length: 100 }, (_, i) => idlePose('wander', i * 300, 7).dx);
    expect(a).not.toEqual(b);
    expect(idlePose('wander', 1234, 5)).toEqual(idlePose('wander', 1234, 5)); // the same moment draws the same
  });

  it('nobody idles in a frozen pose: the fisher and the sweeper move a little', () => {
    for (const kind of ['fish', 'sweep', 'sit', 'look'] as IdleKind[]) {
      const poses = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(idlePose(kind, i * 97, 2))));
      expect(poses.size, kind).toBeGreaterThan(1);
    }
  });
});

describe('speech bubbles', () => {
  it("show a resident's latest line for a little while after they say it", () => {
    const w = newWorld(9);
    put(w, 'Ah Kow', 'well');
    put(w, 'Siti', 'well');
    accepted(act(w, who(w, 'Ah Kow').id, { verb: 'say', text: 'Any work going? I can carry rice, fish, anything at all, honestly.', to: 'Siti' }));
    const kow = new FrameBuilder().build(w).residents.find((r) => r.name === 'Ah Kow')!;
    expect(kow.said).toEqual({ t: w.t, text: 'Any work going? I can carry rice, fish, anything at all, honestly.' });
    expect(bubbleText(kow.said!.text)).toBe('Any work going? I can carry rice, fish…');
    expect(new FrameBuilder().build(w).residents.find((r) => r.name === 'Siti')!.said).toBeNull();
    w.state.t += 3;
    expect(new FrameBuilder().build(w).residents.find((r) => r.name === 'Ah Kow')!.said).toBeNull();
  });
});

const T = 16;
