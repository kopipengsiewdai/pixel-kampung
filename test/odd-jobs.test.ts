import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { readNoticeBoard } from '../src/sim/actions/everyone.ts';
import { PLACE_BY_ID, distance, inPlace } from '../src/sim/map.ts';
import { mrLimAt, ODD_JOB_MINUTES, ODD_JOB_PAY, PIN_FROM } from '../src/sim/mr-lim.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { MR_LIM_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex, minuteOfDay } from '../src/sim/time.ts';
import { weekdayAt } from '../src/sim/calendar.ts';
import { feedLine } from '../src/feed/feed.ts';
import { FrameBuilder } from '../src/watch/view.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const runTo = (w: World, t: number) => { while (w.t < t) advance(w); };
/** Today's usual odd jobs (not those toward something being built). */
const today = (w: World) => w.state.oddJobs.filter((j) => j.day === dayIndex(w.t) && j.project === null);

describe("Mr Lim's day: a scripted body (village-characters.md, subsistence.md Q3.1)", () => {
  it('indoors at night, at his door by day, out to the notice board in the morning', () => {
    const w = newWorld(3);
    expect(mrLimAt(w, w.t).out).toBe(false);
    const door = PLACE_BY_ID.get('village-head')!;
    // A Tuesday, mid-afternoon: at his door.
    const tue = sgt(15, 0, 1);
    expect(weekdayAt(w.state, tue)).toBe('Tuesday');
    const at = mrLimAt(w, tue);
    expect(at.out).toBe(true);
    expect(distance(at.pos, door.spot)).toBeLessThanOrEqual(1);
    expect(at.doing).toBe('at his door');
    // Some time after he sets out, he's at the board pinning.
    const board = PLACE_BY_ID.get('notice-board')!;
    const times = Array.from({ length: 60 }, (_, i) => sgt(7, 0, 1) + PIN_FROM - 7 * 60 + i);
    expect(times.some((t) => inPlace(board, mrLimAt(w, t).pos) && /pinning/.test(mrLimAt(w, t).doing))).toBe(true);
    expect(mrLimAt(w, sgt(23, 0, 1)).out).toBe(false);
  });

  it('on Monday morning he goes round the houses for the rent, past each one', () => {
    const w = newWorld(3);
    const mon = sgt(9, 0, 7);
    expect(weekdayAt(w.state, mon)).toBe('Monday');
    const passed = new Set<string>();
    for (let t = mon; t < mon + 120; t++) {
      const at = mrLimAt(w, t);
      if (/round/.test(at.doing)) for (let n = 1; n <= 10; n++) if (Math.abs(at.pos.x - PLACE_BY_ID.get(`house-${n}`)!.spot.x) <= 1 && Math.abs(at.pos.y - PLACE_BY_ID.get(`house-${n}`)!.spot.y) <= 2) passed.add(`house-${n}`);
    }
    expect(passed.size).toBe(10);
    expect(distance(mrLimAt(w, mon + 180).pos, PLACE_BY_ID.get('village-head')!.spot)).toBeLessThanOrEqual(1);
  });
});

