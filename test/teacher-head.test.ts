import { describe, expect, it } from 'vitest';
import { SCHOOL_ID, TEACHER_CALLS_A_DAY, TEACHER_ID, teacherThinks, type TeacherHead } from '../src/sim/school.ts';
import { threshold } from '../src/sim/skills.ts';
import { TRAVELLERS_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const built = (w: World) => { w.state.projects.find((p) => p.id === SCHOOL_ID)!.builtDay = dayIndex(w.t) - 1; };
const at = (w: World) => ({ t: w.t, realMs: 0 });

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

  it('a resident who speaks to her at the schoolhouse is answered, by her head while it has calls left today', async () => {
    const w = newWorld(9);
    built(w);
    const { head, calls } = fakeHead();
    const siti = put(w, 'Siti', SCHOOL_ID);
    for (let i = 0; i < TEACHER_CALLS_A_DAY + 1; i++) {
      accepted(act(w, siti.id, { verb: 'say', to: 'Miss de Souza', text: `Cikgu, can my mother come to class? (${i})` }));
      await teacherThinks(w, head, 0);
      w.state.t += 1;
    }
    const answers = siti.recent.filter((o) => /^Miss de Souza says to you: /.test(o.text));
    expect(answers.length).toBe(TEACHER_CALLS_A_DAY + 1);
    expect(calls.length).toBe(TEACHER_CALLS_A_DAY);
    for (const a of answers) expectInWorld(a.text);
    void at;
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
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const plain = w.takeLedger();
    void plain;
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
    void huat;
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
      costs.add({ t: 0, realMs: 0, resident: 'x', kind: 'act', model: 'failed', usage: { input_tokens: 0, output_tokens: 0 }, estimatedUsd: 1000 });
      expect(await head.speak({ moment: 'morning', pupils: ['Hassan'] }, { t: 0, realMs: 0 })).toBeNull();
      expect(calls).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
