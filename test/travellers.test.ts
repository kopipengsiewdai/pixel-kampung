import { describe, expect, it } from 'vitest';
import { FakeBrain } from '../src/brain/fake-brain.ts';
import { feedLine } from '../src/feed/feed.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { TRAVELLERS_ID, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { minuteOfDay } from '../src/sim/time.ts';
import { QUEUE_MAX, SERVE_MINUTES, TRAVELLER_PAYS, WAIT_MINUTES as QUEUE_WAIT } from '../src/sim/travellers.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));

/** Runs the world on, keeping the named residents standing where they are. */
function run(w: World, minutes: number, keep: string[] = [], events: GameEvent[] = []): GameEvent[] {
  for (let i = 0; i < minutes; i++) {
    advance(w);
    for (const n of keep) {
      const r = who(w, n);
      if (r.activity?.kind !== 'working') r.activity = null;
      r.energy = 900;
      r.hunger = 100;
    }
    events.push(...w.takeEvents());
  }
  return events;
}

describe('travellers from the coast road', () => {
  it('come to the kopitiam every 5 minutes in the morning rush, and pay into the shop from outside', () => {
    const w = newWorld(6, 29);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const before = huat.money;
    w.takeLedger();
    run(w, 31, ['Ah Huat']);
    const shop = w.shop('kopitiam')!;
    // 06:30, 06:35, … 07:00: seven came; all but the last are served.
    expect(shop.today.served + shop.queue.length + shop.serving.length).toBe(7);
    expect(shop.today.served).toBeGreaterThanOrEqual(5);
    expect(huat.money).toBeGreaterThan(before);
    const ledger = w.takeLedger();
    expect(ledger.length).toBe(shop.today.served);
    expect(ledger.every((l) => l.from === TRAVELLERS_ID && l.to === huat.id)).toBe(true);
  });

  it('about 80 a day at the kopitiam with someone always serving, with no daily budget', () => {
    const w = newWorld(0, 0);
    w.dials = { ...w.dials, travellerBudgetCents: Infinity };
    put(w, 'Ah Huat', 'kopitiam');
    const shop = w.shop('kopitiam')!;
    shop.stock = { kopi: 999, 'fish porridge': 999, 'vegetable rice': 999 };
    let came = 0;
    for (let i = 0; i < 1440; i++) {
      const before = shop.today.served + shop.today.left + shop.today.away + shop.queue.length + shop.serving.length + Object.values(shop.today.tooDear).reduce((a, b) => a + b!, 0);
      run(w, 1, ['Ah Huat']);
      if (minuteOfDay(w.t) === 0) continue;
      const after = shop.today.served + shop.today.left + shop.today.away + shop.queue.length + shop.serving.length + Object.values(shop.today.tooDear).reduce((a, b) => a + b!, 0);
      came += Math.max(0, after - before);
    }
    expect(came).toBeGreaterThan(70);
    expect(came).toBeLessThan(90);
  });

  it('find nobody serving when the owner is away, and the owner hears of it on coming back', () => {
    const w = newWorld(6, 29);
    put(w, 'Ah Huat', 'well');
    run(w, 31);
    const shop = w.shop('kopitiam')!;
    expect(shop.today.away).toBe(7);
    expect(shop.today.served).toBe(0);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    run(w, 1, ['Ah Huat']);
    expect(huat.recent.some((o) => o.text === 'While you were away, 7 people found nobody serving.')).toBe(true);
  });

  it('turn away at a price over what they will pay, and the owner sees it', () => {
    const w = newWorld(6, 29);
    put(w, 'Ah Huat', 'kopitiam');
    const shop = w.shop('kopitiam')!;
    shop.stock = { 'fish porridge': 20 };
    shop.sellPrices = { 'fish porridge': TRAVELLER_PAYS['fish porridge']! + 10 };
    run(w, 11, ['Ah Huat']);
    expect(shop.today.tooDear['fish porridge']).toBe(3);
    expect(seen(w, 'Ah Huat')).toContain('Three people turned away at your fish porridge price.');
  });

  it(`wait ${QUEUE_WAIT} minutes at most, ${QUEUE_MAX} in the queue, and leave unserved`, () => {
    const w = newWorld(6, 0);
    put(w, 'Rahim', 'market-stall');
    const shop = w.shop('market-stall')!;
    shop.stock = { fish: 99, vegetables: 99 };
    // Rahim is busy with someone the whole time: nobody else gets served.
    shop.serving = [{ by: who(w, 'Rahim').id, item: 'fish', until: w.t + 1000 }];
    run(w, 30, ['Rahim']);
    expect(shop.queue.length).toBeLessThanOrEqual(QUEUE_MAX);
    expect(shop.today.left).toBeGreaterThan(0);
    expect(shop.queue.every((c) => w.t - c.t <= QUEUE_WAIT)).toBe(true);
  });

  it('a worker on shift serves too, and knows how many', () => {
    const w = newWorld(6, 29);
    const huat = put(w, 'Ah Huat', 'well');
    const siti = put(w, 'Siti', 'kopitiam');
    w.state.jobs.push({ id: 99, employerId: huat.id, workerId: siti.id, placeId: 'kopitiam', wage: 100, startHour: 6, hours: 4, lastWorkedDay: null });
    siti.activity = { kind: 'working', jobId: 99, until: w.t + 240, worked: 0 };
    const before = huat.money;
    run(w, 31, ['Siti']);
    const shop = w.shop('kopitiam')!;
    expect(shop.today.served).toBeGreaterThanOrEqual(5);
    expect(huat.money).toBeGreaterThan(before);
    expect(seen(w, 'Siti')).toContain(`You've served ${shop.today.served} people this shift.`);
  });

  it('serving takes its time, and tires like a shift', () => {
    const w = newWorld(6, 29);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    advance(w);
    w.takeEvents();
    const shop = w.shop('kopitiam')!;
    expect(shop.serving).toMatchObject([{ by: huat.id, until: w.t + SERVE_MINUTES }]);
    const e = huat.energy;
    advance(w);
    expect(huat.energy).toBe(e - 1);
  });

  it('between customers, waiting at the counter tires no more than standing about anywhere', () => {
    // 10:00–11:00: a quiet hour at the provision shop (one traveller every 30 minutes).
    const w = newWorld(10, 0);
    const tan = put(w, 'Mdm Tan', 'provision-shop');
    const raju = put(w, 'Raju', 'well');
    tan.energy = raju.energy = 900;
    for (let i = 0; i < 60; i++) {
      advance(w);
      tan.hunger = raju.hunger = 100;
      for (const r of [tan, raju]) if (r.activity?.kind === 'walking') r.activity = null;
    }
    // Two served in the hour, two minutes each: four minutes tired as at work, the rest as standing about.
    expect(raju.energy - tan.energy).toBeLessThanOrEqual(2 * SERVE_MINUTES);
  });

  it('a busy shop is seen for what it is: the owner sees who waits, a visitor sees someone serving alone', () => {
    const w = newWorld(6, 0);
    put(w, 'Rahim', 'market-stall');
    const shop = w.shop('market-stall')!;
    shop.serving = [{ by: who(w, 'Rahim').id, item: 'fish', until: w.t + 1000 }];
    shop.queue = [{ item: 'fish', t: w.t }, { item: 'vegetables', t: w.t }, { item: 'fish', t: w.t }];
    put(w, 'Siti', 'market-stall');
    expect(seen(w, 'Rahim')).toContain('Three travellers from the road are waiting to be served.');
    const s = seen(w, 'Siti');
    expect(s).toContain('Rahim is serving alone, and three travellers are waiting.');
    for (const line of [...seen(w, 'Rahim').split('\n'), ...s.split('\n')]) expectInWorld(line);
  });

  it("stop coming for the day once a shop's travellers have spent its daily budget (an owner's dial)", () => {
    const w = newWorld(0, 0);
    put(w, 'Ah Huat', 'kopitiam');
    const shop = w.shop('kopitiam')!;
    shop.stock = { kopi: 999, 'fish porridge': 999, 'vegetable rice': 999 };
    expect(w.dials.travellerBudgetCents).toBe(600);
    w.dials = { ...w.dials, travellerBudgetCents: 300 };
    run(w, 1439, ['Ah Huat']);
    // Those already queued when the budget ran out are still served: a few cents over at most.
    expect(shop.today.cents).toBeGreaterThanOrEqual(300);
    expect(shop.today.cents).toBeLessThan(300 + 5 * 50);
    // The rest of the day nobody came: none left unserved or found nobody serving.
    expect(shop.today.left + shop.today.away).toBe(0);
    const served = shop.today.served;
    expect(served).toBeLessThan(30);
  });

  it("an owner away from the shop doesn't see today's count; they hear who found nobody serving on coming back", () => {
    const w = newWorld(6, 29);
    put(w, 'Ah Huat', 'kopitiam');
    run(w, 31, ['Ah Huat']);
    expect(seen(w, 'Ah Huat')).toMatch(/Today you've served \d+/);
    put(w, 'Ah Huat', 'well');
    expect(seen(w, 'Ah Huat')).not.toMatch(/Today you've served|left without being served|turned away/);
  });

  it('the feed gets one line an hour per busy shop', () => {
    const w = newWorld(6, 29);
    put(w, 'Ah Huat', 'kopitiam');
    const events = run(w, 31, ['Ah Huat']);
    const hour = events.find((e) => e.type === 'travellers_hour')!;
    expect(hour).toMatchObject({ shop: 'kopitiam' });
    expect(feedLine(hour, (id) => w.resident(id).name)!.text).toMatch(/^Travellers from the road bought \d+ things at the kopitiam this past hour, for \$?\d/);
  });
});

describe('cooking takes time', () => {
  it('a batch takes 10 minutes at the stove (kopi 5) for a novice cook; nothing else meanwhile, and no serving', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    huat.skills = {};
    const shop = w.shop('kopitiam')!;
    shop.stock = { fish: 2, rice: 2, water: 2 };
    const res = accepted(act(w, huat.id, { verb: 'cook', item: 'fish porridge', batches: 2 }));
    expect(res.reply).toBe('You start cooking 2 batches of fish porridge.');
    expect(huat.stove).toMatchObject({ item: 'fish porridge', batches: 2, until: w.t + 20 });
    expect([shop.stock.fish ?? 0, shop.stock.rice ?? 0, shop.stock.water ?? 0]).toEqual([0, 0, 0]);
    refused(act(w, huat.id, { verb: 'walk_to', where: 'the jetty' }), /busy at the stove/);
    accepted(act(w, huat.id, { verb: 'say', text: 'Almost ready!' }));
    for (let i = 0; i < 19; i++) advance(w);
    expect(huat.stove).not.toBeNull();
    expect(shop.serving).toEqual([]);
    advance(w);
    expect(huat.stove).toBeNull();
    expect(shop.stock['fish porridge']).toBe(4);
    expect(huat.recent.at(-1)!.text).toBe('The fish porridge is ready: 4 bowls of fish porridge.');
  });
});

describe('the free fake brain, with customers', () => {
  it('an owner hires whoever asked once five customers have left unserved today', () => {
    const w = newWorld(9);
    put(w, 'Ah Huat', 'kopitiam');
    put(w, 'Siti', 'kopitiam');
    const huat = who(w, 'Ah Huat');
    huat.money = 2000;
    w.remember(huat.id, 'Siti says to you: "Any work going, boss?"', true);
    const shop = w.shop('kopitiam')!;
    shop.buyPrices.water = 8;
    shop.today.left = 4;
    const decide = () => {
      const b = new FakeBrain(3);
      for (let i = 0; i < 20; i++) {
        const d = b.decide(perceive(w, huat));
        if (d?.verb === 'offer_job') return d;
      }
      return null;
    };
    expect(decide()).toBeNull();
    shop.today.left = 5;
    expect(decide()).toMatchObject({ verb: 'offer_job', to: 'Siti' });
  });

  it('a hungry owner still meets the lorry and restocks first', () => {
    const w = newWorld(6, 50);
    const tan = put(w, 'Mdm Tan', 'lorry-stop');
    w.state.lorryHere = true;
    tan.hunger = 800;
    tan.money = 5000;
    w.shop('provision-shop')!.stock = {};
    expect(new FakeBrain(1).decide(perceive(w, tan))).toMatchObject({ verb: 'order_stock' });
  });

  it("a hungry resident who finds no food doesn't walk back and forth between the shops: after the provision shop, off to fish", () => {
    const w = newWorld(12);
    for (const s of w.state.shops) s.stock = {};
    const tan = who(w, 'Mdm Tan');
    tan.hunger = 800;
    tan.money = 5000;
    const b = new FakeBrain(1);
    const where = (place: string) => {
      put(w, 'Mdm Tan', place);
      const d = b.decide(perceive(w, tan));
      return d?.verb === 'walk_to' ? d.where : d?.verb;
    };
    expect(where('kopitiam')).toBe('the wet-market stall');
    expect(where('market-stall')).toBe('the provision shop');
    expect(where('provision-shop')).toBe('the jetty');
  });

  it('a seeker asks for work on seeing someone serving alone', () => {
    const w = newWorld(6, 0);
    put(w, 'Rahim', 'market-stall');
    const siti = put(w, 'Siti', 'market-stall');
    const shop = w.shop('market-stall')!;
    shop.serving = [{ by: who(w, 'Rahim').id, item: 'fish', until: w.t + 1000 }];
    shop.queue = [{ item: 'fish', t: w.t }, { item: 'vegetables', t: w.t }];
    expect(new FakeBrain(1).decide(perceive(w, siti))).toEqual({ verb: 'say', to: 'Rahim', text: 'You look busy. Any work going, boss?' });
  });
});

describe('the upgrade: shops open their doors to the road', () => {
  it('every shop gets an empty queue and a fresh day; nobody is at the stove', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 9)!;
    const world = { t: 3 * 1440, shops: [{ id: 'kopitiam', stock: {} }], residents: [{ id: 'a' }] };
    const up = step.save!({ world, brains: {} }).world as { shops: Record<string, unknown>[]; residents: Record<string, unknown>[] };
    expect(up.shops[0]).toMatchObject({ queue: [], serving: [], today: { day: 3, served: 0, cents: 0, left: 0, away: 0, awayTold: 0, tooDear: {}, servedBy: {} }, hour: { served: 0, cents: 0, left: 0 } });
    expect(up.residents[0]).toMatchObject({ stove: null });
  });
});
