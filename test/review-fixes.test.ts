import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { FakeBrain } from '../src/brain/fake-brain.ts';
import { MemoryStore } from '../src/mind/memory.ts';
import { userPrompt } from '../src/mind/prompt.ts';
import type { Intent } from '../src/sim/actions/index.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { CIRCLE_LINES } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { QUIET_THINK_MINUTES, Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const seen = (w: ReturnType<typeof newWorld>, name: string) => describePerception(perceive(w, who(w, name)));

describe('someone who has gone', () => {
  it('is answered with who is actually here', () => {
    const w = newWorld(9);
    const raju = put(w, 'Raju', 'well');
    put(w, 'Ah Seng', 'jetty');
    expect(refused(act(w, raju.id, { verb: 'say', to: 'Ah Seng', text: 'Oi!' }))).toBe("Ah Seng isn't nearby. There's nobody here with you.");
    put(w, 'Siti', 'well');
    put(w, 'Muthu', 'well');
    expect(refused(act(w, raju.id, { verb: 'say', to: 'Ah Seng', text: 'Oi!' }))).toBe("Ah Seng isn't nearby. Here with you: Siti and Muthu.");
  });

  it("someone not in the kampung at all is answered so, in the kampung's words", () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    const reply = refused(act(w, siti.id, { verb: 'say', to: 'Pak Ali', text: 'Pak Ali, I am home.' }), /don't know anyone called "Pak Ali"/);
    expect(reply).toMatch(/nobody by that name in the kampung/);
  });

  it("within one thought, a resident doesn't keep trying to talk to someone who isn't there", async () => {
    const tries: Intent[] = [];
    const raju: Brain = {
      decide: () => {
        const i = { verb: 'say', to: 'Ah Seng', text: 'Ah Seng, where are you?' };
        tries.push(i);
        return i;
      },
      save: () => null,
      load: () => {},
    };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(9, 0) - 1;
    const town = Town.create(1, start, { brains: (r) => (r.name === 'Raju' ? raju : idle) });
    put(town.world, 'Raju', 'well');
    put(town.world, 'Ah Seng', 'jetty');
    for (const r of town.world.state.residents) r.thinkAt = start + 100;
    who(town.world, 'Raju').thinkAt = start + 1;
    await town.runUntil(start + 1);
    expect(tries).toHaveLength(1);
  });
});

describe('a resident with nothing to do', () => {
  /** A town of idle brains, everyone thinking only when the test says, with Siti having last done something at `start`. */
  async function idleTown() {
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const start = sgt(9, 0) - 1;
    const town = Town.create(1, start, { brains: () => idle });
    for (const r of town.world.state.residents) {
      r.thinkAt = start + 1000;
      r.lastDone = { what: 'fish', t: start };
    }
    return { town, start };
  }
  async function thinkAt(town: Town, name: string, t: number) {
    who(town.world, name).thinkAt = t;
    await town.runUntil(t);
    return who(town.world, name).reply?.text ?? null;
  }

  it('after pottering about with nothing done for half an hour, is reminded of places with work first', async () => {
    const { town, start } = await idleTown();
    put(town.world, 'Siti', 'well');
    expect(await thinkAt(town, 'Siti', start + 1)).toBeNull();
    const text = (await thinkAt(town, 'Siti', start + 3 * QUIET_THINK_MINUTES))!;
    expect(text).toMatch(/^There's nothing more to do here\. You could walk to the farm plot, the jetty or the [a-z -]+\.$/);
    expect(text).not.toContain('the well');
    expectInWorld(text);
    expect(seen(town.world, 'Siti')).toContain("There's nothing more to do here.");
  });

  it('a visitor in a shop is never told to walk to the shop they are in', async () => {
    const { town, start } = await idleTown();
    for (let k = 0; k < 6; k++) {
      put(town.world, 'Siti', 'kopitiam');
      const text = await thinkAt(town, 'Siti', start + (3 + k) * QUIET_THINK_MINUTES);
      expect(text).toMatch(/You could walk to/);
      expect(text).not.toContain('the kopitiam');
    }
  });

  it('nobody busy, nor an owner minding their own shop, is nudged', async () => {
    const { town, start } = await idleTown();
    const t = start + 3 * QUIET_THINK_MINUTES;
    put(town.world, 'Mdm Tan', 'provision-shop');
    expect(await thinkAt(town, 'Mdm Tan', t)).toBeNull();
    const siti = put(town.world, 'Siti', 'kopitiam');
    const huat = who(town.world, 'Ah Huat');
    town.world.state.jobs.push({ id: 99, employerId: huat.id, workerId: siti.id, placeId: 'kopitiam', wage: 100, startHour: 8, hours: 4, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 99, until: t + 120, worked: 0 };
    expect(await thinkAt(town, 'Siti', t + 1)).toBeNull();
  });

  it('hungry at home with nothing to eat, sees there is no food in the house', () => {
    const w = newWorld(9);
    const siti = who(w, 'Siti');
    put(w, 'Siti', siti.homeId);
    siti.hunger = 800;
    siti.items = {};
    expect(seen(w, 'Siti')).toContain("There's no food in the house.");
    siti.hunger = 100;
    expect(seen(w, 'Siti')).not.toContain("There's no food in the house.");
  });

  it("a day's plan is read against how they feel now; planning is told nothing about how things work", () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 800;
    const act_ = userPrompt('act', perceive(w, siti), [], 'Eat breakfast, then look for work.');
    expect(act_).toMatch(/Your plan for today:\nEat breakfast, then look for work\.\n\(You feel very hungry and \w+ right now\.\)/);
    const plan = userPrompt('plan', perceive(w, siti), [], null);
    expect(plan).not.toMatch(/Things people do|write iou|let off|\(person/);
    expectInWorld(plan);
  });
});

describe('the fake brain in a shop', () => {
  it('hungry at the kopitiam, buys there rather than walking to it', () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'kopitiam');
    const siti = put(w, 'Siti', 'kopitiam');
    siti.hunger = 800;
    siti.money = 500;
    expect(new FakeBrain(1).decide(perceive(w, siti))).toMatchObject({ verb: 'buy' });
  });
});

