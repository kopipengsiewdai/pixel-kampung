import { describe, expect, it } from 'vitest';
import type { Brain } from '../src/brain/brain.ts';
import { FakeBrain } from '../src/brain/fake-brain.ts';
import { feedLine } from '../src/feed/feed.ts';
import type { Intent } from '../src/sim/actions/index.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive, type Perception } from '../src/sim/perception.ts';
import { talkKey, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { settledBy } from '../src/sim/talk.ts';
import { Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const offered = (p: Perception, verb: string) => p.actions.some((a) => a.verb === verb);
const feed = (w: World, e: GameEvent) => feedLine(e, (id) => w.resident(id).name)!.text;

/** Ah Seng at Rahim's stall, with Rahim minding it: vegetables at 20¢ (the test price list). */
function atStall(seng = 500) {
  const w = newWorld(9);
  const rahim = put(w, 'Rahim', 'market-stall');
  const ah = put(w, 'Ah Seng', 'market-stall');
  ah.money = seng;
  return { w, rahim, seng: ah };
}

describe('buying at a price you name', () => {
  it('at or above the price, it is an ordinary sale at the price: nobody overpays', () => {
    const { w, rahim, seng } = atStall();
    const before = rahim.money;
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '25¢' }));
    expect(seng.money).toBe(480);
    expect(rahim.money).toBe(before + 20);
    expect(w.state.priceOffers).toEqual([]);
  });

  it('below it, an offer the one minding the counter sees, in plain words, and nothing changes hands yet', () => {
    const { w, rahim, seng } = atStall();
    rahim.thinkAt = w.t + 10;
    const res = accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    expect(res.reply).toBe('You offer 16¢ for a bunch of vegetables.');
    expect(seng.money).toBe(500);
    expect(rahim.recent.at(-1)!.text).toBe('Ah Seng offers 16¢ for a bunch of vegetables.');
    expect(describePerception(perceive(w, rahim))).toContain('Ah Seng offers 16¢ for a bunch of vegetables.');
    expect(offered(perceive(w, rahim), 'agree')).toBe(true);
    expect(rahim.thinkAt).toBe(w.t + 1);
  });

  it('accepted, it is a sale at the price offered, through the money and the stock, and the feed says so', () => {
    const { w, rahim, seng } = atStall();
    const stock = w.shop('market-stall')!.stock.vegetables!;
    const before = rahim.money;
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    w.takeEvents();
    w.takeLedger();
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }));
    expect(seng.money).toBe(484);
    expect(rahim.money).toBe(before + 16);
    expect(seng.items.vegetables).toBe(1);
    expect(w.shop('market-stall')!.stock.vegetables).toBe(stock - 1);
    expect(w.takeLedger()).toMatchObject([{ from: seng.id, to: rahim.id, cents: 16 }]);
    const bought = w.takeEvents().find((e) => e.type === 'bought')!;
    expect(bought).toMatchObject({ who: seng.id, from: rahim.id, cents: 16 });
    expect(feed(w, bought)).toBe('Ah Seng bought a bunch of vegetables from Rahim for 16¢.');
    expect(seng.recent.at(-1)!.text).toBe('Rahim takes your 16¢ for a bunch of vegetables.');
    expect(w.state.priceOffers).toEqual([]);
  });

  it('turned down, nothing changes hands and the buyer hears it', () => {
    const { w, rahim, seng } = atStall();
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '5¢' }));
    w.takeEvents();
    accepted(act(w, rahim.id, { verb: 'refuse', from: 'Ah Seng' }));
    expect(seng.recent.at(-1)!.text).toBe("Rahim won't take 5¢ for a bunch of vegetables.");
    expect(feed(w, w.takeEvents().find((e) => e.type === 'price_refused')!)).toBe("Rahim turns down Ah Seng's 5¢ for a bunch of vegetables.");
    expect(w.state.priceOffers).toEqual([]);
    refused(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }), /hasn't/);
  });

  it('a worker on shift can take the offer for the shop; the money goes to the owner', () => {
    const { w, rahim, seng } = atStall();
    const siti = put(w, 'Siti', 'market-stall');
    put(w, 'Rahim', 'well');
    w.state.jobs.push({ id: 99, employerId: rahim.id, workerId: siti.id, placeId: 'market-stall', wage: 100, startHour: 8, hours: 4, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 99, until: w.t + 60, worked: 0 };
    const before = rahim.money;
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    expect(siti.recent.at(-1)!.text).toBe('Ah Seng offers 16¢ for a bunch of vegetables.');
    accepted(act(w, siti.id, { verb: 'agree', from: 'Ah Seng' }));
    expect(rahim.money).toBe(before + 16);
  });

  it('lapses after a few minutes, or once the buyer walks away', () => {
    const { w, rahim, seng } = atStall();
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    for (let i = 0; i < 6; i++) advance(w);
    expect(w.state.priceOffers).toEqual([]);
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    put(w, 'Ah Seng', 'well');
    advance(w);
    expect(w.state.priceOffers).toEqual([]);
    refused(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }), /hasn't/);
  });

  it('refuses in plain words when you lack the money, or name nothing sensible', () => {
    const { w, seng } = atStall(10);
    refused(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }), /You don't have 16¢/);
    refused(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: 'lots' }), /doesn't sound like money/);
  });

  it('settles talk of a deal, as a sale does', () => {
    const ev = (body: Record<string, unknown>) => ({ t: 1, seq: 1, ...body }) as unknown as GameEvent;
    expect(settledBy(ev({ type: 'price_offered', who: 'a', owner: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'price_refused', who: 'b', from: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'money' });
    const { w, rahim, seng } = atStall();
    accepted(act(w, rahim.id, { verb: 'say', to: 'Ah Seng', text: 'Deal! 16¢, the bunch of vegetables is yours.' }));
    expect(w.state.talk[talkKey(rahim.id, seng.id)]!.word).not.toBeNull();
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }));
    expect(w.state.talk[talkKey(rahim.id, seng.id)]!.word).toBeNull();
  });

  it('the fake brain takes a fair offer and turns down a low one', () => {
    const { w, rahim, seng } = atStall();
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '17¢' }));
    expect(new FakeBrain(1).decide(perceive(w, rahim))).toEqual({ verb: 'agree', from: 'Ah Seng', item: 'vegetables' });
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '5¢' }));
    expect(new FakeBrain(1).decide(perceive(w, rahim))).toEqual({ verb: 'refuse', from: 'Ah Seng', item: 'vegetables' });
  });
});

