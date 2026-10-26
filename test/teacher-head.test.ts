import { describe, expect, it } from 'vitest';
import { ANSWERS_A_DAY, SCHOOL_ID, TEACHER_CALLS_A_DAY, teacherThinks, type TeacherHead } from '../src/sim/school.ts';
import { threshold } from '../src/sim/skills.ts';
import { TRAVELLERS_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const built = (w: World) => { w.state.projects.find((p) => p.id === SCHOOL_ID)!.builtDay = dayIndex(w.t) - 1; };

/** A head that answers in a fixed voice, counting its calls. */
function fakeHead() {
  const calls: string[] = [];
  const head: TeacherHead = { speak: async (b) => { calls.push(b.moment); return `(${b.moment}) Very good, ${b.asker ?? 'class'}.`; } };
  return { head, calls };
}

describe("Miss de Souza's head (school.md: a few cheap lines a weekday)", () => {
  it('opens the morning lessons with a word to the children there; scripted with no head', async () => {
    const w = newWorld(7, 59);
    built(w);
    const hassan = put(w, 'Hassan', SCHOOL_ID);
    hassan.activity = { kind: 'school', until: sgt(12, 0), adult: false, learnt: 0 };
    advance(w);
    await teacherThinks(w, null, 0);
    const heard = hassan.recent.find((o) => /Miss de Souza says/.test(o.text))!;
    expect(heard).toBeTruthy();
    expectInWorld(heard.text);
    await teacherThinks(w, null, 0);
    expect(hassan.recent.filter((o) => /Miss de Souza says/.test(o.text)).length).toBe(1);
  });

  it('those who speak to her at the schoolhouse are answered, by her head while it has calls left today; twice a day each, then she has lessons to see to', async () => {
    const w = newWorld(9);
    built(w);
    const { head, calls } = fakeHead();
    const people = ['Siti', 'Raju', 'Fatimah'].map((n) => put(w, n, SCHOOL_ID));
    for (let k = 0; k < ANSWERS_A_DAY; k++) {
      for (const r of people) accepted(act(w, r.id, { verb: 'say', to: 'Miss de Souza', text: `Cikgu, a question from ${r.name} (${k})` }));
      await teacherThinks(w, head, 0);
      w.state.t += 1;
    }
    for (const r of people) {
      const answers = r.recent.filter((o) => /^Miss de Souza says to you: /.test(o.text));
      expect(answers.length, r.name).toBe(ANSWERS_A_DAY);
      for (const a of answers) expectInWorld(a.text);
    }
    expect(calls.length).toBe(TEACHER_CALLS_A_DAY);
    expect(refused(act(w, people[0]!.id, { verb: 'say', to: 'Miss de Souza', text: 'One more?' }))).toMatch(/lessons to see to/);
  });

  it('an answer wakes only the one spoken to; the others there overhear', async () => {
    const w = newWorld(9);
    built(w);
    const siti = put(w, 'Siti', SCHOOL_ID);
    const fatimah = put(w, 'Fatimah', SCHOOL_ID);
    fatimah.thinkAt = w.t + 500;
    siti.thinkAt = w.t + 500;
    accepted(act(w, siti.id, { verb: 'say', to: 'Miss de Souza', text: 'Good morning, cikgu.' }));
    await teacherThinks(w, null, 0);
    expect(siti.thinkAt).toBeLessThanOrEqual(w.t + 1);
    expect(fatimah.thinkAt).toBe(w.t + 500);
    expect(fatimah.recent.some((o) => /Miss de Souza says to Siti/.test(o.text))).toBe(true);
  });

  it('known by the names people use', async () => {
    const { meansTeacher } = await import('../src/sim/school.ts');
    for (const n of ['Miss de Souza', 'Miss de Souza.', 'Cikgu de Souza', 'Ms de Souza', 'Mrs de Souza', 'the teacher', 'cikgu', 'De Souza']) expect(meansTeacher(n), n).toBe(true);
    for (const n of ['Siti', 'Mak', 'Mr Lim', 'Missy']) expect(meansTeacher(n), n).toBe(false);
  });

  it('she is not to be spoken to where she is not', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    expectInWorld(refused(act(w, siti.id, { verb: 'say', to: 'Miss de Souza', text: 'Hello?' })));
  });
});

