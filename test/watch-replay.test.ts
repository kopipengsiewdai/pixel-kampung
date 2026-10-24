import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/mind/memory.ts';
import { Town } from '../src/town.ts';
import { ReplayReader, ReplayRecorder, recordTown } from '../src/watch/replay.ts';
import { sgt } from './helpers.ts';

const START = sgt(6, 0) - 1;
const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'kampung-replay-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function recordedTrial(minutes: number): Promise<string> {
  const path = join(tmp(), 'trial-test.db');
  const recorder = new ReplayRecorder(path, { seed: 42, label: 'test trial' });
  const town = Town.create(42, START, recordTown(recorder));
  await town.runUntil(START + minutes);
  recorder.close();
  return path;
}

describe('recording a trial', () => {
  it('saves a frame a minute and every event, and reads them back', async () => {
    const path = await recordedTrial(120);
    const r = new ReplayReader(path);
    const info = r.info();
    expect(info.hasFrames).toBe(true);
    expect(info.start).toBe(START);
    expect(info.end).toBe(START + 120);
    expect(info.label).toBe('test trial');
    expect(Object.values(info.names)).toContain('Siti');

    const f = r.frameAt(START + 60);
    expect(f.t).toBe(START + 60);
    expect(f.residents).toHaveLength(10);
    // Before the start: the first frame. After the end: the last.
    expect(r.frameAt(START - 100).t).toBe(START);
    expect(r.frameAt(START + 10_000).t).toBe(START + 120);

    const lines = r.feedBetween(START, START + 120);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.every((l) => l.t > START && l.t <= START + 120)).toBe(true);
    expect(lines.some((l) => /Dawn/.test(l.text))).toBe(true);
    // Seq order, nothing twice across adjacent windows.
    const a = r.feedBetween(START, START + 60);
    const b = r.feedBetween(START + 60, START + 120);
    expect([...a, ...b]).toEqual(lines);
    expect(r.feedUpTo(START + 120, 3)).toEqual(lines.slice(-3));
    r.close();
  });

  it('joins the routes of skipped minutes so walkers keep to the paths', async () => {
    const path = await recordedTrial(90);
    const r = new ReplayReader(path);
    const frames = r.framesBetween(START + 30, START + 40);
    expect(frames.map((f) => f.t)).toEqual(Array.from({ length: 10 }, (_, i) => START + 31 + i));
    r.close();
  });

  it('opens while the trial is still writing to it', async () => {
    const path = join(tmp(), 'trial-live.db');
    const recorder = new ReplayRecorder(path, { seed: 1, label: 'x' });
    const town = Town.create(1, START, recordTown(recorder));
    await town.runUntil(START + 10);
    const r = new ReplayReader(path);
    expect(r.info().end).toBe(START + 10);
    await town.runUntil(START + 20);
    expect(r.info().end).toBe(START + 20);
    r.close();
    recorder.close();
  });
});

describe("residents' thoughts in a replay", () => {
  it("come from the trial's memories, up to the minute being watched", async () => {
    const path = await recordedTrial(30);
    const mem = new MemoryStore(path);
    mem.add('siti', START + 5, 'plan', 'My plan for today: find work.');
    mem.add('siti', START + 10, 'thought', 'Maybe the kopitiam needs help.');
    mem.add('siti', START + 20, 'thought', 'Too late now.');
    mem.add('siti', START + 12, 'noticed', 'Ah Huat says: "Morning!"');
    mem.close();
    const r = new ReplayReader(path);
    expect(r.info().hasMemories).toBe(true);
    const ex = r.extras('siti', START + 15);
    expect(ex.plan?.text).toBe('find work.');
    expect(ex.thoughts.map((x) => x.text)).toEqual(['Maybe the kopitiam needs help.']);
    expect(ex.noticed.map((x) => x.text)).toEqual(['Ah Huat says: "Morning!"']);
    expect(ex.mindNote).toBeNull();
    const fake = r.extras('ah-huat', START + 15);
    expect(fake.thoughts).toEqual([]);
    expect(fake.mindNote).toMatch(/no thoughts/i);
    r.close();
  });

  it('replay a trial recorded before movements were saved as thoughts only', () => {
    const path = join(tmp(), 'trial-old.db');
    const mem = new MemoryStore(path);
    mem.add('siti', START + 61, 'plan', 'My plan for today: fish.');
    mem.add('siti', START + 70, 'thought', 'The sea is calm.');
    mem.add('rahim', START + 75, 'did', 'You set off for the jetty.');
    mem.add('rahim', START + 200, 'reflection', 'A slow day at the stall.');
    mem.close();
    const r = new ReplayReader(path);
    const info = r.info();
    expect(info.hasFrames).toBe(false);
    expect(info.start).toBe(START + 60);
    expect(info.end).toBe(START + 200);
    expect(info.names.siti).toBe('Siti');
    // Everyone at home, as the trial started.
    const f = r.frameAt(START + 100);
    expect(f.t).toBe(START + 100);
    const siti = f.residents.find((x) => x.id === 'siti')!;
    const home = f.residents.find((x) => x.id === 'siti')!.homeId;
    expect(home).toMatch(/^house-/);
    expect(siti.doing).toMatch(/not recorded/);
    const feed = r.feedBetween(START, START + 200).map((l) => l.text);
    expect(feed).toEqual([
      'Siti plans: "fish."',
      'Siti thinks: "The sea is calm."',
      'Rahim looks back on the day: "A slow day at the stall."',
    ]);
    r.close();
  });
});
