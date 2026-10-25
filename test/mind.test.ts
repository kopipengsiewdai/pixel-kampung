import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Budget, BUCKET_CAP, HOURLY_ALLOWANCE } from '../src/mind/budget.ts';
import { MemoryStore, importanceOf, FADE_DAYS } from '../src/mind/memory.ts';
import { FakeModel } from '../src/mind/fake-model.ts';
import { CostLog } from '../src/mind/cost-log.ts';
import { Mind, needsOnly, BUSINESS_CALLS_PER_DAY } from '../src/mind/mind.ts';
import { mindBrains } from '../src/mind/setup.ts';
import { fromIntent, toIntent } from '../src/mind/tools.ts';
import { CARDS } from '../src/seed/cards.ts';
import { Town, fakeBrains } from '../src/town.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { perceive } from '../src/sim/perception.ts';
import { act, accepted, newWorld, put, sgt, who } from './helpers.ts';

const START = sgt(6, 0) - 1;
const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'kampung-mind-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function mindTown(seed: number, opts: { costDir?: string | null; townCap?: number; memory?: MemoryStore } = {}) {
  const memory = opts.memory ?? new MemoryStore(':memory:');
  const mind = new Mind({
    client: new FakeModel(seed), memory, costs: new CostLog(opts.costDir ?? null), cards: CARDS, townCap: opts.townCap,
  });
  mind.keepSent = true;
  const events: GameEvent[] = [];
  const town = Town.create(seed, START, { brains: mindBrains(mind, fakeBrains), observer: mind.observe, onEvent: (e) => events.push(e) });
  return { town, mind, events, memory };
}

describe('thinking budget', () => {
  it('fills at $0.0139 a game hour up to a cap, and empties with each call', () => {
    const b = new Budget(0, 0);
    b.refill(60);
    expect(b.level).toBeCloseTo(HOURLY_ALLOWANCE, 10);
    b.refill(60 * 100);
    expect(b.level).toBe(BUCKET_CAP);
    b.spend(BUCKET_CAP);
    expect(b.canSpend(0.001)).toBe(false);
  });
});

describe('memory', () => {
  it('rates what matters above small things', () => {
    expect(importanceOf('noticed', 'Ah Huat let you go. You no longer work at the kopitiam.')).toBe(8);
    expect(importanceOf('noticed', 'Siti paid you $2.00 in wages.')).toBe(7);
    expect(importanceOf('did', 'You buy a cup of kopi for 10¢.')).toBe(2);
    expect(importanceOf('reflection', 'anything')).toBe(8);
    expect(importanceOf('did', 'You pin your note to the board: "WANTED: help. Ask for Mei Ling."')).toBe(6);
  });
  it('recalls what fits the moment, and lets trivial things fade after two weeks', () => {
    const m = new MemoryStore(':memory:');
    m.add('siti', 0, 'did', 'You buy a cup of kopi for 10¢.');
    m.add('siti', 10, 'noticed', 'Rahim says to you: "The jetty is full of fish."');
    m.add('siti', 20, 'noticed', 'Ah Huat let you go. You no longer work at the kopitiam.');
    for (let i = 0; i < 20; i++) m.add('siti', 100 + i, 'did', `You walk past the well ${i}.`);
    const recalled = m.recall('siti', 200, 'the jetty fish Rahim', 4).map((x) => x.text);
    expect(recalled.some((t) => t.includes('jetty is full of fish'))).toBe(true);
    expect(recalled.some((t) => t.includes('let you go'))).toBe(true);
    const later = 20 + FADE_DAYS * 1440 + 200;
    expect(m.fade(later)).toBe(21);
    const left = m.all('siti').map((x) => x.text);
    expect(left).toHaveLength(2);
    expect(left.some((t) => t.includes('let you go'))).toBe(true);
  });
});

