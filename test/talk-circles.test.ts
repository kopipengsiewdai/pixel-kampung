import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { systemPrompt } from '../src/mind/prompt.ts';
import { CARDS } from '../src/seed/cards.ts';
import type { Intent } from '../src/sim/actions/index.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive, type Perception } from '../src/sim/perception.ts';
import { CIRCLE_LINES, TALK_GAP_MINUTES, TALK_SOFT_LIMIT, talkKey, type World } from '../src/sim/state.ts';
import { Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, sgt, who } from './helpers.ts';

const text = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const sayTo = (w: World, from: string, to: string, words: string) => accepted(act(w, who(w, from).id, { verb: 'say', to, text: words }));

describe('knowing what you have and what you are', () => {
  it('an owner is told the shop is theirs alone; a worker and a job-seeker that they run no stall or shop', () => {
    const w = newWorld(9);
    const tan = text(w, 'Mdm Tan');
    expect(tan).toMatch(/You run the provision shop\. It's yours alone\./);
    const seeker = text(w, 'Ah Kow');
    expect(seeker).toMatch(/You have no work just now, and you don't run a stall or shop\./);
    expectInWorld(tan);
    expectInWorld(seeker);
    // Hired, they're a worker: no longer "no work", still no shop of their own.
    const kow = who(w, 'Ah Kow');
    w.state.jobs.push({ id: 900, employerId: who(w, 'Mdm Tan').id, workerId: kow.id, placeId: 'provision-shop', wage: 120, startHour: 13, hours: 4, lastWorkedDay: null });
    const worker = text(w, 'Ah Kow');
    expect(worker).toMatch(/You work for Mdm Tan.*\nYou don't run a stall or shop\./);
    expect(worker).not.toMatch(/no work just now/);
  });

  it("a job-seeker's own card no longer says they have no work (it went stale once they were hired)", () => {
    const card = CARDS.find((c) => c.name === 'Ah Kow')!;
    expect(systemPrompt(card, 'seeker', null)).not.toMatch(/have work|no work/i);
    expect(systemPrompt(CARDS.find((c) => c.name === 'Mdm Tan')!, 'owner', 'the provision shop')).toMatch(/You own the provision shop\./);
  });
});

describe('words do not move money or goods', () => {
  function shop() {
    const w = newWorld(9);
    put(w, 'Rahim', 'provision-shop');
    put(w, 'Mdm Tan', 'provision-shop');
    who(w, 'Rahim').money = 6456;
    return w;
  }

  it('after a few minutes, both see that the paying was only talk', () => {
    const w = shop();
    sayTo(w, 'Rahim', 'Mdm Tan', 'I put my $64.56 on the counter. Count it in front of me.');
    w.state.t += 2;
    expect(text(w, 'Mdm Tan')).not.toMatch(/no money has changed hands/);
    w.state.t += 1;
    const tan = text(w, 'Mdm Tan');
    const rahim = text(w, 'Rahim');
    expect(tan).toMatch(/You and Rahim have talked of paying, but no money has changed hands\./);
    expect(rahim).toMatch(/You and Mdm Tan have talked of paying, but no money has changed hands\./);
    expectInWorld(tan);
    expectInWorld(rahim);
    expect(perceive(w, who(w, 'Mdm Tan')).unbacked).toEqual([{ name: 'Rahim', kind: 'paying', mine: false }]);
  });

  it('money really handed over settles it', () => {
    const w = shop();
    sayTo(w, 'Rahim', 'Mdm Tan', "Here's your $2 for the rice.");
    w.state.t += 2;
    accepted(act(w, who(w, 'Rahim').id, { verb: 'give', to: 'Mdm Tan', money: 200 }));
    w.state.t += 2;
    expect(text(w, 'Mdm Tan')).not.toMatch(/changed hands/);
  });

  it('a gift does not settle talk of a job; a job offer does', () => {
    const w = newWorld(9);
    put(w, 'Ah Seng', 'well');
    put(w, 'Raju', 'well');
    sayTo(w, 'Ah Seng', 'Raju', "You're hired, Raju. Come at 8 o'clock, $1.50.");
    accepted(act(w, who(w, 'Ah Seng').id, { verb: 'give', to: 'Raju', money: 10 }));
    w.state.t += 3;
    expect(text(w, 'Raju')).toMatch(/Ah Seng talks about a job, but no job has been offered\./);
    expect(text(w, 'Ah Seng')).toMatch(/You've talked with Raju about a job, but no job has been offered\./);
  });

  it("only the two of them see it; and it goes once they're apart", () => {
    const w = shop();
    put(w, 'Siti', 'provision-shop');
    sayTo(w, 'Rahim', 'Mdm Tan', 'I count it now in front of you, every cent.');
    w.state.t += 3;
    expect(text(w, 'Siti')).not.toMatch(/changed hands/);
    put(w, 'Rahim', 'jetty');
    expect(text(w, 'Mdm Tan')).not.toMatch(/changed hands/);
  });

  it("the one being paid saying it's all paid doesn't make them out to be the payer", () => {
    const w = shop();
    sayTo(w, 'Mdm Tan', 'Rahim', 'I count it now, every cent. All paid.');
    w.state.t += 3;
    expect(text(w, 'Mdm Tan')).toMatch(/You and Rahim have talked of paying/);
    expect(text(w, 'Mdm Tan')).not.toMatch(/You've talked about paying/);
  });

  it('a sale through a worker on shift settles talk with the worker', () => {
    const w = shop();
    const tan = who(w, 'Mdm Tan');
    const kow = put(w, 'Ah Kow', 'provision-shop');
    put(w, 'Mdm Tan', 'well');
    w.state.jobs.push({ id: 901, employerId: tan.id, workerId: kow.id, placeId: 'provision-shop', wage: 120, startHour: 9, hours: 4, lastWorkedDay: null });
    kow.activity = { kind: 'working', jobId: 901, until: w.t + 120, worked: 0 };
    sayTo(w, 'Rahim', 'Ah Kow', "Here's your 30¢ for the rice.");
    accepted(act(w, who(w, 'Rahim').id, { verb: 'buy', item: 'rice' }));
    w.state.t += 3;
    expect(text(w, 'Rahim')).not.toMatch(/changed hands/);
    expect(w.state.talk[talkKey(who(w, 'Rahim').id, kow.id)]!.idle).toBe(0);
  });

  it('thanks for a job already given, or one just offered, is not taken for an empty promise', () => {
    const w = newWorld(9);
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    const kow = put(w, 'Ah Kow', 'provision-shop');
    w.state.jobs.push({ id: 902, employerId: tan.id, workerId: kow.id, placeId: 'provision-shop', wage: 120, startHour: 13, hours: 4, lastWorkedDay: null });
    sayTo(w, 'Ah Kow', 'Mdm Tan', 'Thank you, boss. I start tomorrow at one.');
    w.state.t += 3;
    expect(text(w, 'Mdm Tan')).not.toMatch(/no job has been offered/);
    // An offer made but not yet taken up.
    const w2 = newWorld(9);
    put(w2, 'Mdm Tan', 'provision-shop');
    put(w2, 'Ah Kow', 'provision-shop');
    accepted(act(w2, who(w2, 'Mdm Tan').id, { verb: 'offer_job', to: 'Ah Kow', wage: 120, startHour: 13, hours: 4 }));
    sayTo(w2, 'Ah Kow', 'Mdm Tan', "Thank you! I'll take the job.");
    w2.state.t += 3;
    expect(text(w2, 'Ah Kow')).not.toMatch(/no job has been offered/);
    expect(text(w2, 'Mdm Tan')).not.toMatch(/no job has been offered/);
  });

  it('talk that switches between paying and a deal still shows once nothing has changed hands', () => {
    const w = shop();
    sayTo(w, 'Rahim', 'Mdm Tan', 'Deal! Two fish for your bread.');
    w.state.t += 2;
    sayTo(w, 'Mdm Tan', 'Rahim', "Here's your 30¢ for the kopi.");
    w.state.t += 1;
    expect(perceive(w, who(w, 'Rahim')).unbacked).toHaveLength(1);
  });

  it('an overheard claim notes nothing for the one overhearing; the notice goes after the talk gap, quiet', () => {
    const w = shop();
    put(w, 'Siti', 'provision-shop');
    sayTo(w, 'Rahim', 'Mdm Tan', 'I put my money on the counter.');
    expect(w.state.talk[talkKey(who(w, 'Rahim').id, who(w, 'Siti').id)]?.word ?? null).toBeNull();
    w.state.t += 3;
    expect(perceive(w, who(w, 'Mdm Tan')).unbacked).toHaveLength(1);
    w.state.t += TALK_GAP_MINUTES + 1;
    expect(perceive(w, who(w, 'Mdm Tan')).unbacked).toEqual([]);
  });

  it('a trade offered settles talk of a deal', () => {
    const w = shop();
    who(w, 'Rahim').items = { fish: 2 };
    sayTo(w, 'Rahim', 'Mdm Tan', 'Deal! Two fish for your bread.');
    accepted(act(w, who(w, 'Rahim').id, { verb: 'offer_trade', to: 'Mdm Tan', give: { items: { fish: 2 } }, want: { items: { bread: 1 } } }));
    w.state.t += 3;
    expect(perceive(w, who(w, 'Mdm Tan')).unbacked).toEqual([]);
  });

  it('a line said to everyone, or one that only asks, claims nothing', () => {
    const w = shop();
    accepted(act(w, who(w, 'Rahim').id, { verb: 'say', text: 'I put my money on the counter.' }));
    sayTo(w, 'Rahim', 'Mdm Tan', 'Can I pay you tomorrow?');
    w.state.t += 3;
    expect(perceive(w, who(w, 'Mdm Tan')).unbacked).toEqual([]);
  });
});

describe('going round in circles', () => {
  function chatter(n: number) {
    const w = newWorld(9);
    put(w, 'Ah Seng', 'well');
    put(w, 'Raju', 'well');
    for (let i = 0; i < n; i++) {
      sayTo(w, i % 2 ? 'Raju' : 'Ah Seng', i % 2 ? 'Ah Seng' : 'Raju', 'Morning! About that deal...');
      w.state.t += 1;
    }
    return w;
  }

  it(`after ${CIRCLE_LINES} lines with nothing done, both see they keep going round in circles`, () => {
    const w = chatter(CIRCLE_LINES - 1);
    expect(text(w, 'Raju')).not.toMatch(/round in circles/);
    sayTo(w, 'Raju', 'Ah Seng', 'Morning! About that deal...');
    w.state.t += 1;
    const raju = text(w, 'Raju');
    expect(raju).toMatch(/You and Ah Seng keep going round in circles\./);
    expect(text(w, 'Ah Seng')).toMatch(/You and Raju keep going round in circles\./);
    expect(raju).not.toMatch(/talking with Ah Seng for a while/);
    expectInWorld(raju);
    expect(w.takeEvents().filter((e) => e.type === 'circles')).toHaveLength(1);
  });

  it('from the next line the listener is no longer woken, and nobody is kept waiting', () => {
    const w = chatter(CIRCLE_LINES);
    const raju = who(w, 'Raju');
    raju.thinkAt = w.t + 50;
    sayTo(w, 'Ah Seng', 'Raju', 'Morning! About that deal...');
    expect(raju.thinkAt).toBe(w.t + 50);
    expect(perceive(w, raju).waiting).toEqual([]);
    expect(w.state.talk[talkKey(raju.id, who(w, 'Ah Seng').id)]!.lines).toBeLessThanOrEqual(TALK_SOFT_LIMIT);
  });

  it("going round in circles shows only while the other is there and awake", () => {
    const w = chatter(CIRCLE_LINES);
    expect(text(w, 'Raju')).toMatch(/round in circles/);
    who(w, 'Ah Seng').activity = { kind: 'sleeping', reason: 'night', until: null };
    expect(text(w, 'Raju')).not.toMatch(/round in circles/);
  });

  it('at the line where it starts going round in circles, nobody is shown as waiting too', () => {
    const w = chatter(CIRCLE_LINES);
    expect(perceive(w, who(w, 'Raju')).waiting).toEqual([]);
    expect(perceive(w, who(w, 'Ah Seng')).waiting).toEqual([]);
  });

  it('doing something together starts the count again; so does walking off', () => {
    const w = chatter(4);
    who(w, 'Ah Seng').items = { fish: 2 };
    accepted(act(w, who(w, 'Ah Seng').id, { verb: 'give', to: 'Raju', item: 'fish', qty: 1 }));
    for (let i = 0; i < 3; i++) { sayTo(w, 'Raju', 'Ah Seng', 'Thanks, lah.'); w.state.t += 1; }
    expect(text(w, 'Raju')).not.toMatch(/round in circles/);
    const key = talkKey(who(w, 'Raju').id, who(w, 'Ah Seng').id);
    expect(w.state.talk[key]!.idle).toBe(3);
    accepted(act(w, who(w, 'Raju').id, { verb: 'walk_to', where: 'the jetty' }));
    expect(w.state.talk[key]!.idle).toBe(0);
  });

  it('the living exchange, replayed: two who only narrate a deal are down to a few lines in half an hour', async () => {
    const lines = ['I put my $64.56 on the counter. Count it in front of me.', 'I count it now in front of you, every cent.'];
    const narrator = (partner: string, line: string): Brain => ({
      decide: (p: Perception): Intent | null => (p.people.some((x) => x.name === partner) ? { verb: 'say', to: partner, text: line } : null),
      save: () => null,
      load: () => {},
    });
    const start = sgt(9, 0) - 1;
    const events: GameEvent[] = [];
    const town = Town.create(1, start, {
      onEvent: (e) => events.push(e),
      brains: (r) => (r.name === 'Rahim' ? narrator('Mdm Tan', lines[0]!) : r.name === 'Mdm Tan' ? narrator('Rahim', lines[1]!) : { decide: () => null, save: () => null, load: () => {} }),
    });
    put(town.world, 'Rahim', 'provision-shop');
    put(town.world, 'Mdm Tan', 'provision-shop');
    for (const r of town.world.state.residents) r.thinkAt = start + 100;
    who(town.world, 'Rahim').thinkAt = start + 1;
    await town.runUntil(start + 30);
    const said = events.filter((e) => e.type === 'said').length;
    // Six lines, then only the quiet pace (every 10 minutes each) for the rest of the half hour.
    expect(said).toBeLessThanOrEqual(CIRCLE_LINES + 6);
    expect(text(town.world, 'Mdm Tan')).toMatch(/changed hands|round in circles/);
  });
});

describe('the upgrade: chats already going start with nothing counted', () => {
  it('every talk record gains an empty count and no deal pending; running it twice changes nothing', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 5)!;
    const world = { t: 100, talk: { 'a|b': { lines: 7, lastT: 90 }, 'c|d': { lines: 2, lastT: 99 } } };
    const up = step.save!({ world, brains: {} }).world as { talk: Record<string, unknown> };
    expect(up.talk).toEqual({ 'a|b': { lines: 7, lastT: 90, idle: 0, word: null }, 'c|d': { lines: 2, lastT: 99, idle: 0, word: null } });
    expect(step.save!({ world: up as Record<string, unknown>, brains: {} }).world).toEqual(up);
  });
});
