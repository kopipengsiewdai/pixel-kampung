import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { weekdayAt } from '../src/sim/calendar.ts';
import { distance, PLACE_BY_ID } from '../src/sim/map.ts';
import { PROJECTS } from '../src/sim/projects.ts';
import { CLASS_FEE, SCHOOL_ID, schoolOpen, TEACHER, TEACHER_ID, teacherAt } from '../src/sim/school.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { skillLevel, threshold } from '../src/sim/skills.ts';
import { MR_LIM_ID, OUTSIDE, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex, minuteOfDay } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const runTo = (w: World, t: number) => { while (w.t < t) advance(w); };
const built = (w: World) => { w.state.projects.find((p) => p.id === SCHOOL_ID)!.builtDay = dayIndex(w.t) - 1; };

describe('building the schoolhouse (school.md Q1)', () => {
  it('Mr Lim has it built through about twelve odd jobs, pinned beside the others; it opens when they are done', () => {
    expect(PROJECTS[SCHOOL_ID]!.jobs.length).toBe(12);
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const jobs = w.state.oddJobs.filter((j) => j.day === dayIndex(w.t) && j.project === SCHOOL_ID);
    expect(jobs.length).toBe(2);
    expect(schoolOpen(w)).toBe(false);
    expect(PROJECTS[SCHOOL_ID]!.ready).toMatch(/school/i);
    expectInWorld(PROJECTS[SCHOOL_ID]!.ready);
  });

  it('the schoolhouse is a place near the village head\'s house', () => {
    const p = PLACE_BY_ID.get(SCHOOL_ID)!;
    expect(distance(p.spot, PLACE_BY_ID.get('village-head')!.spot)).toBeLessThanOrEqual(12);
  });
});

describe('Miss de Souza, the teacher (village character)', () => {
  it('comes on weekdays once the school is open, from before eight until after the evening class; never otherwise', () => {
    const w = newWorld(6, 0);
    const tue = sgt(10, 0, 1);
    expect(weekdayAt(w.state, tue)).toBe('Tuesday');
    expect(teacherAt(w, tue).out).toBe(false);
    built(w);
    expect(teacherAt(w, tue)).toMatchObject({ out: true });
    expect(distance(teacherAt(w, tue).pos, PLACE_BY_ID.get(SCHOOL_ID)!.spot)).toBeLessThanOrEqual(1);
    expect(teacherAt(w, sgt(19, 30, 1)).out).toBe(true);
    expect(teacherAt(w, sgt(22, 0, 1)).out).toBe(false);
    expect(teacherAt(w, sgt(10, 0, 5)).out).toBe(false);
    expect(weekdayAt(w.state, sgt(10, 0, 5))).toBe('Saturday');
    expect(OUTSIDE.has(TEACHER_ID)).toBe(true);
    expect(w.nameOf(TEACHER_ID)).toBe(TEACHER);
  });
});

describe('children go to school on weekday mornings (Q2)', () => {
  it('sent off, busy there from eight to twelve, and learning English', () => {
    const w = newWorld(7, 0);
    built(w);
    const hassan = who(w, 'Hassan');
    hassan.hunger = 100;
    runTo(w, sgt(9, 0));
    expect(hassan.activity?.kind).toBe('school');
    expect(w.isAt(hassan, SCHOOL_ID)).toBe(true);
    expectInWorld(refused(act(w, hassan.id, { verb: 'fish' })));
    runTo(w, sgt(12, 5));
    expect(hassan.activity?.kind === 'school').toBe(false);
    expect(hassan.skills.english?.xp ?? 0).toBeGreaterThan(0);
  });

  it('not when ill, not at weekends, not before the school is built; grown-ups are not sent', () => {
    const w = newWorld(7, 0);
    const aminah = who(w, 'Aminah');
    runTo(w, sgt(9, 0));
    expect(aminah.activity?.kind === 'school').toBe(false);
    built(w);
    runTo(w, sgt(7, 0, 1));
    aminah.ill = { since: w.t, better: null };
    aminah.hunger = 1000;
    runTo(w, sgt(9, 0, 1));
    expect(aminah.activity?.kind === 'school').toBe(false);
    expect(who(w, 'Siti').activity?.kind === 'school').toBe(false);
    aminah.ill = null;
    runTo(w, sgt(9, 0, 5));
    expect(weekdayAt(w.state, w.t)).toBe('Saturday');
    expect(aminah.activity?.kind === 'school').toBe(false);
  });
});

