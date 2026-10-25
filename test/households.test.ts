import { describe, expect, it } from 'vitest';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { feedLine } from '../src/feed/feed.ts';
import { CLOSE_DAYS, ROUGH_REST_CAP, houseOf } from '../src/sim/households.ts';
import { ACTIONS } from '../src/sim/actions/index.ts';
import { Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';
import type { World } from '../src/sim/state.ts';

const at9 = () => newWorld(9);

describe('households in a new town', () => {
  it('family live together: Ah Seng in his father Ah Huat\'s house, Mei Ling in her aunt Mdm Tan\'s; two houses stand empty, to let', () => {
    const w = at9();
    const huat = who(w, 'Ah Huat');
    expect(who(w, 'Ah Seng').homeId).toBe(huat.homeId);
    expect(who(w, 'Mei Ling').homeId).toBe(who(w, 'Mdm Tan').homeId);
    expect(w.state.houses.filter((h) => h.holderId === null).map((h) => h.id).sort()).toEqual(['house-4', 'house-8']);
    expect(houseOf(w, huat.homeId!)!.holderId).toBe(huat.id);
    expect(w.placeName(w.home(who(w, 'Ah Seng'))!)).toBe("Ah Huat's house");
    expect(w.state.residents.every((r) => r.spouseId === null)).toBe(true);
  });
});

describe('who lives where', () => {
  it('a household head can tell someone to leave: with no house of their own, they have nowhere to sleep', () => {
    const w = at9();
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const seng = put(w, 'Ah Seng', 'kopitiam');
    accepted(act(w, huat.id, { verb: 'tell_to_leave', to: 'Ah Seng' }));
    expect(seng.homeId).toBeNull();
    expect(seng.recent.at(-1)!.text).toMatch(/Ah Huat/);
    expect(describePerception(perceive(w, seng))).toContain("You've nowhere of your own to sleep.");
    refused(act(w, huat.id, { verb: 'tell_to_leave', to: 'Siti' }), /doesn't live in your house/);
  });

  it('anyone can offer someone a home in the house they head, and they can move in', () => {
    const w = at9();
    const siti = put(w, 'Siti', 'well');
    const kow = put(w, 'Ah Kow', 'well');
    accepted(act(w, siti.id, { verb: 'take_in', to: 'Ah Kow' }));
    expect(describePerception(perceive(w, kow))).toContain("Siti says you can come and live in Siti's house.");
    accepted(act(w, kow.id, { verb: 'move_in', from: 'Siti' }));
    expect(kow.homeId).toBe(siti.homeId);
    refused(act(w, kow.id, { verb: 'move_in', from: 'Raju' }), /hasn't offered/);
    expect(describePerception(perceive(w, siti))).toContain('Ah Kow lives with you.');
  });

  it("someone living in another's house can't offer it", () => {
    const w = at9();
    put(w, 'Ah Seng', 'well');
    put(w, 'Siti', 'well');
    refused(act(w, who(w, 'Ah Seng').id, { verb: 'take_in', to: 'Siti' }), /isn't your house to offer/);
  });
});

describe('sleeping rough', () => {
  it('someone with no home beds down outdoors at night, and rests less', async () => {
    const start = sgt(22, 50);
    const town = Town.create(1, start);
    const seng = who(town.world, 'Ah Seng');
    seng.homeId = null;
    seng.energy = 300;
    await town.runUntil(sgt(23, 30));
    expect(seng.activity).toMatchObject({ kind: 'sleeping', rough: true });
    await town.runUntil(sgt(6, 0, 1) - 1);
    expect(seng.energy).toBeLessThanOrEqual(ROUGH_REST_CAP);
    expect(seng.energy).toBeGreaterThan(600);
    await town.runUntil(sgt(6, 5, 1));
    expect(seng.recent.some((o) => /slept rough/.test(o.text))).toBe(true);
  });

  it('can lie down only somewhere sheltered', () => {
    const w = at9();
    const seng = put(w, 'Ah Seng', 'well');
    seng.homeId = null;
    seng.energy = 200;
    refused(act(w, seng.id, { verb: 'sleep' }), /sheltered/);
    seng.pos = { x: 31, y: 23 };
    accepted(act(w, seng.id, { verb: 'sleep' }));
    expect(seng.activity).toMatchObject({ kind: 'sleeping', rough: true });
  });
});

describe('growing close, and marriage', () => {
  function talkDays(w: World, a: string, b: string, days: number) {
    for (let d = 0; d < days; d++) {
      put(w, a, 'well');
      put(w, b, 'well');
      for (let k = 0; k < 3; k++) {
        accepted(act(w, who(w, a).id, { verb: 'say', text: 'Morning!', to: b }));
        accepted(act(w, who(w, b).id, { verb: 'say', text: 'Morning to you.', to: a }));
      }
      w.state.t += 1440;
    }
  }

  it("counts days on which both spoke to each other, not lines; five such days and they're close", () => {
    const w = at9();
    talkDays(w, 'Siti', 'Raju', CLOSE_DAYS - 1);
    put(w, 'Siti', 'well');
    put(w, 'Raju', 'well');
    refused(act(w, who(w, 'Siti').id, { verb: 'propose', to: 'Raju' }), /well enough/);
    talkDays(w, 'Siti', 'Raju', 1);
    put(w, 'Siti', 'well');
    put(w, 'Raju', 'well');
    expect(describePerception(perceive(w, who(w, 'Siti')))).toContain('Raju, a close friend (');
    accepted(act(w, who(w, 'Siti').id, { verb: 'propose', to: 'Raju' }));
    expect(describePerception(perceive(w, who(w, 'Raju')))).toContain('Siti has asked to marry you.');
    accepted(act(w, who(w, 'Raju').id, { verb: 'marry', to: 'Siti' }));
    expect(who(w, 'Siti').spouseId).toBe(who(w, 'Raju').id);
    expect(who(w, 'Raju').spouseId).toBe(who(w, 'Siti').id);
    expect(describePerception(perceive(w, who(w, 'Siti')))).toContain("You're married to Raju.");
    refused(act(w, who(w, 'Siti').id, { verb: 'propose', to: 'Raju' }), /married/);
  });

  it('a proposal can be turned down, and close kin cannot marry', () => {
    const w = at9();
    talkDays(w, 'Muthu', 'Raju', CLOSE_DAYS);
    put(w, 'Muthu', 'well');
    put(w, 'Raju', 'well');
    refused(act(w, who(w, 'Muthu').id, { verb: 'propose', to: 'Raju' }), /cousin|family/);
    talkDays(w, 'Siti', 'Ah Kow', CLOSE_DAYS);
    put(w, 'Siti', 'well');
    put(w, 'Ah Kow', 'well');
    accepted(act(w, who(w, 'Siti').id, { verb: 'propose', to: 'Ah Kow' }));
    accepted(act(w, who(w, 'Ah Kow').id, { verb: 'turn_down', to: 'Siti' }));
    expect(who(w, 'Siti').recent.at(-1)!.text).toMatch(/Ah Kow/);
    refused(act(w, who(w, 'Ah Kow').id, { verb: 'marry', to: 'Siti' }), /hasn't asked/);
  });
});

describe('the feed', () => {
  it('tells of moves, partings and marriages, highlighted', () => {
    const w = at9();
    put(w, 'Ah Huat', 'kopitiam');
    put(w, 'Ah Seng', 'kopitiam');
    accepted(act(w, who(w, 'Ah Huat').id, { verb: 'tell_to_leave', to: 'Ah Seng' }));
    const line = feedLine(w.takeEvents().find((e) => e.type === 'told_to_leave')!, (id) => w.resident(id).name)!;
    expect(line.text).toBe('Ah Huat tells Ah Seng to leave the house. Ah Seng has nowhere to sleep tonight.');
    expect(line.notable).toBe(true);
  });

  it('every new action reads in plain words', () => {
    for (const v of ['take_in', 'move_in', 'tell_to_leave', 'propose', 'marry', 'turn_down']) {
      expect(ACTIONS[v], v).toBeDefined();
      expectInWorld(ACTIONS[v]!.says);
    }
  });
});

describe('v4 → v5: a living town moves into households', () => {
  it('Ah Seng and Mei Ling move in with family, two houses stand empty, nobody else moves or loses a cent, and the town hears of it', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadSql, fixtureSql } = await import('./saves.ts');
    const { SqliteStore } = await import('../src/store/sqlite-store.ts');
    const dir = mkdtempSync(join(tmpdir(), 'kampung-house-'));
    try {
      const path = join(dir, 'kampung.db');
      loadSql(fixtureSql(4), path);
      const v4 = JSON.parse((await import('./saves.ts')).peek<{ world: string }>(path, 'SELECT world FROM snapshot').world);
      const store = new SqliteStore(path);
      const events: string[] = [];
      const town = Town.resume({ store, onEvent: (e) => events.push(e.type) })!;
      const w = town.world;
      expect(who(w, 'Ah Seng').homeId).toBe(who(w, 'Ah Huat').homeId);
      expect(who(w, 'Mei Ling').homeId).toBe(who(w, 'Mdm Tan').homeId);
      expect(w.state.houses.filter((h) => h.holderId === null)).toHaveLength(2);
      for (const r of w.state.residents) {
        const old = v4.residents.find((x: { id: string }) => x.id === r.id);
        expect(r.money, r.name).toBe(old.money);
        expect(r.pos, r.name).toEqual(old.pos);
      }
      await town.runUntil(town.t + 1);
      expect(events.filter((e) => e === 'moved_in')).toHaveLength(2);
      expect(who(w, 'Ah Huat').recent.some((o) => /Your son Ah Seng has moved back in/.test(o.text))).toBe(true);
      expect(w.state.news).toEqual([]);
      await town.runUntil(town.t + 30);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the watch page', () => {
  it("a resident's card says where they live and who they're married to", async () => {
    const { FrameBuilder } = await import('../src/watch/view.ts');
    const w = at9();
    who(w, 'Siti').spouseId = who(w, 'Raju').id;
    who(w, 'Ah Kow').homeId = null;
    const f = new FrameBuilder().build(w);
    const v = (n: string) => f.residents.find((r) => r.name === n)!;
    expect(v('Ah Seng').home).toBe("Ah Huat's house");
    expect(v('Siti').spouse).toBe('Raju');
    expect(v('Ah Kow').home).toBeNull();
  });
});
