import { describe, expect, it } from 'vitest';
import { feedLine } from '../src/feed/feed.ts';
import { availableActions } from '../src/sim/actions/index.ts';
import { bondOf } from '../src/sim/bonds.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
/** a's feelings for b. */
function feels(w: World, a: string, b: string, fondness = 80, trust = 60) {
  const bond = bondOf(w, who(w, a).id, who(w, b).id);
  bond.fondness = fondness;
  bond.trust = trust;
}
/** Siti and Raju at the well, fond of each other and trusting both ways. */
function couple() {
  const w = newWorld(9);
  const siti = put(w, 'Siti', 'well');
  const raju = put(w, 'Raju', 'well');
  feels(w, 'Siti', 'Raju');
  feels(w, 'Raju', 'Siti');
  return { w, siti, raju };
}
const verbs = (w: World, name: string) => availableActions(w, who(w, name)).map((a) => a.verb);

// households.md "Marriage", the six details agreed by Kampung for the owner, 2026-10-28.
describe('marriage', () => {
  it('one asks, the other says yes: they are married, the feed tells it, kin and those nearby remember', () => {
    const { w, siti, raju } = couple();
    const muthu = put(w, 'Muthu', 'well');
    expectInWorld(accepted(act(w, raju.id, { verb: 'propose', to: 'Siti' })).reply ?? '');
    expect(seen(w, 'Siti')).toMatch(/Raju has asked you to marry them/);
    expect(seen(w, 'Raju')).toMatch(/You've asked Siti to marry you/);
    w.takeEvents();
    accepted(act(w, siti.id, { verb: 'agree', from: 'Raju' }));
    expect(siti.spouseId).toBe(raju.id);
    expect(raju.spouseId).toBe(siti.id);
    const married = w.takeEvents().find((e: GameEvent) => e.type === 'married');
    expect(married).toBeTruthy();
    expect(feedLine(married!, (id) => w.resident(id).name)?.text ?? '').toMatch(/Siti and Raju|Raju and Siti/);
    // Mak Esah (Siti's mother) hears wherever she is; Muthu saw it.
    expect(who(w, 'Mak Esah').recent.some((m) => /married/.test(m.text))).toBe(true);
    expect(muthu.recent.some((m) => /married/.test(m.text))).toBe(true);
    expect(seen(w, 'Siti')).toMatch(/You're married to Raju/);
    expect(w.state.proposals).toHaveLength(0);
  });

  it('only the grown (18 and over) marry', () => {
    const w = newWorld(9);
    const raju = put(w, 'Raju', 'well');
    put(w, 'Aminah', 'well');
    feels(w, 'Raju', 'Aminah');
    expectInWorld(refused(act(w, raju.id, { verb: 'propose', to: 'Aminah' })));
    expect(w.state.proposals).toHaveLength(0);
  });

  it('never between family', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    put(w, 'Rahim', 'well');
    feels(w, 'Fatimah', 'Rahim');
    feels(w, 'Rahim', 'Fatimah');
    expectInWorld(refused(act(w, fatimah.id, { verb: 'propose', to: 'Rahim' })));
  });

  it('each asks, or says yes, only as they feel themselves; nobody is told the other\'s feelings', () => {
    const { w, siti, raju } = couple();
    feels(w, 'Raju', 'Siti', 60, 60);
    expect(verbs(w, 'Raju')).not.toContain('propose');
    expectInWorld(refused(act(w, raju.id, { verb: 'propose', to: 'Siti' }), /well enough/));
    feels(w, 'Raju', 'Siti');
    expect(verbs(w, 'Raju')).toContain('propose');
    feels(w, 'Siti', 'Raju', 80, 40);
    accepted(act(w, raju.id, { verb: 'propose', to: 'Siti' }));
    expectInWorld(refused(act(w, siti.id, { verb: 'agree', from: 'Raju' }), /not ready/));
    expect(siti.spouseId).toBeNull();
    // She can still say no.
    accepted(act(w, siti.id, { verb: 'refuse', from: 'Raju' }));
    expect(w.state.proposals).toHaveLength(0);
    expect(raju.recent.some((m) => /Siti/.test(m.text) && /no/i.test(m.text))).toBe(true);
  });

  it('a proposal left unanswered lapses at the end of the day', () => {
    const { w, raju } = couple();
    accepted(act(w, raju.id, { verb: 'propose', to: 'Siti' }));
    for (let i = 0; i < 16 * 60; i++) advance(w);
    expect(w.state.proposals).toHaveLength(0);
    expect(raju.recent.some((m) => /Siti/.test(m.text) && /answer/.test(m.text))).toBe(true);
  });

  it('the married ask nobody else, and can\'t be asked', () => {
    const { w, siti, raju } = couple();
    accepted(act(w, raju.id, { verb: 'propose', to: 'Siti' }));
    accepted(act(w, siti.id, { verb: 'agree', from: 'Raju' }));
    const muthu = put(w, 'Muthu', 'well');
    feels(w, 'Muthu', 'Siti');
    feels(w, 'Raju', 'Muthu');
    expectInWorld(refused(act(w, muthu.id, { verb: 'propose', to: 'Siti' })));
    expectInWorld(refused(act(w, raju.id, { verb: 'propose', to: 'Muthu' })));
  });

  it('either may move in with the other: their rented house goes back, rent owing still owed; those living with them come too', () => {
    const w = newWorld(9);
    const fatimah = put(w, 'Fatimah', 'well');
    const muthu = put(w, 'Muthu', 'well');
    feels(w, 'Fatimah', 'Muthu');
    feels(w, 'Muthu', 'Fatimah');
    accepted(act(w, muthu.id, { verb: 'propose', to: 'Fatimah' }));
    accepted(act(w, fatimah.id, { verb: 'agree', from: 'Muthu' }));
    const old = fatimah.homeId;
    w.state.property[old]!.owing = 50;
    expect(verbs(w, 'Fatimah')).toContain('move in with');
    accepted(act(w, fatimah.id, { verb: 'move_in_with', to: 'Muthu' }));
    for (const n of ['Fatimah', 'Aminah', 'Hassan']) expect(who(w, n).homeId).toBe(muthu.homeId);
    expect(w.state.property[old]!.holder).not.toBe(fatimah.id);
    expect(fatimah.recent.some((m) => /still owing/.test(m.text))).toBe(true);
    expect(verbs(w, 'Fatimah')).not.toContain('move in with');
  });

  it('a house the mover owns stays theirs', () => {
    const { w, siti, raju } = couple();
    accepted(act(w, raju.id, { verb: 'propose', to: 'Siti' }));
    accepted(act(w, siti.id, { verb: 'agree', from: 'Raju' }));
    const old = raju.homeId;
    w.state.property[old]!.owned = true;
    accepted(act(w, raju.id, { verb: 'move_in_with', to: 'Siti' }));
    expect(raju.homeId).toBe(siti.homeId);
    expect(w.state.property[old]!.holder).toBe(raju.id);
  });

  it('the upgrade (save v31): nobody is married or asked yet', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 30)!;
    const world = { residents: [{ id: 'siti' }, { id: 'raju' }] };
    const up = step.save!({ world, brains: {} }).world as { residents: { spouseId: unknown }[]; proposals: unknown[] };
    expect(up.residents.map((r) => r.spouseId)).toEqual([null, null]);
    expect(up.proposals).toEqual([]);
    expect(step.save!({ world: up, brains: {} }).world).toEqual(up);
  });
});