describe('after review', () => {
  it('with a loan asked for and a price offered by the same person, agreeing names the item, or is asked which', () => {
    const { w, rahim, seng } = atStall();
    rahim.money = 1000;
    accepted(act(w, seng.id, { verb: 'borrow', to: 'Rahim', money: '50¢' }));
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    refused(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }), /^Ah Seng has asked you about money and offered 16¢ for a bunch of vegetables\. Which do you mean\?$/);
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng', item: 'vegetables' }));
    expect(seng.items.vegetables).toBe(1);
    expect(w.state.debts).toEqual([]);
    // Now only the loan is left: agreeing without an item means it.
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }));
    expect(w.state.debts).toMatchObject([{ debtor: seng.id, cents: 50 }]);
  });

  it('a worker never sees or takes their own offer', () => {
    const { w, rahim } = atStall();
    const siti = put(w, 'Siti', 'market-stall');
    siti.money = 500;
    accepted(act(w, siti.id, { verb: 'buy', item: 'vegetables', money: '5¢' }));
    w.state.jobs.push({ id: 99, employerId: rahim.id, workerId: siti.id, placeId: 'market-stall', wage: 100, startHour: 8, hours: 4, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 99, until: w.t + 60, worked: 0 };
    expect(perceive(w, siti).priceOffers).toEqual([]);
    expect(offered(perceive(w, siti), 'agree')).toBe(false);
    refused(act(w, siti.id, { verb: 'agree', from: 'Siti' }));
    expect(siti.items.vegetables).toBeUndefined();
  });

  it('a worker on shift takes an offer only down to four-fifths of the price; the owner can take any', () => {
    const { w, rahim, seng } = atStall();
    const siti = put(w, 'Siti', 'market-stall');
    w.state.jobs.push({ id: 99, employerId: rahim.id, workerId: siti.id, placeId: 'market-stall', wage: 100, startHour: 8, hours: 4, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 99, until: w.t + 60, worked: 0 };
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '15¢' }));
    expect(refused(act(w, siti.id, { verb: 'agree', from: 'Ah Seng' }))).toBe("That's below what Rahim lets you take.");
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }));
    expect(seng.items.vegetables).toBe(1);
  });

  it('never charges more than the shop asks when the offer is taken', () => {
    const { w, rahim, seng } = atStall();
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '18¢' }));
    w.shop('market-stall')!.sellPrices.vegetables = 12;
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Ah Seng' }));
    expect(seng.money).toBe(488);
  });

  it('the buyer hears when an offer lapses', () => {
    const { w, seng } = atStall();
    accepted(act(w, seng.id, { verb: 'buy', item: 'vegetables', money: '16¢' }));
    for (let i = 0; i < 6; i++) advance(w);
    expect(seng.recent.some((o) => o.text === "Rahim didn't take your offer for the vegetables.")).toBe(true);
    expectInWorld("Rahim didn't take your offer for the vegetables.");
  });
});

