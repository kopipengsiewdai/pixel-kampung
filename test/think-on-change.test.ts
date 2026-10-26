import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { MemoryStore } from '../src/mind/memory.ts';
import { describe as describePerception, latelyLines, perceive } from '../src/sim/perception.ts';
import { advance } from '../src/sim/tick.ts';
import { minuteOfDay } from '../src/sim/time.ts';
import { QUIET_THINK_MINUTES, Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, sgt, who } from './helpers.ts';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'kampung-think-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A town where one resident's thoughts are counted and nobody else thinks. */
function counted(name: string) {
  const asked: number[] = [];
  const start = sgt(9, 0) - 1;
  let town!: Town;
  const brains = (r: { name: string }): Brain => ({
    decide: () => { if (r.name === name) asked.push(town.world.t); return null; },
    save: () => null, load: () => {},
  });
  town = Town.create(1, start, { brains });
  for (const r of town.world.state.residents) {
    r.thinkAt = r.name === name ? start + 1 : start + 100_000;
    r.hunger = 100;
  }
  return { town, asked, start, w: town.world };
}

describe('a resident thinks when something changes, not on a clock', () => {
  it('with nothing new, the next thought is half an hour off', async () => {
    expect(QUIET_THINK_MINUTES).toBe(30);
    const { town, asked, start, w } = counted('Siti');
    put(w, 'Siti', 'well');
    await town.runUntil(start + 60);
    expect(asked).toEqual([start + 1, start + 1 + QUIET_THINK_MINUTES]);
  });

  it('someone arriving where they are brings a thought on', async () => {
    const { town, asked, start, w } = counted('Siti');
    put(w, 'Siti', 'well');
    await town.runUntil(start + 1);
    const raju = put(w, 'Raju', 'notice-board');
    accepted(act(w, raju.id, { verb: 'walk_to', where: 'the well' }));
    await town.runUntil(start + 20);
    expect(asked.length).toBe(2);
    expect(asked[1]!).toBeLessThan(start + 1 + QUIET_THINK_MINUTES);
  });

  it('getting hungry brings a thought on', async () => {
    const { town, asked, start, w } = counted('Siti');
    put(w, 'Siti', 'well');
    await town.runUntil(start + 1);
    who(w, 'Siti').hunger = 445;
    await town.runUntil(start + 20);
    expect(asked.length).toBe(2);
  });
});

describe('memory without the echo', () => {
  it("talk between two others is heard, but doesn't go into memory", () => {
    const w = newWorld(9);
    const remembered: { id: string; text: string }[] = [];
    w.observer = (id, _t, text) => { remembered.push({ id, text }); };
    const kow = put(w, 'Ah Kow', 'well');
    put(w, 'Mei Ling', 'well');
    put(w, 'Mdm Tan', 'well');
    accepted(act(w, who(w, 'Mei Ling').id, { verb: 'say', to: 'Mdm Tan', text: 'Is the rice ready?' }));
    expect(kow.recent.some((o) => /Is the rice ready/.test(o.text))).toBe(true);
    expect(remembered.some((x) => x.id === kow.id && /Is the rice ready/.test(x.text))).toBe(false);
    expect(remembered.some((x) => x.id === who(w, 'Mdm Tan').id && /Is the rice ready/.test(x.text))).toBe(true);
  });

  it('recall keeps only the newest of an exchange said over and over', () => {
    const mem = new MemoryStore(join(tmp(), 'm.db'));
    for (let i = 0; i < 5; i++) mem.add('ah-kow', 100 + i, 'noticed', `Mei Ling says to Mdm Tan: "Mdm, is the rice ready yet? (${i})"`);
    for (let i = 0; i < 3; i++) mem.add('ah-kow', 110 + i, 'did', `You say to Mdm Tan: "I will carry the water (${i})."`);
    mem.add('ah-kow', 50, 'noticed', 'You catch a fish at the jetty.');
    for (let i = 0; i < 3; i++) mem.add('ah-kow', 120 + i, 'noticed', `Mdm Tan says to you: "Wait on the bench (${i})."`);
    const got = mem.recall('ah-kow', 200, 'Mdm Tan rice water', 16).map((m) => m.text);
    // Overheard between two others (kept by older saves): not recalled at all. Said to them: the newest.
    expect(got.filter((t) => t.startsWith('Mei Ling says to Mdm Tan'))).toEqual([]);
    expect(got.filter((t) => t.startsWith('Mdm Tan says to you'))).toEqual(['Mdm Tan says to you: "Wait on the bench (2)."']);
    expect(got.filter((t) => t.startsWith('You say to Mdm Tan'))).toEqual(['You say to Mdm Tan: "I will carry the water (2)."']);
    expect(got).toContain('You catch a fish at the jetty.');
    mem.close();
  });

  it("their own passing thoughts come back only the newest two: a mind doesn't chew the same thought over", () => {
    const mem = new MemoryStore(join(tmp(), 'm.db'));
    for (let i = 0; i < 6; i++) mem.add('ah-kow', 100 + i, 'thought', `I must gather the firewood first (${i}).`);
    mem.add('ah-kow', 90, 'reflection', 'Today I learned to keep my promises.');
    const got = mem.recall('ah-kow', 200, 'firewood', 16).map((m) => m.text);
    expect(got.filter((t) => t.startsWith('I must gather'))).toEqual(['I must gather the firewood first (4).', 'I must gather the firewood first (5).']);
    expect(got).toContain('Today I learned to keep my promises.');
    mem.close();
  });

  it('"Lately" keeps only the newest line of each exchange', () => {
    const w = newWorld(9);
    const kow = put(w, 'Ah Kow', 'well');
    for (let i = 0; i < 4; i++) w.remember(kow.id, `Mei Ling says to Mdm Tan: "Rice? (${i})"`);
    w.remember(kow.id, 'You draw up a pail of water.');
    const lately = latelyLines(perceive(w, kow));
    expect(lately.filter((l) => l.startsWith('Mei Ling says to Mdm Tan'))).toEqual(['Mei Ling says to Mdm Tan: "Rice? (3)"']);
    expect(lately).toContain('You draw up a pail of water.');
  });
});