describe('memories', () => {
  it("who was nearby then isn't recalled as if it were now", () => {
    const m = new MemoryStore(':memory:');
    m.add('siti', 1, 'did', 'Nearby: Ah Seng (standing about).');
    m.add('siti', 2, 'thought', 'I should find work.\nNearby: Raju (fishing).');
    const got = m.recall('siti', 10, 'work Raju Ah Seng');
    expect(got.map((x) => x.text)).toEqual(['I should find work.']);
  });
});

describe('the lorry', () => {
  it('everyone awake hears its horn when it comes, and a newcomer learns where it stops', () => {
    const w = newWorld(6, 59, 1, true, false);
    for (const r of w.state.residents) r.activity = null;
    const kow = who(w, 'Ah Kow');
    kow.thinkAt = w.t + 50;
    advance(w);
    expect(w.state.lorryHere).toBe(true);
    for (const r of w.state.residents) expect(r.recent.some((o) => o.text.startsWith("You hear the lorry's horn from the lorry stop")), r.name).toBe(true);
    expect(kow.knownPlaces).toContain('lorry-stop');
    expect(kow.thinkAt).toBe(w.t + 1);
  });
});

describe('shops go by their owners', () => {
  it("standing in a shop, you see whose it is; you can walk to it by that name", () => {
    const w = newWorld(9);
    const seng = put(w, 'Ah Seng', 'provision-shop');
    const s = seen(w, 'Ah Seng');
    expect(s).toContain("You're at Mdm Tan's provision shop.");
    // The place itself keeps its own name, for anything comparing places.
    expect(perceive(w, seng)).toMatchObject({ place: 'the provision shop', placeId: 'provision-shop' });
    const raju = put(w, 'Raju', 'well');
    accepted(act(w, raju.id, { verb: 'walk_to', where: "Mdm Tan's provision shop" }));
    expect(raju.activity).toMatchObject({ kind: 'walking', dest: 'provision-shop' });
  });

  it('the owner still sees it as their own', () => {
    const w = newWorld(9);
    put(w, 'Mdm Tan', 'provision-shop');
    expect(seen(w, 'Mdm Tan')).toContain("You're at your provision shop.");
  });
});

describe('talk that has gone round in circles twice', () => {
  it("ends: both see they've said all there is to say, and further lines to each other are held back", () => {
    const w = newWorld(9);
    const raju = put(w, 'Raju', 'well');
    const siti = put(w, 'Siti', 'well');
    const events: GameEvent[] = [];
    for (let i = 0; i < 2 * CIRCLE_LINES; i++) {
      const [a, b] = i % 2 ? [siti, raju] : [raju, siti];
      accepted(act(w, a.id, { verb: 'say', to: b.name, text: `Line ${i}.` }));
      w.state.t += 1;
      events.push(...w.takeEvents());
    }
    expect(seen(w, 'Raju')).toContain("You and Siti have said all there is to say.");
    expect(seen(w, 'Siti')).toContain("You and Raju have said all there is to say.");
    expect(seen(w, 'Raju')).not.toContain('keep going round in circles');
    refused(act(w, raju.id, { verb: 'say', to: 'Siti', text: 'One more thing.' }), /said all there is to say/);
    // Doing something together opens it again.
    raju.money = 100;
    accepted(act(w, raju.id, { verb: 'give', to: 'Siti', money: '5¢' }));
    accepted(act(w, raju.id, { verb: 'say', to: 'Siti', text: 'There, for your trouble.' }));
  });
});
