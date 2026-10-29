import { describe, expect, it } from 'vitest';
import { availableActions } from '../src/sim/actions/index.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

// Kampung, 2026-10-29, items (a)-(e): from the live save, game day 20768.
const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const verbs = (w: World, name: string) => availableActions(w, who(w, name)).map((a) => a.verb);

/** Ah Kow on his shift at the kopitiam, Ah Huat away, grilled fish on the counter. */
function onShift() {
  const w = newWorld(13, 0);
  const huat = put(w, 'Ah Huat', 'well');
  const kow = put(w, 'Ah Kow', 'kopitiam');
  kow.money = 600;
  kow.hunger = 800;
  const shop = w.shop('kopitiam')!;
  shop.stock = { 'grilled fish': 3 };
  shop.sellPrices = { 'grilled fish': 85 };
  w.state.jobs.push({ id: 99, employerId: huat.id, workerId: kow.id, placeId: 'kopitiam', wage: 25, startHour: 12, hours: 4, lastWorkedDay: null });
  kow.activity = { kind: 'working', jobId: 99, until: w.t + 120 } as never;
  return { w, huat, kow, shop };
}

describe('(a) a worker on shift buys from the counter they mind', () => {
  it('at its price, the money to the owner through the ledger, and can eat it there', () => {
    const { w, huat, kow, shop } = onShift();
    expect(verbs(w, 'Ah Kow')).toContain('buy');
    const before = huat.money;
    w.takeLedger();
    accepted(act(w, kow.id, { verb: 'buy', item: 'grilled fish' }));
    expect(kow.money).toBe(600 - 85);
    expect(huat.money).toBe(before + 85);
    expect(w.takeLedger().some((l) => l.from === kow.id && l.to === huat.id && l.cents === 85)).toBe(true);
    expect(shop.stock['grilled fish']).toBe(2);
    expect(verbs(w, 'Ah Kow')).toContain('eat');
    accepted(act(w, kow.id, { verb: 'eat', item: 'grilled fish' }));
    expect(kow.hunger).toBeLessThan(800);
    expect(kow.activity?.kind).toBe('working');
  });

  it('but not anywhere else in the middle of a shift', () => {
    const { w, kow } = onShift();
    w.state.lorryHere = true;
    put(w, 'Ah Kow', 'lorry-stop');
    kow.activity = { kind: 'working', jobId: 99, until: w.t + 120 } as never;
    expect(refused(act(w, kow.id, { verb: 'buy', item: 'bread' }))).toMatch(/shift/);
  });
});

describe('(b) money given with nothing back, as they remember it', () => {
  it('shows when with that person, and when giving again; anything back from them ends it', () => {
    const w = newWorld(19, 0);
    const kow = put(w, 'Ah Kow', 'kopitiam');
    const tan = put(w, 'Mdm Tan', 'kopitiam');
    kow.money = 1000;
    accepted(act(w, kow.id, { verb: 'give', to: 'Mdm Tan', money: '$1.05' }));
    const again = accepted(act(w, kow.id, { verb: 'give', to: 'Mdm Tan', money: '85¢' })).reply ?? '';
    expectInWorld(again);
    expect(again).toMatch(/Today you've given Mdm Tan \$1\.90 and had nothing back\./);
    expect(seen(w, 'Ah Kow')).toMatch(/Today you've given Mdm Tan \$1\.90 and had nothing back\./);
    put(w, 'Ah Kow', 'well');
    expect(seen(w, 'Ah Kow')).not.toMatch(/given Mdm Tan/);
    put(w, 'Ah Kow', 'kopitiam');
    tan.items = { coconut: 1 };
    accepted(act(w, tan.id, { verb: 'give', to: 'Ah Kow', item: 'coconut' }));
    expect(seen(w, 'Ah Kow')).not.toMatch(/given Mdm Tan/);
  });

  it('a new day starts the count again', () => {
    const w = newWorld(19, 0);
    const kow = put(w, 'Ah Kow', 'kopitiam');
    put(w, 'Mdm Tan', 'kopitiam');
    kow.money = 1000;
    accepted(act(w, kow.id, { verb: 'give', to: 'Mdm Tan', money: '50¢' }));
    w.state.t += 1440;
    expect(seen(w, 'Ah Kow')).not.toMatch(/given Mdm Tan/);
  });
});

describe('(c) what they could cook at home, from what they really have', () => {
  it('rice in their own shop, water in hand, no fuel: names the stove wanting fuel', () => {
    const w = newWorld(19, 0);
    const tan = put(w, 'Mdm Tan', who(w, 'Mdm Tan').homeId);
    tan.hunger = 800;
    tan.items = { water: 4 };
    w.shop('provision-shop')!.stock = { rice: 15 };
    w.state.stoves[tan.homeId] = 0;
    const text = seen(w, 'Mdm Tan');
    expect(text).toMatch(/You could cook bubur at home/);
    expect(text).toMatch(/rice in your shop's stock/);
    expect(text).toMatch(/firewood|kerosene/);
  });

  it('everything to hand: just says they could cook it', () => {
    const w = newWorld(19, 0);
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 800;
    siti.items = { rice: 1, water: 1, firewood: 1 };
    expect(seen(w, 'Siti')).toMatch(/You could cook bubur at home: you have what it takes\./);
  });

  it('two things missing, or not hungry: nothing said', () => {
    const w = newWorld(19, 0);
    const siti = put(w, 'Siti', 'well');
    siti.hunger = 800;
    siti.items = { rice: 1 };
    w.state.stoves[siti.homeId] = 0;
    expect(seen(w, 'Siti')).not.toMatch(/cook bubur/);
    siti.items = { rice: 1, water: 1, firewood: 1 };
    siti.hunger = 100;
    expect(seen(w, 'Siti')).not.toMatch(/cook bubur/);
  });
});

describe('(d) the food someone nearby is holding', () => {
  it('shows beside them, food only', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    put(w, 'Aminah', 'well');
    fatimah.items = { 'boiled kangkong': 2, water: 3 };
    const text = seen(w, 'Aminah');
    expect(text).toMatch(/Fatimah \([^)]*holding 2 plates of boiled kangkong\)/);
    expect(text).not.toMatch(/holding[^)]*water/);
  });
});

