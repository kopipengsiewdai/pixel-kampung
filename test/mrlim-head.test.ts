import { describe, expect, it } from 'vitest';
import { JOB_PAY_BOUNDS, JOBS_A_DAY_BOUNDS, mrLimThinks, scriptedPlan, type MrLimHead } from '../src/sim/mr-lim.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { expectInWorld, newWorld, sgt } from './helpers.ts';

const ordinary = (w: World) => w.state.oddJobs.filter((j) => j.day === dayIndex(w.t) && j.project === null && j.kind !== 'keep_ledger');
async function morning(w: World, head: MrLimHead | null) {
  while (w.t < sgt(9, 0)) {
    advance(w);
    await mrLimThinks(w, head, 0);
  }
}

describe("Mr Lim's head varies his odd jobs (households-build.md PR B; subsistence.md Q3.1)", () => {
  it('scripted: more jobs when more of the kampung is broke, within bounds', () => {
    const w = newWorld(7);
    for (const r of w.state.residents) r.money = 500;
    expect(scriptedPlan(w).jobs).toBe(JOBS_A_DAY_BOUNDS[0]);
    for (const r of w.state.residents.slice(0, 8)) r.money = 0;
    expect(scriptedPlan(w).jobs).toBe(JOBS_A_DAY_BOUNDS[1]);
  });

  it('his head chooses how many and what they pay, held within his bounds, and he pins them', async () => {
    const w = newWorld(7, 0);
    const briefs: unknown[] = [];
    const head: MrLimHead = { plan: async (b) => { briefs.push(b); return { jobs: 9, pay: 500 }; } };
    await morning(w, head);
    expect(briefs.length).toBe(1);
    const jobs = ordinary(w);
    expect(jobs.length).toBe(JOBS_A_DAY_BOUNDS[1]);
    for (const j of jobs) expect(j.pay).toBe(JOB_PAY_BOUNDS[1]);
    const note = w.state.notes.find((n) => n.id === jobs[0]!.noteId)!;
    expect(note.text).toContain('80¢');
    expectInWorld(note.text);
  });

  it('with no head, or a head with nothing to say, his own way', async () => {
    const w = newWorld(7, 0);
    await morning(w, { plan: async () => null });
    expect(ordinary(w).length).toBe(scriptedPlan(w).jobs);
    for (const j of ordinary(w)) expect(j.pay).toBe(scriptedPlan(w).pay);
  });

  it('thinks once a day, before he goes to the board', async () => {
    const w = newWorld(7, 0);
    let calls = 0;
    const head: MrLimHead = { plan: async () => { calls++; return { jobs: 3, pay: 60 }; } };
    await morning(w, head);
    while (w.t < sgt(9, 0, 1)) { advance(w); await mrLimThinks(w, head, 0); }
    expect(calls).toBe(2);
  });
});

describe('his head on the model', () => {
  it('asks once with what he sees, in his own terms, within the cap', async () => {
    const { CostLog } = await import('../src/mind/cost-log.ts');
    const { ModelMrLimHead } = await import('../src/mind/mrlim-head.ts');
    const asked: string[] = [];
    const client = { think: async (req: { user: string }) => { asked.push(req.user); return { model: 'm', text: '', toolCall: { name: 'plan', input: { jobs: 3, pay: 60 } }, usage: { input_tokens: 50, output_tokens: 5 }, attempts: [{ model: 'm', usage: { input_tokens: 50, output_tokens: 5 } }], refused: false }; } };
    const head = new ModelMrLimHead({ client, costs: new CostLog(null) });
    const got = await head.plan({ residents: 13, broke: 7, hungry: 9, fund: 0, yesterday: { posted: 3, done: 1 } }, { t: 0, realMs: 0 });
    expect(got).toEqual({ jobs: 3, pay: 60 });
    expect(asked[0]).toMatch(/7 have no money/);
    expectInWorld(asked[0]!.split('\n')[0]!);
  });
});