describe("Mr Lim's odd jobs", () => {
  it('each morning he pins two or three on the board, at different places, about 50¢ each', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const jobs = today(w);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs.length).toBeLessThanOrEqual(3);
    expect(new Set(jobs.map((j) => j.placeId)).size).toBe(jobs.length);
    for (const j of jobs) expect(j.pay).toBe(ODD_JOB_PAY);
    const notes = w.state.notes.filter((n) => n.authorId === MR_LIM_ID && /^Wanted: /.test(n.text));
    expect(notes.length).toBe(jobs.length);
    const events: string[] = [];
    // The board reads them as Mr Lim's.
    const siti = put(w, 'Siti', 'notice-board');
    const read = accepted(readNoticeBoard(w, siti)).reply!;
    expect(read).toMatch(/\(Mr Lim\)/);
    expectInWorld(read);
    void events;
  });

  it('the next morning the old ones come down and new ones go up', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const first = today(w).map((j) => j.id);
    runTo(w, sgt(9, 0, 1));
    expect(today(w).every((j) => !first.includes(j.id))).toBe(true);
    expect(w.state.oddJobs.some((j) => first.includes(j.id) && j.doneBy === null)).toBe(false);
    expect(w.state.notes.filter((n) => n.authorId === MR_LIM_ID && /^Wanted/.test(n.text)).length).toBe(new Set(w.state.oddJobs.filter((j) => j.day === dayIndex(w.t)).map((j) => j.noteId)).size);
  });

  it('done at its place as an hour\'s chore, paid from Mr Lim\'s purse, at most one a day each', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const [job, other] = today(w);
    const siti = put(w, 'Siti', job!.placeId);
    siti.hunger = 100;
    const before = siti.money;
    expect(availableActions(w, siti).map((a) => a.verb)).toContain('do odd job');
    const res = accepted(act(w, siti.id, { verb: 'do_odd_job' }));
    expectInWorld(res.reply!);
    // Someone else can't take the one she's doing.
    const raju = put(w, 'Raju', job!.placeId);
    expectInWorld(refused(act(w, raju.id, { verb: 'do_odd_job' })));
    w.takeLedger();
    for (let i = 0; i < ODD_JOB_MINUTES + 1 && siti.activity; i++) advance(w);
    expect(siti.activity).toBeNull();
    expect(siti.money).toBe(before + ODD_JOB_PAY);
    expect(w.takeLedger().some((l) => l.from === MR_LIM_ID && l.to === siti.id && l.cents === ODD_JOB_PAY)).toBe(true);
    expect(w.state.oddJobs.find((j) => j.id === job!.id)!.doneBy).toBe(siti.id);
    expect(w.state.notes.some((n) => n.authorId === MR_LIM_ID && n.id === job!.noteId)).toBe(false);
    expect(siti.recent.some((o) => /Mr Lim/.test(o.text) && /50¢/.test(o.text))).toBe(true);
    // One a day each.
    put(w, 'Siti', other!.placeId);
    expect(availableActions(w, siti).map((a) => a.verb)).not.toContain('do odd job');
    expectInWorld(refused(act(w, siti.id, { verb: 'do_odd_job' })));
  });

  it('cut short (night falls), it is nobody\'s and unpaid; anyone can take it up again', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const [job] = today(w);
    const siti = put(w, 'Siti', job!.placeId);
    const before = siti.money;
    accepted(act(w, siti.id, { verb: 'do_odd_job' }));
    siti.activity = null;
    expect(siti.money).toBe(before);
    const raju = put(w, 'Raju', job!.placeId);
    accepted(act(w, raju.id, { verb: 'do_odd_job' }));
  });

  it('too ill, they cannot', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const [job] = today(w);
    const siti = put(w, 'Siti', job!.placeId);
    siti.ill = { since: w.t, better: null };
    expect(availableActions(w, siti).map((a) => a.verb)).not.toContain('do odd job');
    expectInWorld(refused(act(w, siti.id, { verb: 'do_odd_job' })));
  });

  it('seen where it is, and Mr Lim seen when he is near', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(10, 0, 1));
    const [job] = today(w);
    put(w, 'Siti', job!.placeId);
    const s = seen(w, 'Siti');
    expect(s).toMatch(/Mr Lim wants someone to .+ here: 50¢ for an hour's work\./);
    put(w, 'Raju', 'village-head');
    expect(seen(w, 'Raju')).toMatch(/Mr Lim, the village head, is here, at his door\./);
    for (const line of [...s.split('\n'), ...seen(w, 'Raju').split('\n')]) expectInWorld(line);
  });

  it('the feed names him, and tells of a job done', () => {
    const name = (id: string) => (id === MR_LIM_ID ? 'Mr Lim' : id === 'siti' ? 'Siti' : id);
    expect(feedLine({ seq: 1, t: 0, type: 'note_pinned', who: MR_LIM_ID, text: 'Odd job.' }, name)!.text).toMatch(/^Mr Lim pinned a note/);
    const done = feedLine({ seq: 2, t: 0, type: 'odd_job_done', who: 'siti', what: 'mend the jetty planks', cents: 50 }, name)!;
    expect(done.text).toBe('Siti did an odd job for Mr Lim (mend the jetty planks), for 50¢.');
  });
});

