import { describe, expect, it } from 'vitest';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { FakeBrain } from '../src/brain/fake-brain.ts';
import { feedLine, formatFeedLine } from '../src/feed/feed.ts';
import { act, newWorld, put, who, expectInWorld, accepted } from './helpers.ts';
import type { GameEvent } from '../src/sim/events.ts';

describe('perception', () => {
  it('holds only in-world facts: names not ids, feelings not numbers', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'kopitiam');
    put(w, 'Ah Huat', 'kopitiam');
    siti.hunger = 600;
    const p = perceive(w, siti);
    expect(p.place).toBe('the kopitiam');
    expect(p.hunger).toBe('hungry');
    expect(p.people).toEqual([{ name: 'Ah Huat', doing: 'minding the shop' }]);
    expect(p.shop?.staffed).toBe(true);
    const json = JSON.stringify(p);
    for (const r of w.state.residents) {
      if (r.id !== r.name) expect(json).not.toContain(`"${r.id}"`);
    }
    expect(json).not.toMatch(/house-\d|market-stall|provision-shop|lorry-stop|notice-board/);
    expectInWorld(describePerception(p).replace(/\n/g, ' '));
  });
  it('lists only actions that make sense here, and owners see their business', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    const verbs = perceive(w, siti).actions.map((a) => a.verb);
    expect(verbs).toContain('fish');
    expect(verbs).not.toContain('plant');
    expect(verbs).not.toContain('cook');
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const hp = perceive(w, huat);
    expect(hp.actions.map((a) => a.verb)).toContain('cook');
    expect(hp.business?.place).toBe('the kopitiam');
    for (const a of hp.actions) expect(a.says).not.toMatch(/_/);
  });
  it('carries the last reply so a resident knows what happened', () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    const res = act(w, siti.id, { verb: 'fish' });
    siti.reply = { ok: res.ok, text: res.reply! };
    const p = perceive(w, siti);
    expect(p.refused).toBe(true);
    expect(p.reply).toMatch(/jetty/);
  });
});

describe('fake brain', () => {
  it('is deterministic for a seed and survives save/load', () => {
    const w = newWorld(9);
    const p = perceive(w, who(w, 'Siti'));
    const a = new FakeBrain(1);
    const b = new FakeBrain(1);
    const seqA = Array.from({ length: 20 }, () => a.decide(p));
    expect(Array.from({ length: 20 }, () => b.decide(p))).toEqual(seqA);
    const c = new FakeBrain(99);
    c.load(a.save());
    expect(c.decide(p)).toEqual(a.decide(p));
  });
  it('eats when hungry and carrying food', () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    siti.hunger = 700;
    siti.items.fish = 1;
    expect(new FakeBrain(1).decide(perceive(w, siti))).toEqual({ verb: 'eat', item: 'fish' });
  });
  it('heads home to sleep when exhausted', () => {
    const w = newWorld(15);
    const siti = put(w, 'Siti', 'jetty');
    siti.energy = 100;
    expect(new FakeBrain(1).decide(perceive(w, siti))).toEqual({ verb: 'walk_to', where: 'home' });
  });
});

describe('story feed', () => {
  it('turns events into kampung sentences, highlighting the notable ones', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'kopitiam');
    const huat = put(w, 'Ah Huat', 'kopitiam');
    accepted(act(w, siti.id, { verb: 'buy', item: 'kopi', qty: 2 }));
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 200, startHour: 10, hours: 4 }));
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    const names = (id: string) => w.resident(id).name;
    const lines = w.takeEvents().map((e) => feedLine(e, names)).filter((l) => l !== null);
    const text = lines.map(formatFeedLine);
    expect(text).toContain('[Mon 09:00] Siti bought 2 cups of kopi from Ah Huat for 20¢.');
    expect(text).toContain('[Mon 09:00] ★ Ah Huat makes the first sale at the kopitiam!');
    expect(text).toContain('[Mon 09:00] ★ Siti is now working for Ah Huat at the kopitiam ($2.00 a shift).');
  });
  it('stays quiet about small things', () => {
    const e = { seq: 1, t: 0, type: 'looked_around', who: 'x' } as GameEvent;
    expect(feedLine(e, () => 'X')).toBeNull();
  });
});
