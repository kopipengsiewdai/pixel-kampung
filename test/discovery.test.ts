import { describe, expect, it } from 'vitest';
import { advance, advanceTo } from '../src/sim/tick.ts';
import { perceive } from '../src/sim/perception.ts';
import { act, accepted, newWorld, put, refused, who } from './helpers.ts';

describe('residents start knowing almost nothing', () => {
  it("a job-seeker knows only home and the village head's house; an owner also knows their shop", () => {
    const w = newWorld(9, 0, 1, true, false);
    expect(who(w, 'Siti').knownPlaces.sort()).toEqual([who(w, 'Siti').homeId, 'village-head-house'].sort());
    expect(who(w, 'Ah Huat').knownPlaces.sort()).toEqual([who(w, 'Ah Huat').homeId, 'kopitiam', 'village-head-house'].sort());
    // People: only family and old friends (Siti knows Fatimah from the well).
    expect(who(w, 'Siti').knownPeople).toEqual([who(w, 'Fatimah').id]);
    expect(who(w, 'Ah Kow').knownPeople).toEqual([]);
  });

  it("can't walk to a place they don't know of yet", () => {
    const w = newWorld(9, 0, 1, true, false);
    refused(act(w, who(w, 'Siti').id, { verb: 'walk_to', where: 'the jetty' }), /don't know of anywhere called "the jetty"/);
    expect(perceive(w, who(w, 'Siti')).placesYouKnow).toEqual(['home', "the village head's house"]);
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
    const siti = put(w, 'Siti', 'jetty');
    advance(w);
    expect(siti.knownPlaces).toContain('jetty');
    expect(perceive(w, siti).placesYouKnow).toContain('the jetty');
    expect(w.takeEvents()).toContainEqual(expect.objectContaining({ type: 'found_place', who: siti.id, place: 'jetty' }));
    accepted(act(w, siti.id, { verb: 'walk_to', where: 'home' }));
  });

  it('learns a place by hearing it named, and a person by meeting them', () => {
    const w = newWorld(9, 0, 1, true, false);
    const siti = put(w, 'Siti', 'well');
    const raju = put(w, 'Raju', 'well');
    advance(w);
    expect(siti.knownPeople).toContain(raju.id);
    expect(siti.knownPlaces).not.toContain('jetty');
    accepted(act(w, raju.id, { verb: 'say', text: 'The fish are biting at the jetty today.', to: 'Siti' }));
    expect(siti.knownPlaces).toContain('jetty');
    accepted(act(w, siti.id, { verb: 'walk_to', where: 'the jetty' }));
  });

  it('a name inside another word teaches nothing', () => {
    const w = newWorld(9, 0, 1, true, false);
    const siti = put(w, 'Siti', 'well');
    const raju = put(w, 'Raju', 'well');
    accepted(act(w, siti.id, { verb: 'say', text: 'My cousin went to Sitiawan, and Rajudin too.' }));
    expect(raju.knownPeople).toEqual([who(w, 'Muthu').id, siti.id]);
  });

  it("knows someone's house only once they know the person and have seen or heard of it", () => {
    const w = newWorld(9, 0, 1, true, false);
    const siti = who(w, 'Siti');
    refused(act(w, siti.id, { verb: 'walk_to', where: "Ah Huat's house" }), /don't know of anywhere/);
    refused(act(w, siti.id, { verb: 'walk_to', where: 'Ah Huat' }), /don't know anyone called "Ah Huat"|don't know of anywhere/);
  });
});