describe('needs only', () => {
  it('a resident who cannot think still eats food they carry when hungry, and otherwise rests', () => {
    const w = newWorld();
    const siti = who(w, 'Siti');
    siti.hunger = 600;
    siti.items.fish = 1;
    expect(needsOnly(perceive(w, siti))).toEqual({ verb: 'eat', item: 'fish' });
    siti.hunger = 100;
    expect(needsOnly(perceive(w, siti))).toBeNull();
  });
});

describe('talk is line by line, with a soft limit', () => {
  it('after about 8 lines the listener hears but is not woken to answer at once', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'well');
    const raju = put(w, 'Raju', 'well');
    for (let i = 0; i < 8; i++) {
      raju.thinkAt = w.t + 99;
      accepted(act(w, siti.id, { verb: 'say', text: `Line ${i}`, to: 'Raju' }));
      expect(raju.thinkAt).toBe(w.t + 1);
    }
    raju.thinkAt = w.t + 99;
    accepted(act(w, siti.id, { verb: 'say', text: 'Line 9', to: 'Raju' }));
    expect(raju.thinkAt).toBe(w.t + 99);
    expect(raju.recent.at(-1)?.text).toMatch(/Line 9/);
    expect(perceive(w, raju).longTalks).toEqual(['Siti']);
  });
  it('talk not addressed to anyone counts too', () => {
    const w = newWorld();
    const siti = put(w, 'Siti', 'well');
    const raju = put(w, 'Raju', 'well');
    let woken = 0;
    for (let i = 0; i < 20; i++) {
      raju.thinkAt = w.t + 99;
      accepted(act(w, siti.id, { verb: 'say', text: `Line ${i}` }));
      if (raju.thinkAt === w.t + 1) woken++;
    }
    expect(woken).toBe(8);
  });
});

describe('failures and odd saves', () => {
  it('a failed call is charged at its estimate and logged, so spending can never hide', async () => {
    const dir = tempDir();
    const failing = { think: async () => { throw new Error('timed out'); } };
    const errors: unknown[] = [];
    const mind = new Mind({ client: failing, memory: new MemoryStore(':memory:'), costs: new CostLog(dir), cards: CARDS, onError: (e) => errors.push(e) });
    const town = Town.create(1, START, { brains: mindBrains(mind, fakeBrains, ['siti']), observer: mind.observe });
    await town.runUntil(START + 2);
    expect(errors.length).toBeGreaterThan(0);
    const day = mind.costs.dayKey(START + 1);
    expect(mind.costs.spentOn(day)).toBeGreaterThan(0);
    const b = town.brains.get('siti')!.save() as { budget: { level: number } };
    expect(b.budget.level).toBeLessThan(0.06);
  });
  it('a fake-brain save picked up by a town of minds starts the minds fresh', async () => {
    const plain = Town.create(2, START);
    await plain.runUntil(START + 30);
    const snap = plain.snapshot();
    const mind = new Mind({ client: new FakeModel(2), memory: new MemoryStore(':memory:'), costs: new CostLog(null), cards: CARDS });
    const town = Town.fromSnapshot(snap.world, snap.brains, { brains: mindBrains(mind, fakeBrains), observer: mind.observe });
    await town.runUntil(START + 60);
    expect(town.t).toBe(START + 60);
  });
});

describe('the do tool round trip', () => {
  it('every action the fake brain can take survives being sent as a do call', () => {
    const intents = [
      { verb: 'walk_to', where: 'the jetty' }, { verb: 'say', text: 'Hello', to: 'Raju' },
      { verb: 'buy', item: 'kopi', qty: 2 }, { verb: 'set_price', item: 'fish', price: 20, side: 'buy', limit: 5 },
      { verb: 'offer_job', to: 'Siti', wage: 200, startHour: 9, hours: 4 }, { verb: 'pay_wages', to: 'Siti', money: 50 },
      { verb: 'cook', item: 'kopi' }, { verb: 'accept_job', from: 'Ah Huat' }, { verb: 'let_go', who: 'Siti' },
    ];
    for (const i of intents) {
      const back = toIntent(fromIntent(i))!;
      expect(back.verb.replace(/ /g, '_')).toBe(i.verb);
      for (const [k, v] of Object.entries(i)) if (k !== 'verb') expect(back[k], `${i.verb}.${k}`).toEqual(v);
    }
  });
});