describe('the watch page shows him', () => {
  it('a frame carries Mr Lim when he is out, with where he is and what he is doing; not at night', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(10, 0, 1));
    const f = new FrameBuilder().build(w);
    const lim = f.villagers!.find((v) => v.id === MR_LIM_ID)!;
    expect(lim).toMatchObject({ name: 'Mr Lim', out: true, doing: 'at his door' });
    expect(lim.jobs.length).toBeGreaterThan(0);
    runTo(w, sgt(23, 30, 1));
    expect(new FrameBuilder().build(w).villagers!.find((v) => v.id === MR_LIM_ID)!.out).toBe(false);
    expect(minuteOfDay(w.t)).toBe(23 * 60 + 30);
  });
});

describe('the upgrade (save v21)', () => {
  it('no odd jobs yet; anyone at a chore is at no odd job', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 20)!;
    const world = { residents: [{ id: 'a', activity: { kind: 'chore', chore: 'sweep', until: 5 } }, { id: 'b', activity: null }] };
    const up = step.save!({ world, brains: {} }).world as { residents: { activity: Record<string, unknown> | null }[]; oddJobs: unknown[]; oddJobsDay: unknown };
    expect(up.oddJobs).toEqual([]);
    expect(up.oddJobsDay).toBe(-1);
    expect(up.residents[0]!.activity).toEqual({ kind: 'chore', chore: 'sweep', until: 5, job: null });
    expect(up.residents[1]!.activity).toBeNull();
  });
});

describe('review fixes', () => {
  it('Mr Lim can be named: he is busy, in-world, and that ends the thought', async () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(10, 0, 1));
    const raju = put(w, 'Raju', 'village-head');
    const text = refused(act(w, raju.id, { verb: 'say', to: 'Mr Lim', text: 'Good morning, Mr Lim.' }));
    expect(text).toMatch(/^Mr Lim nods/);
    expect(text).not.toMatch(/nobody by that name/);
    expectInWorld(text);
  });

  it('when the day turns, yesterday\'s open job notes come down', () => {
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    expect(w.state.notes.some((n) => n.authorId === MR_LIM_ID && /^Wanted/.test(n.text))).toBe(true);
    runTo(w, sgt(0, 5, 1));
    expect(w.state.notes.some((n) => n.authorId === MR_LIM_ID && /^Wanted/.test(n.text))).toBe(false);
  });

  it('the money views count odd-job pay', async () => {
    const { economyOf, moneyOf } = await import('../src/watch/wiki.ts');
    const w = newWorld(6, 0);
    runTo(w, sgt(9, 0));
    const [job] = today(w);
    const siti = put(w, 'Siti', job!.placeId);
    const events: import('../src/sim/events.ts').GameEvent[] = [];
    accepted(act(w, siti.id, { verb: 'do_odd_job' }));
    for (let i = 0; i < 61 && siti.activity; i++) { advance(w); events.push(...w.takeEvents()); }
    const e = economyOf(events, { t: w.t, residents: w.state.residents.map((r) => ({ id: r.id, name: r.name, money: r.money, job: null })) }, { calendar: w.state.calendar }, {});
    expect(e.income.find((x) => x.name === 'Siti')?.cents).toBe(ODD_JOB_PAY);
    const m = moneyOf(siti.id, events, { t: w.t, people: w.state.residents.map((r) => ({ id: r.id, name: r.name })), shops: [] }, { calendar: w.state.calendar })!;
    expect(JSON.stringify(m)).toMatch(/Mr Lim/);
  });
});
