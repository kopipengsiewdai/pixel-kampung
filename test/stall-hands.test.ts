import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** Rahim with the day's catch, his stall priced for fish but empty (the living town, 2026-10-28). */
function catchInHand(hour = 9) {
  const w = newWorld(hour, 0);
  const rahim = put(w, 'Rahim', 'market-stall');
  rahim.items = { fish: 24 };
  const stall = w.shop('market-stall')!;
  stall.stock = {};
  stall.sellPrices = { fish: 60 };
  return { w, rahim, stall };
}

// Owner rule via Kampung, 2026-10-28: what a keeper carries at their own stall sells at their price.
describe('what a keeper carries at their own stall is for sale there', () => {
  it('a villager buys fish from the catch in his hands', () => {
    const { w, rahim } = catchInHand();
    const tan = put(w, 'Mdm Tan', 'market-stall');
    tan.money = 1000;
    const before = rahim.money;
    accepted(act(w, tan.id, { verb: 'buy', item: 'fish', qty: 2 }));
    expect(tan.items.fish).toBe(2);
    expect(rahim.items.fish).toBe(22);
    expect(rahim.money).toBe(before + 120);
  });

  it('the stock goes first, then what he carries', () => {
    const { w, rahim, stall } = catchInHand();
    stall.stock = { fish: 1 };
    const tan = put(w, 'Mdm Tan', 'market-stall');
    tan.money = 1000;
    accepted(act(w, tan.id, { verb: 'buy', item: 'fish', qty: 2 }));
    expect(stall.stock.fish ?? 0).toBe(0);
    expect(rahim.items.fish).toBe(23);
  });

  it('travellers buy from it too', () => {
    const { w, rahim, stall } = catchInHand(6);
    stall.sellPrices.fish = 50; // what the road will pay for a fish
    const before = rahim.money;
    for (let i = 0; i < 120; i++) {
      advance(w);
      rahim.activity = null; rahim.energy = 900; rahim.hunger = 100;
    }
    expect(rahim.items.fish).toBeLessThan(24);
    expect(rahim.money).toBeGreaterThan(before);
  });

  it('away from his stall, what he carries isn\'t on its counter', () => {
    const { w, rahim, stall } = catchInHand();
    // Someone minding it for him, while he's at the jetty.
    const muthu = put(w, 'Muthu', 'market-stall');
    w.state.jobs.push({ id: 99, employerId: rahim.id, workerId: muthu.id, placeId: 'market-stall', wage: 50, startHour: 8, hours: 4, lastWorkedDay: null });
    muthu.activity = { kind: 'working', jobId: 99, until: w.t + 120, worked: 0 };
    put(w, 'Rahim', 'jetty');
    const tan = put(w, 'Mdm Tan', 'market-stall');
    tan.money = 1000;
    refused(act(w, tan.id, { verb: 'buy', item: 'fish' }), /run out/);
    expect(stall.stock.fish ?? 0).toBe(0);
  });

  it('he sees it: at the stall, his catch counts as what he has to sell; away, he hears it would sell there', () => {
    const { w } = catchInHand();
    expect(seen(w, 'Rahim')).toMatch(/fish 60¢ \(24 left\)/);
    put(w, 'Rahim', 'jetty');
    const away = seen(w, 'Rahim');
    expect(away).toMatch(/fish 60¢ \(sold out\)/);
    const line = away.split('\n').find((l) => /24 fish/.test(l) && /stall/.test(l)) ?? '';
    expect(line).toMatch(/at your price/);
    expectInWorld(line);
  });

  it('at his stall, putting things into stock is called that', () => {
    const { w, rahim } = catchInHand();
    const sell = availableActions(w, rahim).find((a) => a.verb === 'sell');
    expect(sell?.says).toMatch(/into your stock/);
  });
});
