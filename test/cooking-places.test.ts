import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { FIRE_MINUTES, KITCHEN_JOBS, PROJECT_JOBS_A_DAY } from '../src/sim/cooking.ts';
import { BRINGS } from '../src/sim/osman.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { MR_LIM_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const runTo = (w: World, t: number) => { while (w.t < t) advance(w); };
const verbs = (w: World, name: string) => availableActions(w, who(w, name)).map((a) => a.verb);
function until(w: World, name: string, limit = 120) {
  const r = who(w, name);
  for (let i = 0; i < limit && (r.activity || r.stove); i++) advance(w);
}

describe('a cooking pot (where cooking happens, 1)', () => {
  it('Pak Osman brings pots; a pot is not food, and it lasts', () => {
    expect(BRINGS).toContain('pot');
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.items = { pot: 1 };
    expectInWorld(refused(act(w, siti.id, { verb: 'eat', item: 'pot' })));
  });
});

describe('outdoor fires are real (1)', () => {
  it('a bundle of firewood lights a fire at the jetty; it burns about an hour, and only there', () => {
    const w = newWorld(14);
    const raju = put(w, 'Raju', 'jetty');
    raju.items = { firewood: 1 };
    expect(verbs(w, 'Raju')).toContain('light fire');
    expectInWorld(accepted(act(w, raju.id, { verb: 'light_fire' })).reply!);
    expect(raju.items.firewood ?? 0).toBe(0);
    expect(w.state.fires.length).toBe(1);
    put(w, 'Siti', 'jetty');
    expect(seen(w, 'Siti')).toMatch(/A cooking fire is burning here/);
    runTo(w, w.t + FIRE_MINUTES + 1);
    expect(w.state.fires.length).toBe(0);
    expect(seen(w, 'Siti')).not.toMatch(/fire is burning/);
  });

  it('on the beach too; not in the village, nor without firewood', () => {
    const w = newWorld(14);
    const raju = put(w, 'Raju', 'well');
    raju.items = { firewood: 1 };
    expect(verbs(w, 'Raju')).not.toContain('light fire');
    expectInWorld(refused(act(w, raju.id, { verb: 'light_fire' })));
    raju.pos = { x: 10, y: 22 };
    accepted(act(w, raju.id, { verb: 'light_fire' }));
    const kow = put(w, 'Ah Kow', 'jetty');
    kow.items = {};
    expectInWorld(refused(act(w, kow.id, { verb: 'light_fire' })));
  });

  it('anyone at it cooks from what they carry: grilled fish; bubur only with a pot, which they keep', () => {
    const w = newWorld(14);
    const raju = put(w, 'Raju', 'jetty');
    raju.items = { firewood: 1 };
    accepted(act(w, raju.id, { verb: 'light_fire' }));
    const siti = put(w, 'Siti', 'jetty');
    siti.items = { fish: 2, rice: 1, water: 1 };
    accepted(act(w, siti.id, { verb: 'cook', item: 'grilled fish' }));
    until(w, 'Siti');
    expect(siti.items['grilled fish']).toBe(2);
    expect(siti.items.fish ?? 0).toBe(0);
    expectInWorld(refused(act(w, siti.id, { verb: 'cook', item: 'bubur' }), /pot/));
    siti.items.pot = 1;
    accepted(act(w, siti.id, { verb: 'cook', item: 'bubur' }));
    until(w, 'Siti');
    expect(siti.items.bubur).toBe(2);
    expect(siti.items.pot).toBe(1);
  });

  it('with no fire burning, there is nothing to cook on (and the reply says how to get one)', () => {
    const w = newWorld(14);
    const siti = put(w, 'Siti', 'jetty');
    siti.items = { fish: 2 };
    const text = refused(act(w, siti.id, { verb: 'cook', item: 'grilled fish' }));
    expect(text).toMatch(/no fire/i);
    expect(text).toMatch(/firewood/);
    expectInWorld(text);
  });
});