describe('the live case: haggled at the counter, then bought at the price agreed', () => {
  it('exactly one purchase, at the price agreed', async () => {
    const start = sgt(9, 0) - 1;
    const events: GameEvent[] = [];
    const sengScript: (Intent | null)[] = [
      { verb: 'say', to: 'Rahim', text: 'Rahim, 16¢ for a bunch of vegetables?' },
      null,
      { verb: 'buy', item: 'vegetables', money: '16¢' },
    ];
    const sengBrain: Brain = { decide: () => sengScript.shift() ?? null, save: () => null, load: () => {} };
    let said = false;
    const rahimBrain: Brain = {
      decide: (p) => {
        if (p.priceOffers.length) return { verb: 'agree', from: p.priceOffers[0]!.from };
        if (!said && p.talk.some((l) => l.startsWith('Ah Seng says to you'))) {
          said = true;
          return { verb: 'say', to: 'Ah Seng', text: '16¢ is fine, the bunch is yours.' };
        }
        return null;
      },
      save: () => null,
      load: () => {},
    };
    const idle: Brain = { decide: () => null, save: () => null, load: () => {} };
    const town = Town.create(1, start, { onEvent: (e) => events.push(e), brains: (r) => (r.name === 'Ah Seng' ? sengBrain : r.name === 'Rahim' ? rahimBrain : idle) });
    const shop = town.world.shop('market-stall')!;
    shop.sellPrices = { vegetables: 20, fish: 30 };
    put(town.world, 'Rahim', 'market-stall');
    put(town.world, 'Ah Seng', 'market-stall').money = 500;
    for (const r of town.world.state.residents) r.thinkAt = start + 100;
    who(town.world, 'Ah Seng').thinkAt = start + 1;
    for (let i = 0; i < 30; i++) {
      await town.runUntil(town.t + 1);
      // Ah Seng thinks every minute for the test; the town would pace him itself.
      who(town.world, 'Ah Seng').thinkAt = Math.min(who(town.world, 'Ah Seng').thinkAt, town.t + 1);
    }
    const bought = events.filter((e) => e.type === 'bought');
    expect(bought).toHaveLength(1);
    expect(bought[0]).toMatchObject({ cents: 16 });
    expectInWorld(feedLine(bought[0]!, (id) => town.world.resident(id).name)!.text);
  });
});

describe('giving nothing', () => {
  it('a gift of no money or none of something is refused in plain words, and nothing happens', () => {
    const w = newWorld(9);
    const seng = put(w, 'Ah Seng', 'well');
    put(w, 'Raju', 'well');
    seng.money = 100;
    seng.items = { fish: 2 };
    w.takeEvents();
    for (const i of [
      { verb: 'give', to: 'Raju', money: 0 }, { verb: 'give', to: 'Raju', money: '0¢' }, { verb: 'give', to: 'Raju', money: '$0.00' },
      { verb: 'give', to: 'Raju', item: 'fish', qty: 0 }, { verb: 'give', to: 'Raju' }, { verb: 'give', to: 'Raju', item: '' },
    ]) refused(act(w, seng.id, i), /^You'd be giving nothing\.$/);
    expect(w.takeEvents()).toEqual([]);
    // Lending, paying back and trades refuse nothing too.
    refused(act(w, seng.id, { verb: 'lend', to: 'Raju', money: '0¢' }));
    refused(act(w, seng.id, { verb: 'offer_trade', to: 'Raju', give: { items: {}, cents: 0 }, want: { items: { fish: 1 }, cents: 0 } }));
    expect(w.takeEvents()).toEqual([]);
  });
});
