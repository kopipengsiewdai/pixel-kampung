import { describe, expect, it } from 'vitest';
import { advance, advanceTo } from '../src/sim/tick.ts';
import { perceive } from '../src/sim/perception.ts';
import { act, accepted, newWorld, put, refused, who } from './helpers.ts';

describe('residents know their kampung, and still meet people and new places in play', () => {
  it('everyone who has lived here knows every place; Ah Kow, the newcomer, only home, the well and the kopitiam', () => {
    const w = newWorld(9, 0, 1, true, false);
    expect(who(w, 'Siti').knownPlaces).toContain('jetty');
    expect(who(w, 'Ah Huat').knownPlaces).toContain('kopitiam');
    expect(who(w, 'Ah Kow').knownPlaces).toEqual([who(w, 'Ah Kow').homeId, 'well', 'kopitiam']);
    // People: only family and old friends (Siti knows Fatimah from the well, and her mother).
    expect(who(w, 'Siti').knownPeople).toEqual([who(w, 'Fatimah').id, who(w, 'Mak Esah').id]);
    expect(who(w, 'Ah Kow').knownPeople).toEqual([]);
  });

  it("can't walk to a place they don't know of yet", () => {
    const w = newWorld(9, 0, 1, true, false);
    const kow = who(w, 'Ah Kow');
    refused(act(w, kow.id, { verb: 'walk_to', where: 'the jetty' }), /don't know of anywhere called "the jetty"/);
    expect(perceive(w, kow).placesYouKnow).toEqual(['home', 'the kopitiam', 'the well']);
  });

  it('can set off in a direction to explore', () => {
    const w = newWorld(9, 0, 1, true, false);
    const siti = who(w, 'Siti');
    const res = accepted(act(w, siti.id, { verb: 'walk_to', where: 'south' }));
    expect(res.reply).toMatch(/south/);
    const y = siti.pos.y;
    advanceTo(w, w.t + 5);
    expect(siti.pos.y).toBeGreaterThan(y);
    refused(act(w, who(w, 'Mei Ling').id, { verb: 'walk_to', where: 'up' }), /don't know of anywhere/);
  });

  it('learns a place by seeing it', () => {
    const w = newWorld(9, 0, 1, true, false);
    const kow = put(w, 'Ah Kow', 'jetty');
    advance(w);
    expect(kow.knownPlaces).toContain('jetty');
    expect(perceive(w, kow).placesYouKnow).toContain('the jetty');
    expect(w.takeEvents()).toContainEqual(expect.objectContaining({ type: 'found_place', who: kow.id, place: 'jetty' }));
    accepted(act(w, kow.id, { verb: 'walk_to', where: 'home' }));
  });

  it('learns a place by hearing it named, and a person by meeting them', () => {
    const w = newWorld(9, 0, 1, true, false);
    const kow = put(w, 'Ah Kow', 'well');
    const raju = put(w, 'Raju', 'well');
    advance(w);
    expect(kow.knownPeople).toContain(raju.id);
    expect(kow.knownPlaces).not.toContain('jetty');
    accepted(act(w, raju.id, { verb: 'say', text: 'The fish are biting at the jetty today.', to: 'Ah Kow' }));
    expect(kow.knownPlaces).toContain('jetty');
    accepted(act(w, kow.id, { verb: 'walk_to', where: 'the jetty' }));
  });

  it('a name inside another word teaches nothing', () => {
    const w = newWorld(9, 0, 1, true, false);
    const siti = put(w, 'Siti', 'well');
    const raju = put(w, 'Raju', 'well');
    accepted(act(w, siti.id, { verb: 'say', text: 'My cousin went to Sitiawan, and Rajudin too.' }));
    expect(raju.knownPeople).toEqual([who(w, 'Muthu').id, siti.id]);
  });

  it("knows a house by whose it is once they know the place; the person is still met in play", () => {
    const w = newWorld(9, 0, 1, true, false);
    const kow = who(w, 'Ah Kow');
    refused(act(w, kow.id, { verb: 'walk_to', where: "Ah Huat's house" }), /don't know of anywhere/);
    refused(act(w, kow.id, { verb: 'walk_to', where: 'Ah Huat' }), /don't know anyone called "Ah Huat"|don't know of anywhere/);
    const siti = who(w, 'Siti');
    accepted(act(w, siti.id, { verb: 'walk_to', where: "Ah Huat's house" }));
  });
});
