import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { projectKind } from '../src/sim/projects.ts';
import { dayIndex } from '../src/sim/time.ts';
import { QUIET_THINK_MINUTES, Town } from '../src/town.ts';
import { expectInWorld, put, sgt, who } from './helpers.ts';

// Kampung, 2026-10-30, from the live town: the schoolhouse stuck at 2 jobs of
// 12 and the village kitchen at 5 of 8. Their jobs are on site, and nothing
// ever brought anyone there; the idle nudge named the jetty and the farm first.
describe('an idle resident, with work for Mr Lim waiting somewhere they know', () => {
  async function town() {
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(14, 0) - 1;
    const town = Town.create(1, start, { brains: () => idle });
    const w = town.world;
    for (const r of w.state.residents) {
      r.thinkAt = start + 1000;
      r.lastDone = { what: 'fish', t: start };
    }
    const today = dayIndex(start);
    const huat = who(w, 'Ah Huat');
    // The usual jobs today are all taken; the schoolhouse's two are open.
    w.state.oddJobsDay = today;
    w.state.oddJobs = [
      { id: 9001, kind: 'sweep', placeId: 'jetty', pay: 50, day: today, doneBy: huat.id, noteId: 9101, project: null },
      { id: 9002, kind: projectKind('schoolhouse', 0), placeId: 'schoolhouse', pay: 50, day: today, doneBy: null, noteId: 9102, project: 'schoolhouse' },
      { id: 9003, kind: projectKind('schoolhouse', 3), placeId: 'schoolhouse', pay: 50, day: today, doneBy: null, noteId: 9102, project: 'schoolhouse' },
    ];
    const siti = put(w, 'Siti', 'well');
    if (!siti.knownPlaces.includes('schoolhouse')) siti.knownPlaces.push('schoolhouse');
    return { town, w, siti, start };
  }
  async function nudgeAt(t: Town, at: number, place = 'well') {
    put(t.world, 'Siti', place);
    who(t.world, 'Siti').thinkAt = at;
    await t.runUntil(at);
    return who(t.world, 'Siti').reply?.text ?? '';
  }

  it('is reminded of that place first, whatever the time', async () => {
    const { town: t, start } = await town();
    for (let k = 0; k < 6; k++) {
      const text = await nudgeAt(t, start + (3 + k) * QUIET_THINK_MINUTES);
      expect(text).toMatch(/^There's nothing more to do here\. You could walk to the schoolhouse, /);
      expectInWorld(text);
    }
  });

  it("ahead of the day's other jobs, and not while there's one to be had where they stand", async () => {
    const { town: t, w, start } = await town();
    w.state.oddJobs[0]!.doneBy = null;
    w.state.oddJobs.push({ id: 9004, kind: 'carry', placeId: 'lorry-stop', pay: 50, day: dayIndex(start), doneBy: null, noteId: 9104, project: null });
    for (let k = 0; k < 3; k++) {
      expect(await nudgeAt(t, start + (3 + k) * QUIET_THINK_MINUTES)).toMatch(/You could walk to the schoolhouse, the (lorry stop|jetty), the (lorry stop|jetty), the farm plot/);
    }
    who(w, 'Siti').reply = null;
    expect(await nudgeAt(t, start + 6 * QUIET_THINK_MINUTES, 'lorry-stop')).toBe('');
  });

  it('not once they have done a job for him today, nor where someone is already at it', async () => {
    const { town: t, w, siti, start } = await town();
    w.state.oddJobs[0]!.doneBy = siti.id;
    expect(await nudgeAt(t, start + 3 * QUIET_THINK_MINUTES)).toMatch(/You could walk to the farm plot, the jetty or /);
    w.state.oddJobs[0]!.doneBy = who(w, 'Ah Huat').id;
    for (const [i, name] of [[1, 'Raju'], [2, 'Ah Kow']] as const) {
      const o = put(w, name, 'schoolhouse');
      o.activity = { kind: 'chore', chore: 'odd_job', until: w.t + 600, job: w.state.oddJobs[i]!.id } as never;
    }
    expect(await nudgeAt(t, start + 4 * QUIET_THINK_MINUTES)).toMatch(/You could walk to the farm plot, the jetty or /);
  });

  it("not a place they don't know", async () => {
    const { town: t, siti, start } = await town();
    // Down at the jetty, out of sight of it.
    siti.knownPlaces = siti.knownPlaces.filter((p) => p !== 'schoolhouse');
    const text = await nudgeAt(t, start + 3 * QUIET_THINK_MINUTES, 'jetty');
    expect(siti.knownPlaces).not.toContain('schoolhouse');
    expect(text).toMatch(/You could walk to the farm plot or /);
    expect(text).not.toContain('schoolhouse');
  });
});
