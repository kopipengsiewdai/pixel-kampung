import { describe, expect, it } from 'vitest';
import { QUIET_THINK_MINUTES } from '../src/town.ts';
import { CIRCLE_LINES, TALK_GAP_MINUTES, talkKey, type World } from '../src/sim/state.ts';
import { accepted, act, newWorld, put, who } from './helpers.ts';

const sayTo = (w: World, from: string, to: string, words: string) => accepted(act(w, who(w, from).id, { verb: 'say', to, text: words }));
const rec = (w: World, a: string, b: string) => w.state.talk[talkKey(who(w, a).id, who(w, b).id)]!;

function pair() {
  const w = newWorld(9);
  put(w, 'Siti', 'well');
  put(w, 'Mak Esah', 'well');
  return w;
}

describe('talk going round in circles is seen by what is said, not only by the clock (B3)', () => {
  it('a chat outlasts the quiet pace of thinking: the talk gap is longer than it', () => {
    expect(TALK_GAP_MINUTES).toBeGreaterThan(QUIET_THINK_MINUTES);
    expect(CIRCLE_LINES).toBe(6);
  });

  it('the same thing said again after a long pause carries on the same chat', () => {
    const w = pair();
    sayTo(w, 'Siti', 'Mak Esah', 'Mak, have you eaten? There is bubur in the pot for you.');
    sayTo(w, 'Mak Esah', 'Siti', 'Not yet, Siti. I will eat the bubur later.');
    w.state.t += TALK_GAP_MINUTES + 30;
    sayTo(w, 'Siti', 'Mak Esah', 'Mak, have you eaten yet? There is bubur in the pot.');
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(3);
  });

  it('something new said after a long pause is a new chat', () => {
    const w = pair();
    sayTo(w, 'Siti', 'Mak Esah', 'Mak, have you eaten? There is bubur in the pot for you.');
    w.state.t += TALK_GAP_MINUTES + 30;
    sayTo(w, 'Siti', 'Mak Esah', 'The lorry man has kerosene today, I saw it this morning.');
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(1);
  });

  it('walking off and back to say the same again does not start the count over', () => {
    const w = pair();
    for (let i = 0; i < 4; i++) sayTo(w, i % 2 ? 'Mak Esah' : 'Siti', i % 2 ? 'Siti' : 'Mak Esah', i % 2 ? 'Later, later. I am not hungry now.' : 'Mak, please eat the bubur in the pot now.');
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(4);
    accepted(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'the jetty' }));
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(0);
    put(w, 'Siti', 'well');
    sayTo(w, 'Siti', 'Mak Esah', 'Mak, please eat the bubur in the pot now.');
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(5);
  });

  it('a gift of the same thing again does not settle the talk; a first gift does', () => {
    const w = pair();
    const siti = who(w, 'Siti');
    siti.items = { bread: 3 };
    sayTo(w, 'Siti', 'Mak Esah', 'Mak, take this bread.');
    sayTo(w, 'Mak Esah', 'Siti', 'Thank you, Siti.');
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', item: 'bread', qty: 1 }));
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(0);
    sayTo(w, 'Mak Esah', 'Siti', 'You are too kind.');
    sayTo(w, 'Siti', 'Mak Esah', 'Have another one.');
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', item: 'bread', qty: 1 }));
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(2);
  });
});

describe('review fixes (B3)', () => {
  it('a thank-you after a real gift does not bring back the old count', () => {
    const w = pair();
    const siti = who(w, 'Siti');
    siti.items = { bread: 1 };
    const lines = ['Mak, the lorry man came early today.', 'Thank you, Siti, you are kind.', 'The tide is high this morning.', 'Your father would have liked it.', 'I will fetch water later.'];
    lines.forEach((l, i) => sayTo(w, i % 2 ? 'Mak Esah' : 'Siti', i % 2 ? 'Siti' : 'Mak Esah', l));
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', item: 'bread', qty: 1 }));
    sayTo(w, 'Mak Esah', 'Siti', 'Thank you, Siti, you are so kind.');
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(1);
  });

  it('after a walk, a short pleasantry said again starts the count over; a real repeat picks it up', () => {
    const w = pair();
    for (let i = 0; i < 4; i++) sayTo(w, i % 2 ? 'Mak Esah' : 'Siti', i % 2 ? 'Siti' : 'Mak Esah', i % 2 ? 'Thank you, Siti.' : 'Mak, please eat the bubur in the pot now.');
    accepted(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'the jetty' }));
    put(w, 'Siti', 'well');
    sayTo(w, 'Mak Esah', 'Siti', 'Thank you, Siti.');
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(1);
  });

  it('a repeat gift of money still settles talk of paying', () => {
    const w = pair();
    const siti = who(w, 'Siti');
    siti.money = 500;
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', money: 10 }));
    sayTo(w, 'Mak Esah', 'Siti', 'Pay me 20 cents for the kueh.');
    sayTo(w, 'Siti', 'Mak Esah', 'I will pay you 20 cents now.');
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', money: 20 }));
    expect(rec(w, 'Siti', 'Mak Esah').word).toBeNull();
  });

  it('the circles moment is marked even when a resumed count jumps past it', () => {
    const w = pair();
    const events: string[] = [];
    for (let i = 0; i < 5; i++) sayTo(w, i % 2 ? 'Mak Esah' : 'Siti', i % 2 ? 'Siti' : 'Mak Esah', i % 2 ? 'Later, later. I am not hungry now, Siti.' : 'Mak, please eat the bubur in the pot now.');
    accepted(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'the jetty' }));
    w.takeEvents();
    put(w, 'Siti', 'well');
    sayTo(w, 'Siti', 'Mak Esah', 'Mak, please eat the bubur in the pot now.');
    events.push(...w.takeEvents().map((e) => e.type));
    expect(rec(w, 'Siti', 'Mak Esah').idle).toBe(6);
    expect(events).toContain('circles');
  });
});
