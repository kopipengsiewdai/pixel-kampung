import { describe, expect, it } from 'vitest';
import { bounds, HAGGLES_PER_VISIT, osmanThinks, priceFor, REGULAR_DAYS, settleAnswer, type OsmanHead } from '../src/sim/osman.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { minuteOfDay } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

function lorryMorning(seed = 1): World {
  const w = newWorld(6, 0, seed);
  while (!w.state.osman.visit && minuteOfDay(w.t) < 8 * 60) advance(w);
  expect(w.state.osman.visit).not.toBeNull();
  return w;
}
const nextMorning = (w: World) => {
  while (w.state.osman.visit) advance(w);
  while (!w.state.osman.visit) advance(w);
};

describe('the horn says what he has brought, and what he is buying', () => {
  it('everyone awake hears what is on the lorry, in-world', () => {
    const w = newWorld(6, 0);
    const rahim = put(w, 'Rahim', 'market-stall');
    while (!w.state.osman.visit) advance(w);
    const heard = rahim.recent.find((o) => /horn/.test(o.text))!.text;
    expect(heard).toMatch(/^You hear the lorry's horn from the lorry stop: the lorry man is in from town with .*(rice|bread).*, and he's buying fish and vegetables\.$/);
    expect(heard.split(', and he')[0]).not.toMatch(/fish|vegetables/);
    expectInWorld(heard);
  });
});

describe('orders leave some for everyone', () => {
  it('orders take at most half of what town sends of a thing; the rest is on open sale', () => {
    const w = lorryMorning();
    for (const name of ['Siti', 'Ah Kow', 'Raju']) {
      const r = put(w, name, 'lorry-stop');
      accepted(act(w, r.id, { verb: 'ask_to_bring', item: 'bread', qty: 40 }));
    }
    nextMorning(w);
    const v = w.state.osman.visit!;
    expect(v.goods.bread ?? 0).toBeGreaterThan(0);
    expect(v.held.bread ?? 0).toBeLessThanOrEqual(v.goods.bread ?? 0);
  });
});

describe("a worker doesn't stock the boss's kitchen from their own bag", () => {
  it('on shift with rice in hand and none in the kitchen, the kitchen is short', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const siti = put(w, 'Siti', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Siti', wage: 200, startHour: 9, hours: 2 }));
    accepted(act(w, siti.id, { verb: 'accept_job', from: 'Ah Huat' }));
    accepted(act(w, siti.id, { verb: 'work_shift' }));
    const stock = w.shop('kopitiam')!.stock;
    delete stock.rice;
    stock.water = 3;
    siti.items = { rice: 3 };
    refused(act(w, siti.id, { verb: 'cook', item: 'bubur' }), /short of rice/);
    expect(siti.items.rice).toBe(3);
  });
});

describe('his haggling cap holds when he answers', () => {
  it('past the cap, offers made the same minute are answered without his head', async () => {
    const w = lorryMorning();
    let asked = 0;
    const head: OsmanHead = { price: async () => null, gossip: async () => null, haggle: async () => { asked++; return { answer: 'refuse' }; } };
    await osmanThinks(w, head, 0);
    w.state.osman.visit!.haggles = HAGGLES_PER_VISIT - 1;
    for (const name of ['Siti', 'Ah Kow', 'Raju', 'Muthu', 'Mei Ling']) {
      const r = put(w, name, 'lorry-stop');
      r.money = 1000;
      accepted(act(w, r.id, { verb: 'buy', item: 'bread', money: 1 }));
    }
    asked = 0;
    await osmanThinks(w, head, 0);
    expect(asked).toBe(1);
  });
});

describe('a debt stays as old as it is', () => {
  it('paying a cent off does not start its week again', () => {
    const w = lorryMorning();
    const siti = put(w, 'Siti', 'lorry-stop');
    w.state.osman.accounts[siti.id] = { owes: 0, since: null, days: REGULAR_DAYS, lastDay: null, cheated: false };
    accepted(act(w, siti.id, { verb: 'buy', item: 'bread', later: true }));
    const since = w.state.osman.accounts[siti.id]!.since;
    w.state.t += 60;
    siti.money = 100;
    accepted(act(w, siti.id, { verb: 'pay_lorry_man', money: 1 }));
    expect(w.state.osman.accounts[siti.id]!.since).toBe(since);
    accepted(act(w, siti.id, { verb: 'pay_lorry_man' }));
    expect(w.state.osman.accounts[siti.id]!.since).toBeNull();
  });
});

describe("his head can't put odd things on his list", () => {
  it('keys that are not his goods are ignored', async () => {
    const w = lorryMorning();
    const head: OsmanHead = {
      price: async () => ({ sells: JSON.parse('{"toString":20,"constructor":30,"__proto__":5}') as Record<string, unknown>, buys: { hasOwnProperty: 9 } }),
      gossip: async () => null, haggle: async () => null,
    };
    w.state.osman.visit!.priced = false;
    await osmanThinks(w, head, 0);
    const v = w.state.osman.visit!;
    expect(Object.keys(v.sells)).not.toContain('toString');
    expect(Object.keys(v.sells)).not.toContain('constructor');
    expect(Object.keys(v.buys)).not.toContain('hasOwnProperty');
    expect(bounds('sells', 'toString' as never)).toBeNull();
    const siti = put(w, 'Siti', 'lorry-stop');
    expect(describePerception(perceive(w, siti))).not.toMatch(/native code|NaN/);
    expect(priceFor(w, who(w, 'Siti'), 'sells', 'bread')).not.toBeNull();
  });
});

describe('his words match what he does', () => {
  it('words that agree to a deal his bounds turn down are dropped', () => {
    const facts = { name: 'Siti', side: 'sells' as const, item: 'rice' as const, qty: 1, offered: 5, list: 22, floor: 18, ceiling: 25, regular: false, cheated: false };
    expect(settleAnswer(facts, { answer: 'accept', words: 'Done, take it.' })).toEqual({ answer: 'refuse' });
    expect(settleAnswer(facts, { answer: 'counter', each: 2, words: 'Two cents, then.' })).toEqual({ answer: 'counter', each: 18 });
    expect(settleAnswer(facts, { answer: 'counter', each: 20, words: 'Twenty, then.' })).toEqual({ answer: 'counter', each: 20, words: 'Twenty, then.' });
    expect(settleAnswer({ ...facts, offered: 20 }, { answer: 'accept', words: 'Done.' })).toEqual({ answer: 'accept', words: 'Done.' });
  });
});
