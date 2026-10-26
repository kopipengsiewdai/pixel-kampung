import { describe, expect, it } from 'vitest';
import { systemPrompt } from '../src/mind/prompt.ts';
import { CARDS } from '../src/seed/cards.ts';
import { PLACES } from '../src/sim/map.ts';
import { perceive } from '../src/sim/perception.ts';
import { accepted, act, expectInWorld, newWorld, who } from './helpers.ts';

// The places there were when this step was written (the village head's house came later).
const ALL = PLACES.map((p) => p.id).filter((id) => id !== 'village-head');

describe('everyone who has lived here knows their kampung', () => {
  it('every original place from day one: the jetty, the farm plot, the well, the board, the shops, the lorry stop and every house', () => {
    const w = newWorld(9, 0, 1, true, false);
    for (const r of w.state.residents.filter((x) => x.name !== 'Ah Kow')) {
      expect([...r.knownPlaces].sort(), r.name).toEqual(PLACES.map((p) => p.id).sort());
      expect(r.knownPlaces[0], `${r.name} knows home first`).toBe(r.homeId);
    }
    const rahim = who(w, 'Rahim');
    const p = perceive(w, rahim);
    for (const place of ['the jetty', 'the farm plot', 'the lorry stop', 'the well', 'the notice board', "Siti's house"]) expect(p.placesYouKnow, place).toContain(place);
    accepted(act(w, rahim.id, { verb: 'walk_to', where: 'the jetty' }));
  });

  it('a house is known by whose it is, even before meeting them; the person is still met in play', () => {
    const w = newWorld(9, 0, 1, true, false);
    const raju = who(w, 'Raju');
    expect(w.knowsPerson(raju, who(w, 'Siti').id)).toBe(false);
    accepted(act(w, raju.id, { verb: 'walk_to', where: "Siti's house" }));
    w.state.residents.find((r) => r.id === raju.id)!.activity = null;
    expect(act(w, raju.id, { verb: 'walk_to', where: 'Siti' }).ok).toBe(false);
  });

  it('Ah Kow, who arrived last month, knows only his house, the well and the kopitiam', () => {
    const w = newWorld(9, 0, 1, true, false);
    const kow = who(w, 'Ah Kow');
    expect(kow.knownPlaces).toEqual([kow.homeId, 'well', 'kopitiam']);
    expect(act(w, kow.id, { verb: 'walk_to', where: 'the jetty' }).ok).toBe(false);
  });
});

describe('their trades, on their cards', () => {
  const trade = (name: string) => CARDS.find((c) => c.name === name)!.trade;

  it('the six who have one, in their own words, and only real work', () => {
    expect(trade('Rahim')).toBe('You grew up fishing off the jetty with your father; you know the sea.');
    expect(trade('Fatimah')).toBe("You've always grown vegetables; you know a bed wants water every day.");
    expect(trade('Ah Kow')).toBe("You worked the land on the estate; you're not afraid of hard work in the sun.");
    expect(trade('Ah Huat')).toBe('You cook for the kopitiam yourself: kopi, fish porridge, vegetable rice.');
    expect(trade('Muthu')).toBe("You carried cargo at the docks; you're strong and steady.");
    expect(trade('Hassan')).toBe("You've fished off the jetty since you could walk.");
    expect(CARDS.filter((c) => c.trade).map((c) => c.name).sort()).toEqual(['Ah Huat', 'Ah Kow', 'Fatimah', 'Hassan', 'Muthu', 'Rahim']);
  });

  it('is told with who they are', () => {
    for (const c of CARDS.filter((x) => x.trade)) {
      const text = systemPrompt(c, 'seeker', null);
      expect(text).toContain(c.trade!);
      expectInWorld(text);
    }
  });
});

describe('the upgrade: the living town knows its kampung', () => {
  it('adds every original place to everyone but Ah Kow, keeping what they knew, home first; Ah Kow gains the well and the kopitiam', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 7)!;
    const world = {
      residents: [
        { id: 'rahim', homeId: 'house-3', knownPlaces: ['house-3', 'market-stall', 'kopitiam'] },
        { id: 'ah-kow', homeId: 'house-5', knownPlaces: ['house-5', 'farm'] },
      ],
    };
    const up = step.save!({ world, brains: {} }).world as { residents: { knownPlaces: string[] }[] };
    expect(up.residents[0]!.knownPlaces.slice(0, 3)).toEqual(['house-3', 'market-stall', 'kopitiam']);
    expect([...up.residents[0]!.knownPlaces].sort()).toEqual([...ALL].sort());
    expect(up.residents[1]!.knownPlaces).toEqual(['house-5', 'farm', 'well', 'kopitiam']);
    expect(step.save!({ world: up as unknown as Record<string, unknown>, brains: {} }).world).toEqual(up);
  });
});