describe('food in sight when hungry', () => {
  it('a hungry resident sees the ways to food they know, every time they think', () => {
    const w = newWorld(9);
    const kow = put(w, 'Ah Kow', kow0(w));
    kow.hunger = 960;
    kow.money = 0;
    kow.items = {};
    kow.knownPlaces.push('jetty');
    const s = describePerception(perceive(w, kow));
    expect(s).toMatch(/You could catch a fish at the jetty\./);
    for (const line of s.split('\n')) expectInWorld(line);
    kow.hunger = 100;
    expect(describePerception(perceive(w, kow))).not.toMatch(/catch a fish at the jetty/);
  });
});

function kow0(w: ReturnType<typeof newWorld>): string {
  return who(w, 'Ah Kow').homeId;
}

// keep advance referenced for helpers that tick
void advance;

describe('what is due soon still brings a thought on', () => {
  it("a worker is woken when their shift starts, and someone with an offer before it lapses", async () => {
    const w = newWorld(9, 50);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const siti = put(w, 'Siti', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 200, startHour: 10, hours: 2 }));
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    siti.thinkAt = w.t + 1000;
    siti.hunger = 100;
    const limit = w.t + 60;
    while (siti.thinkAt > w.t && w.t < limit) advance(w);
    expect(minuteOfDay(w.t)).toBe(10 * 60);
    const raju = put(w, 'Raju', 'kopitiam');
    raju.items = { fish: 1 };
    accepted(act(w, raju.id, { verb: 'offer_trade', to: 'Siti', give: { items: { fish: 1 } }, want: { money: 10 } }));
    const offer = w.state.trades.at(-1)!;
    siti.thinkAt = w.t + 1000;
    while (w.t < offer.expires - 10) advance(w);
    expect(siti.thinkAt).toBeLessThanOrEqual(w.t);
  });
});

describe('collapsing repeats never loses what matters', () => {
  it('different things said between the same two stay; a promise is never collapsed', () => {
    const mem = new MemoryStore(join(tmp(), 'm.db'));
    mem.add('siti', 100, 'noticed', 'Mdm Tan says to you: "I will pay you back the $5 on Friday, I promise."');
    mem.add('siti', 110, 'did', 'You say to Mdm Tan: "Then I will lend you $5."');
    mem.add('siti', 300, 'noticed', 'Mdm Tan says to you: "Good morning!"');
    mem.add('siti', 310, 'noticed', 'Mdm Tan says to you: "Good morning to you!"');
    const got = mem.recall('siti', 400, 'Mdm Tan', 16).map((m) => m.text);
    expect(got).toContain('Mdm Tan says to you: "I will pay you back the $5 on Friday, I promise."');
    expect(got).toContain('You say to Mdm Tan: "Then I will lend you $5."');
    expect(got.filter((t) => /Good morning/.test(t))).toEqual(['Mdm Tan says to you: "Good morning to you!"']);
    mem.close();
  });
});
