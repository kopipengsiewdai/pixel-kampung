import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { feedLine } from '../src/feed/feed.ts';
import type { Intent } from '../src/sim/actions/index.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { perceive, type Perception } from '../src/sim/perception.ts';
import { talkKey } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const canGoWith = (p: Perception) => p.actions.some((a) => a.verb === 'go with');

describe('someone you were just talking with sets off', () => {
  it('you notice, in plain words, and it brings your next thought on', () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'well');
    const rahim = put(w, 'Rahim', 'well');
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'say', to: 'Rahim', text: 'Rahim, come to the kopitiam with me.' }));
    w.state.t += 1;
    accepted(act(w, rahim.id, { verb: 'say', to: 'Ah Huat', text: 'Okay, I come with you to the kopitiam.' }));
    rahim.thinkAt = w.t + 10;
    w.state.t += 1;
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'walk_to', where: 'the kopitiam' }));
    expect(rahim.recent.at(-1)!.text).toBe('Ah Huat sets off for the kopitiam.');
    expectInWorld(rahim.recent.at(-1)!.text);
    expect(rahim.thinkAt).toBe(w.t + 1);
  });

  it("someone you haven't spoken with lately isn't woken by it", () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'well');
    const siti = put(w, 'Siti', 'well');
    siti.thinkAt = w.t + 10;
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'walk_to', where: 'the kopitiam' }));
    expect(siti.thinkAt).toBe(w.t + 10);
  });
});

describe('going with someone', () => {
  it('walks with them to where they are heading, and the feed says so', () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'well');
    const rahim = put(w, 'Rahim', 'well');
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'walk_to', where: 'the kopitiam' }));
    expect(canGoWith(perceive(w, rahim))).toBe(true);
    w.takeEvents();
    const res = accepted(act(w, rahim.id, { verb: 'go_with', to: 'Ah Huat' }));
    expect(res.reply).toMatch(/Ah Huat/);
    expect(rahim.activity).toMatchObject({ kind: 'walking', dest: 'kopitiam' });
    const e = w.takeEvents().find((x) => x.type === 'went_with')!;
    expect(feedLine(e, (id) => w.resident(id).name)!.text).toBe('Rahim goes with Ah Huat to the kopitiam.');
  });

  it('going off with someone starts your other chats afresh, as walking off does', () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'well');
    const rahim = put(w, 'Rahim', 'well');
    put(w, 'Siti', 'well');
    accepted(act(w, rahim.id, { verb: 'say', to: 'Siti', text: 'Nice weather today.' }));
    const key = talkKey(rahim.id, who(w, 'Siti').id);
    expect(w.state.talk[key]!.idle).toBeGreaterThan(0);
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'walk_to', where: 'the kopitiam' }));
    accepted(act(w, rahim.id, { verb: 'go_with', to: 'Ah Huat' }));
    expect(w.state.talk[key]!.idle).toBe(0);
  });

  it("still works a minute later, once they've stepped away, if you saw them go", () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'well');
    const rahim = put(w, 'Rahim', 'well');
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'say', to: 'Rahim', text: 'Come with me.' }));
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'walk_to', where: 'the kopitiam' }));
    advance(w);
    advance(w);
    expect(canGoWith(perceive(w, rahim))).toBe(true);
    accepted(act(w, rahim.id, { verb: 'go_with', to: 'Ah Huat' }));
    expect(rahim.activity).toMatchObject({ kind: 'walking', dest: 'kopitiam' });
  });

  it("goes after them if they've already stopped somewhere", () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'well');
    const rahim = put(w, 'Rahim', 'well');
    accepted(act(w, huat.id, { verb: 'say', to: 'Rahim', text: 'See you at the kopitiam.' }));
    put(w, 'Ah Huat', 'kopitiam');
    w.takeEvents();
    const res = accepted(act(w, rahim.id, { verb: 'go_with', to: 'Ah Huat' }));
    expect(res.reply).toMatch(/Ah Huat/);
    expect(rahim.activity).toMatchObject({ kind: 'walking' });
    const e = w.takeEvents().find((x) => x.type === 'went_with')!;
    expect(feedLine(e, (id) => w.resident(id).name)!.text).toBe('Rahim goes after Ah Huat.');
  });

  it("refuses in plain words when they aren't going anywhere, and isn't offered then", () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'well');
    const rahim = put(w, 'Rahim', 'well');
    expect(canGoWith(perceive(w, rahim))).toBe(false);
    refused(act(w, rahim.id, { verb: 'go_with', to: 'Ah Huat' }), /Ah Huat isn't going anywhere/);
    refused(act(w, rahim.id, { verb: 'go_with', to: 'Nobody' }), /don't know/);
  });

  it('the live case: invited, said yes, the other walks off; you go along within a couple of minutes', async () => {
    const start = sgt(9, 0) - 1;
    const events: GameEvent[] = [];
    const huatScript: (Intent | null)[] = [{ verb: 'say', to: 'Rahim', text: 'Rahim, come to the kopitiam with me.' }, { verb: 'walk_to', where: 'the kopitiam' }];
    const huat: Brain = { decide: () => huatScript.shift() ?? null, save: () => null, load: () => {} };
    let said = false;
    const rahim: Brain = {
      decide: (p) => {
        if (canGoWith(p)) return { verb: 'go_with', to: 'Ah Huat' };
        if (!said && p.talk.some((l) => l.startsWith('Ah Huat says to you'))) {
          said = true;
          return { verb: 'say', to: 'Ah Huat', text: 'Okay, I come with you to the kopitiam.' };
        }
        return null;
      },
      save: () => null,
      load: () => {},
    };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const town = Town.create(1, start, { onEvent: (e) => events.push(e), brains: (r) => (r.name === 'Ah Huat' ? huat : r.name === 'Rahim' ? rahim : idle) });
    put(town.world, 'Ah Huat', 'well');
    put(town.world, 'Rahim', 'well');
    for (const r of town.world.state.residents) r.thinkAt = start + 100;
    who(town.world, 'Ah Huat').thinkAt = start + 1;
    await town.runUntil(start + 12);
    const left = events.find((e) => e.type === 'walked' && e.who === who(town.world, 'Ah Huat').id)!;
    const went = events.find((e) => e.type === 'went_with')!;
    expect(went).toBeDefined();
    expect(went.t - left.t).toBeLessThanOrEqual(2);
  });
});