describe('(e) sharing a meal', () => {
  it('a cook holding food serves hungry family with them, one serving each, eaten as if by themselves', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    const aminah = put(w, 'Aminah', 'well');
    const hassan = put(w, 'Hassan', 'well');
    const raju = put(w, 'Raju', 'well');
    fatimah.items = { 'boiled kangkong': 2, 'grilled fish': 1 };
    fatimah.hunger = 100;
    aminah.hunger = 700;
    hassan.hunger = 600;
    raju.hunger = 900;
    expect(verbs(w, 'Fatimah')).toContain('share meal');
    w.takeEvents();
    expectInWorld(accepted(act(w, fatimah.id, { verb: 'share_meal' })).reply ?? '');
    expect(aminah.hunger).toBe(700 - 160);
    expect(hassan.hunger).toBe(600 - 160);
    // Raju isn't family or household: not served.
    expect(raju.hunger).toBe(900);
    expect(fatimah.items['boiled kangkong'] ?? 0).toBe(0);
    expect(w.takeEvents().filter((e) => e.type === 'ate')).toHaveLength(2);
    expect(aminah.recent.some((m) => /Fatimah/.test(m.text))).toBe(true);
  });

  it('offered only with real food in hand and someone hungry of theirs with them', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    const aminah = put(w, 'Aminah', 'well');
    aminah.hunger = 700;
    fatimah.items = { water: 2 };
    expect(verbs(w, 'Fatimah')).not.toContain('share meal');
    fatimah.items = { bubur: 2 };
    aminah.hunger = 100;
    expect(verbs(w, 'Fatimah')).not.toContain('share meal');
    refused(act(w, fatimah.id, { verb: 'share_meal' }));
  });
});

describe('(a)-(e), after review', () => {
  it('(b) a meal shared, a debt repaid or wages paid from that person count as something back', () => {
    const w = newWorld(19, 0);
    const siti = put(w, 'Siti', 'well');
    const mak = put(w, 'Mak Esah', 'well');
    siti.money = 1000;
    siti.hunger = 700;
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', money: '$3' }));
    expect(seen(w, 'Siti')).toMatch(/given Mak Esah/);
    mak.items = { bubur: 1 };
    accepted(act(w, mak.id, { verb: 'share_meal' }));
    expect(seen(w, 'Siti')).not.toMatch(/given Mak Esah/);
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', money: '$1' }));
    expect(seen(w, 'Siti')).not.toMatch(/given Mak Esah/);
    w.state.t += 1440;
    accepted(act(w, siti.id, { verb: 'give', to: 'Mak Esah', money: '$1' }));
    expect(seen(w, 'Siti')).toMatch(/given Mak Esah/);
    w.transfer(mak.id, siti.id, 50, 'repaid');
    expect(seen(w, 'Siti')).not.toMatch(/given Mak Esah/);
  });

  it('(e) a named food they do not hold is refused, not swapped; someone busy is not served', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    const aminah = put(w, 'Aminah', 'well');
    const hassan = put(w, 'Hassan', 'well');
    aminah.hunger = 700;
    hassan.hunger = 700;
    fatimah.items = { fish: 3 };
    expect(refused(act(w, fatimah.id, { verb: 'share_meal', item: 'bubur' }))).toMatch(/bubur/);
    hassan.activity = { kind: 'chore', chore: 'fetch_water', until: w.t + 10 } as never;
    accepted(act(w, fatimah.id, { verb: 'share_meal', item: 'fish' }));
    expect(aminah.hunger).toBeLessThan(700);
    expect(hassan.hunger).toBe(700);
  });

  it('(c) raw fish in hand: told they could grill it at home', () => {
    const w = newWorld(19, 0);
    const raju = put(w, 'Raju', 'well');
    raju.hunger = 800;
    raju.items = { fish: 2, firewood: 1 };
    expect(seen(w, 'Raju')).toMatch(/You could cook grilled fish at home: you have what it takes\./);
  });

  it('(d) a keeper at their own stall is not "holding" their wares', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'market-stall');
    put(w, 'Siti', 'market-stall');
    rahim.items = { fish: 14 };
    expect(seen(w, 'Siti')).not.toMatch(/Rahim \([^)]*holding/);
    put(w, 'Rahim', 'well');
    put(w, 'Siti', 'well');
    expect(seen(w, 'Siti')).toMatch(/Rahim \([^)]*holding 14 fish/);
  });
});