describe("travellers pay a little more where they're served in English (school.md Q4)", () => {
  it('a server with some English brings in a little extra on each sale', () => {
    const w = newWorld(6, 29);
    put(w, 'Ah Huat', 'kopitiam');
    w.takeLedger();
    for (let i = 0; i < 40; i++) advance(w);
    const before = w.takeLedger().filter((l) => l.from === TRAVELLERS_ID);
    const w2 = newWorld(6, 29);
    const huat2 = put(w2, 'Ah Huat', 'kopitiam');
    huat2.skills.english = { xp: threshold('english', 2), peak: 2, lastDay: 0, today: { day: 0, xp: 0 }, rusty: false, drops: 0 };
    w2.takeLedger();
    for (let i = 0; i < 40; i++) advance(w2);
    const after = w2.takeLedger().filter((l) => l.from === TRAVELLERS_ID);
    const sum = (ls: { cents: number }[]) => ls.reduce((n, l) => n + l.cents, 0);
    expect(sum(after)).toBeGreaterThan(sum(before));
    // About a tenth: never more than a tenth of what was sold, rounded.
    expect(sum(after) - sum(before)).toBeLessThanOrEqual(Math.round(sum(before) / 10) + before.length);
  });
});

describe('her head on the model', () => {
  it('speaks within the day\'s cap, counted in the cost log; with the cap spent, nothing (she falls back on her own words)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { CostLog } = await import('../src/mind/cost-log.ts');
    const { ModelTeacherHead } = await import('../src/mind/teacher-head.ts');
    const dir = mkdtempSync(join(tmpdir(), 'kampung-teacher-'));
    try {
      const costs = new CostLog(dir);
      let calls = 0;
      const client = { think: async () => { calls++; return { model: 'm', text: '', toolCall: { name: 'speak', input: { words: 'Good morning, children!' } }, usage: { input_tokens: 100, output_tokens: 10 }, attempts: [{ model: 'm', usage: { input_tokens: 100, output_tokens: 10 } }], refused: false }; } };
      const head = new ModelTeacherHead({ client, costs });
      expect(await head.speak({ moment: 'morning', pupils: ['Hassan'] }, { t: 0, realMs: 0 })).toBe('Good morning, children!');
      expect(calls).toBe(1);
      // A restart: a new head, the same day, finds her calls in the log.
      for (let i = 0; i < 3; i++) await head.speak({ moment: 'answer', pupils: [], asker: 'Siti', said: 'Hello' }, { t: 0, realMs: 0 });
      expect(calls).toBe(4);
      const again = new ModelTeacherHead({ client, costs });
      expect(await again.speak({ moment: 'answer', pupils: [], asker: 'Siti', said: 'Hello' }, { t: 0, realMs: 0 })).toBeNull();
      expect(calls).toBe(4);
      // Nothing of the machinery reaches the kampung.
      const odd = new ModelTeacherHead({ client: { think: async () => ({ model: 'm', text: '', toolCall: { name: 'speak', input: { words: 'As an AI model, I cannot.' } }, usage: { input_tokens: 1, output_tokens: 1 }, attempts: [], refused: false }) }, costs: new CostLog(null) });
      expect(await odd.speak({ moment: 'morning', pupils: [] }, { t: 0, realMs: 0 })).toBeNull();
      costs.add({ t: 2000, realMs: 0, resident: 'x', kind: 'act', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: 1000 });
      expect(await new ModelTeacherHead({ client, costs }).speak({ moment: 'morning', pupils: ['Hassan'] }, { t: 2000, realMs: 0 })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
