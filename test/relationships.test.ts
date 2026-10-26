import { describe, expect, it } from 'vitest';
import { bondOf } from '../src/sim/bonds.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { talkKey, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, who } from './helpers.ts';

const view = (w: World, a: string, b: string) => bondOf(w, who(w, a).id, who(w, b).id);
const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) advance(w); };

describe('where bonds start', () => {
  it('family are dear and trusted, old friends are friends, others neutral, strangers nothing yet', () => {
    const w = newWorld(9);
    expect(view(w, 'Aminah', 'Rahim')).toMatchObject({ trust: 50, fondness: 60 });
    expect(view(w, 'Ah Huat', 'Rahim')).toMatchObject({ trust: 40, fondness: 40 });
    expect(view(w, 'Rahim', 'Ah Huat')).toMatchObject({ trust: 40, fondness: 40 });
    expect(view(w, 'Siti', 'Fatimah')).toMatchObject({ trust: 0, fondness: 0 });
    expect(w.state.bonds[`${who(w, 'Ah Kow').id}>${who(w, 'Raju').id}`]).toBeUndefined();
  });
});

describe('deeds move them, one way', () => {
  it('a gift warms the one who gets it', () => {
    const w = newWorld(9);
    const fat = put(w, 'Fatimah', 'well');
    put(w, 'Siti', 'well');
    fat.money = 500;
    accepted(act(w, fat.id, { verb: 'give', to: 'Siti', money: 50 }));
    expect(view(w, 'Siti', 'Fatimah')).toMatchObject({ trust: 2, fondness: 4 });
    expect(view(w, 'Fatimah', 'Siti')).toMatchObject({ trust: 0, fondness: 0 });
  });

  it('a trade builds trust both ways, once a day', () => {
    const w = newWorld(9);
    w.emit({ type: 'traded', who: who(w, 'Raju').id, with: who(w, 'Siti').id, give: { items: {}, cents: 0 }, want: { items: {}, cents: 0 } });
    w.emit({ type: 'traded', who: who(w, 'Raju').id, with: who(w, 'Siti').id, give: { items: {}, cents: 0 }, want: { items: {}, cents: 0 } });
    expect(view(w, 'Siti', 'Raju').trust).toBe(3);
    expect(view(w, 'Raju', 'Siti').trust).toBe(3);
  });

  it('help, an errand run, a debt repaid, wages paid and a lesson each count', () => {
    const w = newWorld(9);
    const [a, b] = [who(w, 'Siti').id, who(w, 'Raju').id];
    w.emit({ type: 'helped', who: b, to: a, how: 'beds' });
    expect(view(w, 'Siti', 'Raju')).toMatchObject({ trust: 2, fondness: 5 });
    w.emit({ type: 'repaid', who: b, to: a, cents: 10, stillOwed: 0 });
    expect(view(w, 'Siti', 'Raju')).toMatchObject({ trust: 12, fondness: 7 });
    w.emit({ type: 'wages_paid', who: a, to: b, cents: 100, stillOwed: 0 });
    expect(view(w, 'Raju', 'Siti')).toMatchObject({ trust: 5, fondness: 1 });
    w.emit({ type: 'lesson_agreed', who: b, from: a, skill: 'fishing' });
    expect(view(w, 'Raju', 'Siti')).toMatchObject({ trust: 7, fondness: 6 });
    w.emit({ type: 'errand_done', who: b, for: a, cents: 20, paid: true });
    expect(view(w, 'Siti', 'Raju')).toMatchObject({ trust: 14, fondness: 12 });
  });

  it('a plea for a loan turned down cools the one who asked', () => {
    const w = newWorld(9);
    const [asker, refuser] = [who(w, 'Raju').id, who(w, 'Mdm Tan').id];
    w.emit({ type: 'debt_refused', who: refuser, from: asker, kind: 'borrow', cents: 50 });
    expect(view(w, 'Raju', 'Mdm Tan').fondness).toBe(-3);
    w.emit({ type: 'debt_refused', who: refuser, from: asker, kind: 'lend', cents: 50 });
    expect(view(w, 'Raju', 'Mdm Tan').fondness).toBe(-3);
  });

  it('talk warms the listener a little, at most three a day', () => {
    const w = newWorld(9);
    for (let i = 0; i < 6; i++) w.emit({ type: 'said', who: who(w, 'Raju').id, to: who(w, 'Siti').id, text: 'Hello again.' });
    expect(view(w, 'Siti', 'Raju').fondness).toBe(3);
    w.state.t += 1440;
    w.emit({ type: 'said', who: who(w, 'Raju').id, to: who(w, 'Siti').id, text: 'Morning.' });
    expect(view(w, 'Siti', 'Raju').fondness).toBe(4);
  });

  it('wages left owed overnight cost the employer the worker\'s trust', () => {
    const w = newWorld(23, 30);
    // Owed since this evening: not held against him tonight (nobody could pay in the night)...
    w.state.owed.push({ employerId: who(w, 'Ah Huat').id, workerId: who(w, 'Siti').id, cents: 100, since: dayIndex(w.t) });
    run(w, 60);
    expect(view(w, 'Siti', 'Ah Huat')).toMatchObject({ trust: 0, fondness: 0 });
    // ...but after a whole day unpaid, it is.
    run(w, 1440);
    expect(view(w, 'Siti', 'Ah Huat')).toMatchObject({ trust: -10, fondness: -3 });
  });

  it('a deal talked of as done that nothing backs within the hour costs trust, once', () => {
    const w = newWorld(9);
    const [a, b] = [who(w, 'Raju').id, who(w, 'Siti').id];
    w.state.talk[talkKey(a, b)] = { lines: 2, lastT: w.t, idle: 2, word: { by: a, kind: 'deal', t: w.t } };
    run(w, 130);
    expect(view(w, 'Siti', 'Raju').trust).toBe(-5);
  });

  it('they stay between -100 and 100', () => {
    const w = newWorld(9);
    for (let i = 0; i < 20; i++) {
      w.emit({ type: 'repaid', who: who(w, 'Raju').id, to: who(w, 'Siti').id, cents: 10, stillOwed: 0 });
      w.state.t += 1440;
    }
    expect(view(w, 'Siti', 'Raju').trust).toBe(100);
  });

  it('small change buys nothing: each kind once a day, no gift under 10 cents, a part repayment a little', () => {
    const w = newWorld(9);
    const [a, b] = [who(w, 'Siti').id, who(w, 'Raju').id];
    for (let i = 0; i < 50; i++) w.emit({ type: 'gave', who: b, to: a, item: null, qty: 0, cents: 1 });
    expect(view(w, 'Siti', 'Raju')).toMatchObject({ trust: 0, fondness: 0 });
    for (let i = 0; i < 5; i++) w.emit({ type: 'gave', who: b, to: a, item: null, qty: 0, cents: 20 });
    expect(view(w, 'Siti', 'Raju')).toMatchObject({ trust: 2, fondness: 3 });
    for (let i = 0; i < 5; i++) w.emit({ type: 'repaid', who: b, to: a, cents: 1, stillOwed: 90 });
    expect(view(w, 'Siti', 'Raju').trust).toBe(5);
  });

  it('a sale to a shop counts as a deal between the two', () => {
    const w = newWorld(9);
    w.emit({ type: 'sold', who: who(w, 'Ah Kow').id, to: who(w, 'Ah Huat').id, shop: 'kopitiam', item: 'fish', qty: 1, cents: 20 });
    expect(view(w, 'Ah Kow', 'Ah Huat').trust).toBe(3);
    expect(view(w, 'Ah Huat', 'Ah Kow').trust).toBe(3);
  });

  it('"all paid" held to nobody, and a word only ages while the kampung is awake', () => {
    const w = newWorld(9);
    const [a, b] = [who(w, 'Raju').id, who(w, 'Siti').id];
    w.state.talk[talkKey(a, b)] = { lines: 2, lastT: w.t, idle: 2, word: { by: a, kind: 'paying', t: w.t } };
    run(w, 130);
    expect(view(w, 'Siti', 'Raju').trust).toBe(0);
    const n = newWorld(22, 30);
    const [c, d] = [who(n, 'Raju').id, who(n, 'Siti').id];
    n.state.talk[talkKey(c, d)] = { lines: 2, lastT: n.t, idle: 2, word: { by: c, kind: 'deal', t: n.t } };
    run(n, 7 * 60);
    expect(view(n, 'Siti', 'Raju').trust).toBe(0);
  });
});

describe('what residents see: words, never numbers', () => {
  it('beside someone nearby, by name, and nothing in the middle', () => {
    const w = newWorld(9);
    put(w, 'Aminah', 'well');
    put(w, 'Rahim', 'well');
    put(w, 'Siti', 'well');
    const s = seen(w, 'Aminah');
    expect(s).toContain("You're fond of Rahim, and you trust Rahim.");
    expect(s).not.toMatch(/Siti is|trust Siti|wary of Siti/);
    w.state.bonds[`${who(w, 'Aminah').id}>${who(w, 'Siti').id}`] = { trust: -40, fondness: -80, day: 0, talk: 0, counted: [] };
    const t = seen(w, 'Aminah');
    expect(t).toContain("You can't stand Siti, and you're wary of Siti.");
    for (const line of t.split('\n')) expectInWorld(line);
    expect(t).not.toMatch(/-?\d+ (trust|fondness)/);
  });
});