describe('the evening class for grown-ups (Q2)', () => {
  it('at seven on a weekday, five cents to the teacher, an hour of English', () => {
    const w = newWorld(18, 50);
    built(w);
    const siti = put(w, 'Siti', SCHOOL_ID);
    siti.money = 100;
    siti.hunger = 100;
    expect(availableActions(w, siti).map((a) => a.verb)).toContain('join english class');
    w.takeLedger();
    expectInWorld(accepted(act(w, siti.id, { verb: 'join_english_class' })).reply!);
    expect(siti.money).toBe(100 - CLASS_FEE);
    expect(w.takeLedger().some((l) => l.from === siti.id && l.to === TEACHER_ID && l.cents === CLASS_FEE)).toBe(true);
    runTo(w, sgt(20, 5));
    expect(siti.activity?.kind === 'school').toBe(false);
    expect(siti.skills.english?.xp ?? 0).toBeGreaterThan(0);
    expect(minuteOfDay(w.t)).toBe(20 * 60 + 5);
  });

  it('not without five cents, not out of hours', () => {
    const w = newWorld(18, 50);
    built(w);
    const raju = put(w, 'Raju', SCHOOL_ID);
    raju.money = 2;
    expectInWorld(refused(act(w, raju.id, { verb: 'join_english_class' })));
    const w2 = newWorld(14, 0);
    built(w2);
    const siti = put(w2, 'Siti', SCHOOL_ID);
    expect(availableActions(w2, siti).map((a) => a.verb)).not.toContain('join english class');
  });
});

describe('English, a skill (Q2, Q3)', () => {
  it('those with some English already start Handy; the rest know none yet', () => {
    const w = newWorld(9);
    for (const name of ['Mei Ling', 'Ah Seng', 'Raju']) expect(skillLevel(who(w, name), 'english'), name).toBe(2);
    expect(skillLevel(who(w, 'Siti'), 'english')).toBe(1);
  });

  it('shows in their own words as they learn', () => {
    const w = newWorld(9);
    expect(seen(w, 'Mei Ling')).toMatch(/a few words of English/);
    who(w, 'Mei Ling').skills.english!.xp = threshold('english', 3);
    expect(seen(w, 'Mei Ling')).toMatch(/enough English to get by/);
  });

  it('talking with someone who has more English teaches a little', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    put(w, 'Raju', 'well');
    accepted(act(w, siti.id, { verb: 'say', to: 'Raju', text: 'Good morning, Raju. How are the nets today?' }));
    expect(siti.skills.english?.xp ?? 0).toBeGreaterThan(0);
  });

  it('it pays: Pak Osman cannot haggle a reader so hard', async () => {
    const { priceFor } = await import('../src/sim/osman.ts');
    const w = newWorld(6, 0);
    while (!w.state.osman.visit) advance(w);
    const siti = put(w, 'Siti', 'lorry-stop');
    const plain = priceFor(w, siti, 'sells', 'rice')!;
    siti.skills.english = { xp: threshold('english', 2), peak: 2, lastDay: dayIndex(w.t), today: { day: dayIndex(w.t), xp: 0 }, rusty: false, drops: 0 };
    expect(priceFor(w, siti, 'sells', 'rice')!).toBeLessThanOrEqual(plain);
  });

  it('it pays: Mr Lim wants his ledger kept by someone with good English, for a dollar', () => {
    const w = newWorld(6, 0);
    who(w, 'Mei Ling').skills.english!.xp = threshold('english', 3);
    runTo(w, sgt(9, 0));
    const ledger = w.state.oddJobs.find((j) => j.day === dayIndex(w.t) && j.kind === 'keep_ledger')!;
    expect(ledger.pay).toBe(100);
    const siti = put(w, 'Siti', ledger.placeId);
    expect(availableActions(w, siti).map((a) => a.verb)).not.toContain('do odd job');
    const mei = put(w, 'Mei Ling', ledger.placeId);
    expect(availableActions(w, mei).map((a) => a.verb)).toContain('do odd job');
    void MR_LIM_ID;
  });
});

describe('parents and Mr Lim urge it (Q3)', () => {
  it('Fatimah wants her children to learn English', async () => {
    const { CARDS } = await import('../src/seed/cards.ts');
    expect(CARDS.find((c) => c.name === 'Fatimah')!.want).toMatch(/English/);
  });
});