describe('a town of minds, on the fake model ($0)', () => {
  it('runs 2 game days: plans, reflections, memories, a cost log, and in-world prompts only', async () => {
    const costDir = tempDir();
    const { town, mind, events, memory } = mindTown(5, { costDir });
    await town.runUntil(START + 2 * 1440);
    const ids = town.world.state.residents.map((r) => r.id);
    const kinds = new Set(ids.flatMap((id) => memory.all(id).map((m) => m.kind)));
    for (const k of ['noticed', 'did', 'thought', 'plan', 'reflection']) expect(kinds, k).toContain(k);
    expect(mind.sent.filter((s) => s.kind === 'plan')).toHaveLength(20);
    expect(mind.sent.filter((s) => s.kind === 'reflect').length).toBeGreaterThanOrEqual(15);
    const business = mind.sent.filter((s) => s.kind === 'business').length;
    expect(business).toBeGreaterThan(0);
    expect(business).toBeLessThanOrEqual(3 * BUSINESS_CALLS_PER_DAY * 2);
    // Nobody thinks at night.
    expect(events.filter((e) => e.type === 'said' && (e.t % 1440 + 480) % 1440 >= 23 * 60)).toEqual([]);
    // The cost log is written per day, under the cap, and every line priced.
    const files = readdirSync(costDir);
    expect(files.length).toBeGreaterThanOrEqual(2);
    let total = 0;
    for (const f of files) {
      for (const line of readFileSync(join(costDir, f), 'utf8').trim().split('\n')) {
        const e = JSON.parse(line);
        expect(e.usd).toBeGreaterThan(0);
        total += e.usd;
      }
    }
    expect(total).toBeLessThan(2 * 3.33);
    // The prompts hold to the hard rule: in-world words only.
    const banned = /\b(game|simulation|simulated|agent|AI|API|system|feature|implemented|tool|JSON|token|model|prompt|player|npc|engine|server|database)\b|_/;
    for (const s of mind.sent) {
      expect(s.system).not.toMatch(banned);
      expect(s.user, s.user).not.toMatch(banned);
    }
    expect(mind.sent.every((s) => !/lorry/i.test(s.system))).toBe(true);
    // Money still only moves through the lorry.
    expect(events.some((e) => e.type === 'kampung_quiet')).toBe(false);
  });

  it('the town daily cap stops all thinking and says so once', async () => {
    const { town, mind, events } = mindTown(6, { townCap: 0.05 });
    await town.runUntil(START + 8 * 60);
    expect(events.filter((e) => e.type === 'kampung_quiet')).toHaveLength(1);
    const day = mind.costs.dayKey(town.t);
    expect(mind.costs.spentOn(day)).toBeLessThan(0.05 + 0.05);
  });

  it('save → stop → reopen memories and cost log → carries on exactly as a continuous run', async () => {
    const continuous = mindTown(9);
    await continuous.town.runUntil(START + 1500);

    const dir = tempDir();
    const memPath = join(dir, 'kampung.db');
    const first = mindTown(9, { costDir: join(dir, 'costs'), memory: new MemoryStore(memPath) });
    await first.town.runUntil(START + 600);
    const snap = first.town.snapshot();
    first.memory.close(); // the process stops here

    const memory = new MemoryStore(memPath);
    const mind = new Mind({ client: new FakeModel(9), memory, costs: new CostLog(join(dir, 'costs')), cards: CARDS });
    const resumed = Town.fromSnapshot(snap.world, snap.brains, { brains: mindBrains(mind, fakeBrains), observer: mind.observe });
    await resumed.runUntil(START + 1500);
    expect(resumed.snapshot().world).toEqual(continuous.town.snapshot().world);
    expect(memory.all('siti')).toEqual(continuous.memory.all('siti'));
    memory.close();
  });
});
