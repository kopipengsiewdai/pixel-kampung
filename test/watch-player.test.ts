import { describe, expect, it } from 'vitest';
import { ReplayPlayer } from '../src/watch/player.ts';
import { mergeUpdates } from '../src/watch/source.ts';
import type { Frame, ResidentView, Update } from '../src/watch/types.ts';

function clock(): { now: () => number; advance: (ms: number) => void } {
  let ms = 1_000_000;
  return { now: () => ms, advance: (d) => { ms += d; } };
}

describe('the replay player', () => {
  it('plays at the chosen speed in game minutes per real minute', () => {
    const c = clock();
    const p = new ReplayPlayer({ start: 100, end: 1000 }, { now: c.now, speed: 60 });
    expect(p.state()).toMatchObject({ t: 100, speed: 60, paused: false });
    c.advance(500);
    expect(p.tick()).toBeNull(); // half a game minute
    c.advance(500);
    expect(p.tick()).toEqual({ from: 100, to: 101 });
    c.advance(10_000);
    expect(p.tick()).toEqual({ from: 101, to: 111 });
    p.setSpeed(600);
    c.advance(1000);
    expect(p.tick()).toEqual({ from: 111, to: 121 });
  });

  it('pauses, seeks, and stops at the end', () => {
    const c = clock();
    const p = new ReplayPlayer({ start: 0, end: 50 }, { now: c.now, speed: 60 });
    p.pause();
    c.advance(60_000);
    expect(p.tick()).toBeNull();
    expect(p.state().t).toBe(0);
    p.seek(40);
    expect(p.state().t).toBe(40);
    p.play();
    c.advance(60_000);
    expect(p.tick()).toEqual({ from: 40, to: 50 });
    expect(p.state()).toMatchObject({ t: 50, paused: true });
    // Play again from the end: back to the start.
    p.play();
    expect(p.state().t).toBe(0);
    // Seeks stay in range.
    p.seek(-5);
    expect(p.state().t).toBe(0);
    p.seek(999);
    expect(p.state().t).toBe(50);
  });

  it('follows a trial that is still being recorded', () => {
    const c = clock();
    const p = new ReplayPlayer({ start: 0, end: 10 }, { now: c.now, speed: 60 });
    p.extend(100);
    c.advance(30_000);
    expect(p.tick()).toEqual({ from: 0, to: 30 });
  });

  it('rejects silly speeds', () => {
    const c = clock();
    const p = new ReplayPlayer({ start: 0, end: 10 }, { now: c.now, speed: 60 });
    expect(() => p.setSpeed(0)).toThrow();
    expect(() => p.setSpeed(Number.NaN)).toThrow();
    expect(() => p.setSpeed(1e9)).toThrow();
  });
});

function resident(id: string, x: number, y: number, route = [{ x, y }]): ResidentView {
  return {
    id, name: id, role: 'seeker', homeId: 'house-1', x, y, route, activity: null, sleep: null, doing: '', place: null,
    money: 0, hunger: 0, energy: 1000, hungerWord: 'full', energyWord: 'rested', job: null, carrying: [],
  };
}
function frame(t: number, residents: ResidentView[]): Frame {
  return { t, stamp: '', clock: '', minuteOfDay: 0, lorryHere: false, residents, shops: [], owed: [], beds: [] };
}

describe('merging updates the page has not seen yet', () => {
  it('keeps the newest frame, joins routes and feed lines', () => {
    const a: Update = { frame: frame(1, [resident('s', 2, 0, [{ x: 1, y: 0 }, { x: 2, y: 0 }])]), feed: [{ t: 1, seq: 1, text: 'a', notable: false }] };
    const b: Update = { frame: frame(2, [resident('s', 4, 0, [{ x: 3, y: 0 }, { x: 4, y: 0 }])]), feed: [{ t: 2, seq: 2, text: 'b', notable: true }] };
    const m = mergeUpdates(a, b);
    expect(m.frame.t).toBe(2);
    expect(m.frame.residents[0]!.route).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);
    expect(m.feed.map((l) => l.text)).toEqual(['a', 'b']);
    expect(m.snap).toBeFalsy();
    expect(a.frame.residents[0]!.route).toHaveLength(2); // inputs untouched
  });

  it('drops repeated standing-still points and caps long routes', () => {
    const still: Update = { frame: frame(1, [resident('s', 2, 0)]), feed: [] };
    const again: Update = { frame: frame(2, [resident('s', 2, 0)]), feed: [] };
    expect(mergeUpdates(still, again).frame.residents[0]!.route).toEqual([{ x: 2, y: 0 }]);
    let u: Update = still;
    for (let i = 3; i < 200; i++) u = mergeUpdates(u, { frame: frame(i, [resident('s', i, 0, [{ x: i, y: 0 }])]), feed: [] });
    const route = u.frame.residents[0]!.route;
    expect(route.length).toBeLessThanOrEqual(64);
    expect(route[route.length - 1]).toEqual({ x: 199, y: 0 });
  });

  it('snaps if either update snaps', () => {
    const a: Update = { frame: frame(1, []), feed: [], snap: true };
    const b: Update = { frame: frame(2, []), feed: [] };
    expect(mergeUpdates(a, b).snap).toBe(true);
  });
});
