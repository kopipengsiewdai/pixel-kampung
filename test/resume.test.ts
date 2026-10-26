import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Town } from '../src/town.ts';
import { SqliteStore } from '../src/store/sqlite-store.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { SIM_START } from '../src/cli/start.ts';
import { sgt } from './helpers.ts';
import { kampungHome, dbPath } from '../src/config/paths.ts';
import { homedir } from 'node:os';
import { skipQuietly } from '../src/sim/skip.ts';
import { dayIndex } from '../src/sim/time.ts';

const dirs: string[] = [];
function tempHome(): string {
  const d = mkdtempSync(join(tmpdir(), 'kampung-test-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const START = sgt(6, 0) - 1;

describe('save and resume', () => {
  it('save → close → resume gives identical state, and both carry on identically', async () => {
    const path = join(tempHome(), 'kampung.db');
    const store = new SqliteStore(path);
    const town = Town.create(5, START, { store });
    await town.runUntil(START + 600);
    const before = town.snapshot();
    store.close(); // the process "dies" here: nothing else is written

    const store2 = new SqliteStore(path);
    const resumed = Town.resume({ store: store2 })!;
    expect(resumed.snapshot()).toEqual(before);

    const a: GameEvent[] = [];
    const b: GameEvent[] = [];
    const original = Town.fromSnapshot(before.world, before.brains, { onEvent: (e) => a.push(e) });
    const again = Town.resume({ store: store2, onEvent: (e) => b.push(e) })!;
    await original.runUntil(START + 1500);
    await again.runUntil(START + 1500);
    expect(b).toEqual(a);
    expect(again.snapshot()).toEqual(original.snapshot());
    store2.close();
  });

  it('a run split by a restart matches one continuous run, event log included', async () => {
    const all: GameEvent[] = [];
    const continuous = Town.create(11, START, { onEvent: (e) => all.push(e) });
    await continuous.runUntil(START + 2 * 1440);

    const path = join(tempHome(), 'kampung.db');
    let store = new SqliteStore(path);
    const first = Town.create(11, START, { store });
    await first.runUntil(START + 1440 + 123);
    store.close();
    store = new SqliteStore(path);
    const second = Town.resume({ store })!;
    await second.runUntil(START + 2 * 1440);
    expect(second.snapshot()).toEqual(continuous.snapshot());
    expect(store.events()).toEqual(all);
    store.close();
  });

  it('survives being killed mid-run (SIGKILL): the saved minute is whole and exact', async () => {
    const home = tempHome();
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli/sim.ts', '--days', '3', '--seed', '9', '--save', '--home', home], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve) => {
      let lines = 0;
      child.stdout!.on('data', (buf: Buffer) => {
        lines += buf.toString().split('\n').length - 1;
        if (lines > 300 && !child.killed) {
          child.kill('SIGKILL');
          resolve();
        }
      });
      child.on('exit', () => resolve());
    });
    await new Promise((r) => child.once('exit', r).once('close', r));

    const store = new SqliteStore(join(home, 'sim.db'));
    const saved = store.load()!;
    expect(saved.world.t).toBeGreaterThan(SIM_START);
    expect(saved.world.t).toBeLessThan(SIM_START + 3 * 1440); // it really died mid-run
    const fresh: GameEvent[] = [];
    const replay = Town.create(9, SIM_START, { onEvent: (e) => fresh.push(e) });
    await replay.runUntil(saved.world.t);
    expect(replay.snapshot()).toEqual({ world: saved.world, brains: saved.brains });
    expect(store.events()).toEqual(fresh);
    store.close();
  });
});

describe('downtime', () => {
  it('a long gap passes quietly: no replay, nobody starving, the town carries on', async () => {
    const events: GameEvent[] = [];
    const town = Town.create(3, START, { onEvent: (e) => events.push(e) });
    await town.runUntil(sgt(13, 0)); // the lorry has gone
    const money = town.world.state.residents.reduce((s, r) => s + r.money, 0);
    const mark = events.length;
    const now = sgt(20, 30); // the PC slept for seven and a half hours
    await town.catchUp(now);
    expect(town.t).toBe(now);
    const during = events.slice(mark).filter((e) => e.t < now);
    expect(during.map((e) => e.type).filter((t) => !['quiet_spell', 'shift_ended', 'fell_asleep', 'woke'].includes(t))).toEqual([]);
    expect(during.some((e) => e.type === 'quiet_spell')).toBe(true);
    expect(town.world.state.residents.reduce((s, r) => s + r.money, 0)).toBe(money);
    for (const r of town.world.state.residents) expect(r.hunger).toBeLessThanOrEqual(820);
    await town.runUntil(now + 1440);
    expect(events.filter((e) => e.type === 'lorry_arrived')).toHaveLength(2);
  });

  it('a gap while the lorry is in: he has driven off by the end of it, and nothing else happens', async () => {
    const events: GameEvent[] = [];
    const town = Town.create(3, START, { onEvent: (e) => events.push(e) });
    await town.runUntil(sgt(10, 0));
    expect(town.world.state.lorryHere).toBe(true);
    const mark = events.length;
    const now = sgt(20, 30);
    await town.catchUp(now);
    const during = events.slice(mark).filter((e) => e.t < now);
    expect(during.filter((e) => e.type === 'lorry_left')).toHaveLength(1);
    expect(during.map((e) => e.type).filter((t) => !['quiet_spell', 'shift_ended', 'fell_asleep', 'woke', 'lorry_left'].includes(t))).toEqual([]);
    expect(town.world.state.lorryHere).toBe(false);
    expect(town.world.state.osman.visit).toBeNull();
  });

  it('resuming into the night puts everyone to bed at home', async () => {
    const town = Town.create(3, START);
    await town.runUntil(sgt(15, 0));
    await town.catchUp(sgt(2, 0, 1));
    for (const r of town.world.state.residents) {
      expect(r.activity?.kind).toBe('sleeping');
      expect(town.world.isAt(r, r.homeId)).toBe(true);
    }
    await town.runUntil(sgt(9, 0, 1));
    expect(town.world.state.residents.some((r) => r.activity?.kind !== 'sleeping')).toBe(true);
  });

  it('a shift cut by a long gap is paid, and the next day\'s shift is still on', async () => {
    const town = Town.create(3, START);
    const w = town.world;
    const huat = w.residentByName('Ah Huat')!;
    const siti = w.residentByName('Siti')!;
    await town.runUntil(sgt(10, 0));
    w.state.jobs.push({ id: 999, employerId: huat.id, workerId: siti.id, placeId: 'kopitiam', wage: 200, startHour: 10, hours: 4, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 999, until: sgt(14, 0), worked: 0 };
    skipQuietly(w, sgt(11, 0, 1));
    expect(w.state.owed.find((o) => o.workerId === siti.id)?.cents).toBe(200);
    expect(w.state.jobs.find((j) => j.id === 999)?.lastWorkedDay).not.toBe(dayIndex(sgt(11, 0, 1)));
  });

  it('someone who dozed off keeps resting through a short gap', async () => {
    const town = Town.create(3, START);
    const w = town.world;
    await town.runUntil(sgt(13, 0));
    const siti = w.residentByName('Siti')!;
    siti.energy = 0;
    siti.activity = { kind: 'sleeping', reason: 'collapse', until: null };
    skipQuietly(w, sgt(13, 30));
    expect(siti.energy).toBeGreaterThanOrEqual(90);
    await town.runUntil(sgt(16, 0));
    expect(siti.energy).toBeGreaterThan(300);
  });

  it('a short gap is simply replayed', async () => {
    const events: GameEvent[] = [];
    const town = Town.create(3, START, { onEvent: (e) => events.push(e) });
    await town.runUntil(sgt(9, 0));
    await town.catchUp(sgt(9, 5));
    expect(events.some((e) => e.type === 'quiet_spell')).toBe(false);
    expect(town.t).toBe(sgt(9, 5));
  });
});

describe('runtime paths', () => {
  it('runtime data lives under KAMPUNG_HOME, default ~/.kampung, never the repo', () => {
    expect(kampungHome({})).toBe(join(homedir(), '.kampung'));
    expect(kampungHome({ KAMPUNG_HOME: '~/.kampung' })).toBe(join(homedir(), '.kampung'));
    expect(kampungHome({ KAMPUNG_HOME: '/srv/k' })).toBe('/srv/k');
    expect(dbPath('/srv/k')).toBe(join('/srv/k', 'kampung.db'));
  });
});