describe('a shared village kitchen, built by Mr Lim through odd jobs (3)', () => {
  it('Mr Lim pins its jobs each morning beside the usual ones', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const jobs = w.state.oddJobs.filter((j) => j.day === dayIndex(w.t));
    expect(jobs.filter((j) => j.project === 'village-kitchen').length).toBe(PROJECT_JOBS_A_DAY);
    expect(jobs.filter((j) => j.project === null).length).toBeGreaterThanOrEqual(2);
    expect(w.state.notes.some((n) => n.authorId === MR_LIM_ID && /village kitchen/.test(n.text))).toBe(true);
  });

  it('before it is built, the site shows how it is coming on, and nobody can cook there', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'village-kitchen');
    siti.items = { fish: 2, firewood: 1 };
    expect(seen(w, 'Siti')).toMatch(/village kitchen is being built here/);
    expectInWorld(refused(act(w, siti.id, { verb: 'cook', item: 'grilled fish' })));
  });

  it('when every job is done it is built, Mr Lim says so, and anyone cooks there with their own food and fuel', () => {
    const w = newWorld(6, 0);
    const p = w.state.projects.find((x) => x.id === 'village-kitchen')!;
    p.done = KITCHEN_JOBS.map((_, i) => i).slice(0, -1);
    runTo(w, sgt(9, 0));
    const last = w.state.oddJobs.find((j) => j.project === 'village-kitchen' && j.doneBy === null)!;
    const kow = put(w, 'Ah Kow', last.placeId);
    accepted(act(w, kow.id, { verb: 'do_odd_job' }));
    until(w, 'Ah Kow');
    expect(p.builtDay).toBe(dayIndex(w.t));
    expect(w.state.notes.some((n) => n.authorId === MR_LIM_ID && /village kitchen is ready/i.test(n.text))).toBe(true);
    const siti = put(w, 'Siti', 'village-kitchen');
    siti.items = { rice: 1, water: 1 };
    expectInWorld(refused(act(w, siti.id, { verb: 'cook', item: 'bubur' }), /firewood or kerosene/));
    siti.items.firewood = 1;
    accepted(act(w, siti.id, { verb: 'cook', item: 'bubur' }));
    until(w, 'Siti');
    expect(siti.items.bubur).toBe(2);
    expect(siti.items.firewood ?? 0).toBe(0);
    // No more kitchen jobs once it's up.
    runTo(w, sgt(9, 0, 1));
    expect(w.state.oddJobs.some((j) => j.day === dayIndex(w.t) && j.project === 'village-kitchen')).toBe(false);
  });
});

describe('the upgrade (save v23)', () => {
  it('no fires; the kitchen not yet begun; old jobs belong to no building; those who know Mr Lim\'s house know where the kitchen goes', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 22)!;
    const world = {
      residents: [{ id: 'a', knownPlaces: ['house-1', 'village-head'] }, { id: 'b', knownPlaces: ['house-5'] }],
      oddJobs: [{ id: 1, kind: 'mend_jetty' }],
    };
    const up = step.save!({ world, brains: {} }).world as Record<string, unknown> & { residents: { knownPlaces: string[] }[] };
    expect(up.fires).toEqual([]);
    expect(up.projects).toEqual([{ id: 'village-kitchen', done: [], builtDay: null }]);
    expect(up.oddJobs).toEqual([{ id: 1, kind: 'mend_jetty', project: null }]);
    expect(up.residents[0]!.knownPlaces).toEqual(['house-1', 'village-head', 'village-kitchen']);
    expect(up.residents[1]!.knownPlaces).toEqual(['house-5']);
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});

describe('the watch page shows them', () => {
  it('a frame carries the fires burning and what is built', async () => {
    const { FrameBuilder } = await import('../src/watch/view.ts');
    const w = newWorld(14);
    const raju = put(w, 'Raju', 'jetty');
    raju.items = { firewood: 1 };
    accepted(act(w, raju.id, { verb: 'light_fire' }));
    let f = new FrameBuilder().build(w);
    expect(f.fires).toEqual([{ x: raju.pos.x, y: raju.pos.y }]);
    expect(f.built).toEqual([]);
    expect(f.building!['village-kitchen']).toMatch(/0 of 8/);
    w.state.projects[0]!.builtDay = dayIndex(w.t);
    f = new FrameBuilder().build(w);
    expect(f.built).toEqual(['village-kitchen']);
  });
});
