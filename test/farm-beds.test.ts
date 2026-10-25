import { describe, expect, it } from 'vitest';
import { feedText } from '../src/feed/feed.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { threshold } from '../src/sim/skills.ts';
import type { World } from '../src/sim/state.ts';
import { advanceTo } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { accepted, act, newWorld, put, refused, who } from './helpers.ts';

const names = (id: string) => (id === 'a' ? 'Siti' : id);
const text = (e: Record<string, unknown>) => feedText(e as unknown as GameEvent, names)?.text;
function farmer(w: World, name: string, level: number) {
  const r = who(w, name);
  r.skills.farming = { xp: threshold('farming', level), peak: level, lastDay: dayIndex(w.t), today: { day: dayIndex(w.t), xp: 0 }, rusty: false, drops: 0 };
  return r;
}
/** On to the next midnight, n times over. */
function days(w: World, n: number) {
  for (let i = 0; i < n; i++) advanceTo(w, (dayIndex(w.t) + 1) * 1440 + 1);
}

describe('the feed names the crop', () => {
  it('says what was planted, and an old line with no crop is kangkong', () => {
    expect(text({ type: 'planted', who: 'a', bed: 3, crop: 'chilli' })).toBe('Siti planted chilli in bed 3.');
    expect(text({ type: 'planted', who: 'a', bed: 3, crop: 'papaya' })).toBe('Siti planted a papaya tree in bed 3.');
    expect(text({ type: 'planted', who: 'a', bed: 3 })).toBe('Siti planted kangkong in bed 3.');
  });

  it('watering names no crop it does not know', () => {
    expect(text({ type: 'watered', who: 'a', beds: 1 })).toBe('Siti watered their bed.');
    expect(text({ type: 'watered', who: 'a', beds: 2 })).toBe('Siti watered their beds.');
  });

  it('planting records the crop on the event', () => {
    const w = newWorld(9);
    const siti = farmer(w, 'Siti', 3);
    put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'plant', item: 'chilli' }));
    expect(w.takeEvents().find((e) => e.type === 'planted')).toMatchObject({ crop: 'chilli' });
  });
});

describe('beds left dry wither and free up', () => {
  it('kangkong left three days without water withers, and the bed is free again', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'plant' }));
    const bed = w.state.beds.find((b) => b.planterId === siti.id)!;
    days(w, 2);
    expect(bed.planterId).toBe(siti.id);
    days(w, 1);
    expect(bed.planterId).toBeNull();
    expect(w.state.beds.filter((b) => b.planterId === siti.id)).toHaveLength(0);
  });

  it('a watered bed does not wither', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'plant' }));
    const bed = w.state.beds.find((b) => b.planterId === siti.id)!;
    for (let d = 0; d < 5; d++) {
      days(w, 1);
      put(w, 'Siti', 'farm');
      siti.activity = null;
      if (bed.planterId) act(w, siti.id, { verb: 'water' });
    }
    expect(bed.planterId).toBe(siti.id);
  });

  it('a papaya tree lasts a week dry, then dies and frees its bed', () => {
    const w = newWorld(9);
    const fat = farmer(w, 'Fatimah', 5);
    put(w, 'Fatimah', 'farm');
    accepted(act(w, fat.id, { verb: 'plant', item: 'papaya' }));
    const bed = w.state.beds.find((b) => b.planterId === fat.id)!;
    days(w, 6);
    expect(bed.planterId).toBe(fat.id);
    days(w, 1);
    expect(bed.planterId).toBeNull();
  });

  it('the planter is told, in-world', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'plant' }));
    days(w, 3);
    expect(w.takeEvents().find((e) => e.type === 'withered')).toMatchObject({ who: siti.id, crop: 'kangkong' });
    expect(siti.recent.some((m) => /kangkong in bed \d has withered/.test(m.text))).toBe(true);
    expect(text({ type: 'withered', who: 'a', bed: 1, crop: 'kangkong' })).toBe("Siti's kangkong in bed 1 withered.");
  });
});

describe("a papaya tree's first fruit needs regular watering", () => {
  it('watered once in ten days, it bears nothing; watered every few days, it fruits', () => {
    const w = newWorld(9);
    const fat = farmer(w, 'Fatimah', 5);
    put(w, 'Fatimah', 'farm');
    accepted(act(w, fat.id, { verb: 'plant', item: 'papaya' }));
    w.state.t += 9 * 1440;
    accepted(act(w, fat.id, { verb: 'water' }));
    w.state.t += 1440;
    refused(act(w, fat.id, { verb: 'harvest' }), /Nothing on your tree is ripe yet/);

    const w2 = newWorld(9);
    const fat2 = farmer(w2, 'Fatimah', 5);
    put(w2, 'Fatimah', 'farm');
    accepted(act(w2, fat2.id, { verb: 'plant', item: 'papaya' }));
    for (let d = 0; d < 10; d += 3) {
      accepted(act(w2, fat2.id, { verb: 'water' }));
      w2.state.t += 3 * 1440;
    }
    accepted(act(w2, fat2.id, { verb: 'harvest' }));
    expect(fat2.items.papaya).toBe(2);
  });
});
