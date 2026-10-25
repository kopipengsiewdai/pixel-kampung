import { describe, expect, it } from 'vitest';
import { catchFish } from '../src/sim/activities.ts';
import { perceive } from '../src/sim/perception.ts';
import { SKILL_LINES, threshold, type SkillId } from '../src/sim/skills.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { MASTER_PAYS, TRAVELLER_PAYS, travellerPays } from '../src/sim/travellers.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const offered = (w: World, name: string, verb: string) => perceive(w, who(w, name)).actions.some((a) => a.verb === verb);
function skill(w: World, name: string, s: SkillId, level: number) {
  const r = who(w, name);
  r.skills[s] = { xp: threshold(s, level), peak: level, lastDay: dayIndex(w.t), today: { day: dayIndex(w.t), xp: 0 }, rusty: false, drops: 0 };
  return r;
}
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) advance(w); };

describe('fishing: a net, and the red snapper', () => {
  it('a skilled fisher with mended nets can cast a net: 45 minutes, 0–4 fish, a mended catch used, two deeds', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    siti.mended = { day: dayIndex(w.t), left: 3 };
    expect(offered(w, 'Siti', 'cast net')).toBe(false);
    refused(act(w, siti.id, { verb: 'cast_net' }), /never got the hang/);
    skill(w, 'Siti', 'fishing', 3);
    expect(offered(w, 'Siti', 'cast net')).toBe(true);
    accepted(act(w, siti.id, { verb: 'cast_net' }));
    expect(siti.mended.left).toBe(2);
    siti.hunger = 100;
    run(w, 45);
    expect(siti.activity).toBeNull();
    expect(siti.items.fish ?? 0).toBeLessThanOrEqual(4);
    expect(siti.skills.fishing!.xp).toBe(threshold('fishing', 3) + 2);
    siti.mended = null;
    refused(act(w, siti.id, { verb: 'cast_net' }), /need mending/);
  });

  it('a master brings up a red snapper about one line in twelve', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'jetty');
    for (let i = 0; i < 240; i++) catchFish(w, rahim);
    expect(rahim.items['red snapper'] ?? 0).toBeGreaterThan(8);
    expect(rahim.items['red snapper'] ?? 0).toBeLessThan(35);
    const siti = put(w, 'Siti', 'jetty');
    for (let i = 0; i < 240; i++) catchFish(w, siti);
    expect(siti.items['red snapper'] ?? 0).toBe(0);
  });
});

describe('farming: chilli, and a papaya tree', () => {
  it('a skilled grower can plant chilli: four watered days, four handfuls (and one more for a handy hand)', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    refused(act(w, siti.id, { verb: 'plant', item: 'chilli' }), /don't know how to grow chilli/);
    skill(w, 'Siti', 'farming', 3);
    expect(perceive(w, siti).actions.find((a) => a.verb === 'plant')!.says).toContain('chilli');
    accepted(act(w, siti.id, { verb: 'plant', item: 'chilli' }));
    for (let d = 0; d < 4; d++) {
      accepted(act(w, siti.id, { verb: 'water' }));
      if (d < 3) refused(act(w, siti.id, { verb: 'harvest' }), /aren't ready yet/);
      w.state.t += 1440;
    }
    // On the day it's ready: four, one more for a handy hand, two more for the day.
    accepted(act(w, siti.id, { verb: 'harvest' }));
    expect(siti.items.chilli).toBe(4 + 1 + 2);
  });

  it('a master can plant a papaya tree: fruit after ten days, then every three while watered; the tree stays', () => {
    const w = newWorld(9);
    const fat = skill(w, 'Fatimah', 'farming', 5);
    put(w, 'Fatimah', 'farm');
    accepted(act(w, fat.id, { verb: 'plant', item: 'a papaya tree' }));
    const bed = w.state.beds.find((b) => b.planterId === fat.id)!;
    expect(bed.crop).toBe('papaya');
    w.state.t += 9 * 1440;
    accepted(act(w, fat.id, { verb: 'water' }));
    refused(act(w, fat.id, { verb: 'harvest' }), /Nothing on your tree is ripe yet/);
    w.state.t += 1440;
    accepted(act(w, fat.id, { verb: 'harvest' }));
    expect(fat.items.papaya).toBe(2);
    expect(bed.planterId).toBe(fat.id);
    w.state.t += 2 * 1440;
    refused(act(w, fat.id, { verb: 'harvest' }), /Nothing on your tree is ripe yet/);
    w.state.t += 1440;
    accepted(act(w, fat.id, { verb: 'water' }));
    accepted(act(w, fat.id, { verb: 'harvest' }));
    expect(fat.items.papaya).toBe(4);
    // Left dry more than three days, it bears nothing.
    w.state.t += 4 * 1440;
    refused(act(w, fat.id, { verb: 'harvest' }), /Nothing on your tree/);
  });
});

describe('cooking: sambal kangkong, and a master\'s dish', () => {
  it('a skilled cook knows sambal kangkong (vegetables and chilli, three plates); others don\'t', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    huat.skills = {};
    const shop = w.shop('kopitiam')!;
    shop.stock = { vegetables: 2, chilli: 2 };
    refused(act(w, huat.id, { verb: 'cook', item: 'sambal kangkong' }), /don't know how to make/);
    skill(w, 'Ah Huat', 'cooking', 3);
    accepted(act(w, huat.id, { verb: 'cook', item: 'sambal kangkong' }));
    run(w, 8);
    expect(shop.stock['sambal kangkong']).toBe(3);
  });

  it('a master cook\'s batch gives one more serving, and travellers pay up to a fifth more there that day', () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const shop = w.shop('kopitiam')!;
    shop.stock = { fish: 1, rice: 1, water: 1 };
    expect(travellerPays(shop, 'fish porridge')).toBe(TRAVELLER_PAYS['fish porridge']);
    accepted(act(w, huat.id, { verb: 'cook', item: 'fish porridge' }));
    run(w, 10);
    expect(shop.stock['fish porridge']).toBe(3);
    expect(shop.today.masterCooked).toBe(true);
    expect(travellerPays(shop, 'fish porridge')).toBe(Math.round(TRAVELLER_PAYS['fish porridge']! * MASTER_PAYS));
  });
});

describe('the skilled are told what they can now do', () => {
  it('in words, and in-world', () => {
    expect(SKILL_LINES.fishing.up[1]).toBe("You've worked out how to throw a net.");
    expect(SKILL_LINES.farming.self[1]).toBe("You've learnt to grow chilli.");
    expect(SKILL_LINES.cooking.up[1]).toBe("You've worked out how to make sambal kangkong.");
    for (const s of Object.values(SKILL_LINES)) for (const line of Object.values(s).flat()) expectInWorld(line);
  });
});

describe('the upgrade', () => {
  it('every bed grows kangkong as before, and no master has cooked yet today', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 13)!;
    const world = { beds: [{ n: 1, planterId: 'siti' }], shops: [{ id: 'kopitiam', today: { day: 3, served: 1 } }] };
    const up = step.save!({ world, brains: {} }).world as { beds: Record<string, unknown>[]; shops: { today: Record<string, unknown> }[] };
    expect(up.beds[0]).toMatchObject({ crop: 'kangkong', pickedDay: null });
    expect(up.shops[0]!.today).toMatchObject({ day: 3, served: 1, masterCooked: false });
  });
});