describe('the upgrade (save v24)', () => {
  it('the schoolhouse not begun; those with some English start Handy; those who know Mr Lim\'s house know where the school goes', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 23)!;
    const world = {
      t: 1000 * 1440,
      projects: [{ id: 'village-kitchen', done: [1], builtDay: null }],
      residents: [
        { id: 'raju', knownPlaces: ['house-1', 'village-head'], skills: {} },
        { id: 'siti', knownPlaces: ['house-2'], skills: { fishing: { xp: 5 } } },
      ],
    };
    const up = step.save!({ world, brains: {} }).world as Record<string, unknown> & { residents: { knownPlaces: string[]; skills: Record<string, unknown> }[] };
    expect(up.projects).toEqual([{ id: 'village-kitchen', done: [1], builtDay: null }, { id: 'schoolhouse', done: [], builtDay: null }]);
    expect(up.residents[0]!.knownPlaces).toContain('schoolhouse');
    expect(up.residents[0]!.skills.english).toBeTruthy();
    expect(up.residents[1]!.skills).toEqual({ fishing: { xp: 5 } });
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});

describe('review fixes', () => {
  it('in the town, children sent to school start lessons as they arrive, with no thought on the way, and stay', async () => {
    const { Town } = await import('../src/town.ts');
    const thoughts: number[] = [];
    let w0: World | null = null;
    const brain = { decide: () => { thoughts.push(minuteOfDay(w0!.t)); return { verb: 'walk_to', where: 'the jetty' }; }, save: () => null, load: () => {} };
    const idle = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(7, 30) - 1;
    const town = Town.create(1, start, { brains: (r: { name: string }) => (r.name === 'Hassan' ? brain : idle) });
    const w = town.world;
    w0 = w;
    built(w);
    const hassan = who(w, 'Hassan');
    hassan.hunger = 100;
    hassan.thinkAt = start + 1000;
    await town.runUntil(sgt(9, 0));
    expect(hassan.activity?.kind).toBe('school');
    // No thought from being sent off until lessons are over.
    expect(thoughts.filter((m) => m >= 7 * 60 + 40)).toEqual([]);
  });

  it('busy at 7:40 (a nap, a chore), they are sent once free; a starving child is not sent, and one who grows faint goes home', () => {
    const w = newWorld(7, 30);
    built(w);
    const aminah = who(w, 'Aminah');
    aminah.activity = { kind: 'sleeping', reason: 'nap', until: sgt(7, 50) };
    aminah.energy = 900;
    runTo(w, sgt(8, 30));
    expect(aminah.activity?.kind).toBe('school');
    const hassan = who(w, 'Hassan');
    aminah.hunger = 960;
    advance(w);
    expect((aminah.activity as { kind: string } | null)?.kind === 'school').toBe(false);
    void hassan;
  });

  it('the ledger goes to whoever can keep it, before the path job at the same door; not to a child', () => {
    const w = newWorld(6, 0);
    who(w, 'Mei Ling').skills.english!.xp = threshold('english', 3);
    who(w, 'Aminah').skills.english = { xp: threshold('english', 4), peak: 4, lastDay: 0, today: { day: 0, xp: 0 }, rusty: false, drops: 0 };
    for (let seed = 0; seed < 1; seed++) runTo(w, sgt(9, 0));
    const mei = put(w, 'Mei Ling', 'village-head');
    const says = availableActions(w, mei).find((a) => a.verb === 'do odd job')?.says ?? '';
    expect(says).toMatch(/ledger/);
    const aminah = put(w, 'Aminah', 'village-head');
    expect(availableActions(w, aminah).find((a) => a.verb === 'do odd job')?.says ?? '').not.toMatch(/ledger/);
  });

  it('talk teaches a little English, only when it is in English, and only a little a day', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    put(w, 'Raju', 'well');
    accepted(act(w, siti.id, { verb: 'say', to: 'Raju', text: 'Raju, sudah makan ke belum? Saya lapar sangat.' }));
    expect(siti.skills.english?.xp ?? 0).toBe(0);
    const lines = ['Good day Raju, did the boats come in early?', 'How is your cousin Muthu these days?', 'Will the lorry bring kerosene tomorrow?'];
    for (const l of lines) {
      accepted(act(w, siti.id, { verb: 'say', to: 'Raju', text: l }));
      accepted(act(w, who(w, 'Raju').id, { verb: 'say', to: 'Siti', text: 'Yes, I think so.' }));
      w.state.t += 1;
    }
    expect(siti.skills.english!.xp).toBe(2);
  });

  it('English can be named for teaching', async () => {
    const { skillOf } = await import('../src/sim/skills.ts');
    expect(skillOf('English')).toBe('english');
    expect(skillOf('how to speak English')).toBe('english');
  });

  it('Mr Lim pins a building\'s jobs on one note, so the board keeps room', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const lim = w.state.notes.filter((n) => n.authorId === MR_LIM_ID);
    expect(lim.filter((n) => /^Wanted, for the schoolhouse/.test(n.text)).length).toBe(1);
    expect(lim.length).toBeLessThanOrEqual(6);
  });
});
