import { describe, expect, it } from 'vitest';
import { Budget, BUCKET_CAP, HOURLY_ALLOWANCE } from '../src/mind/budget.ts';
import { systemPrompt } from '../src/mind/prompt.ts';
import { CARDS } from '../src/seed/cards.ts';
import { FrameBuilder, layoutOf } from '../src/watch/view.ts';
import { peopleOf } from '../src/watch/wiki.ts';
import { CAST } from '../src/seed/cast.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import { HOUSE_IDS, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { REAL_MS_PER_GAME_MINUTE } from '../src/sim/time.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));

describe('families: everyone a card names as living family lives in the kampung', () => {
  it('Mak Esah lives with Siti, and Aminah and Hassan with Fatimah; the houses still go by Siti and Fatimah', () => {
    const w = newWorld(9);
    expect(w.state.residents).toHaveLength(13);
    const siti = who(w, 'Siti');
    const fatimah = who(w, 'Fatimah');
    expect(who(w, 'Mak Esah').homeId).toBe(siti.homeId);
    expect(who(w, 'Aminah').homeId).toBe(fatimah.homeId);
    expect(who(w, 'Hassan').homeId).toBe(fatimah.homeId);
    expect(w.placeName(w.home(siti))).toBe("Siti's house");
    expect(w.placeName(w.home(fatimah))).toBe("Fatimah's house");
    // Thirteen people in eight houses (Ah Seng with his father, Mei Ling with her aunt): two stand free.
    expect(new Set(w.state.residents.map((r) => r.homeId)).size).toBe(HOUSE_IDS.length - 2);
    put(w, 'Mak Esah', siti.homeId);
    expect(seen(w, 'Mak Esah')).toContain('your house');
    // They can sleep at home, in the house they share.
    who(w, 'Mak Esah').energy = 300;
    accepted(act(w, who(w, 'Mak Esah').id, { verb: 'sleep' }));
  });

  it('they start with nothing of their own, and know their family from day one', () => {
    const w = newWorld(9, 0, 1, true, false);
    for (const n of ['Mak Esah', 'Aminah', 'Hassan']) expect(who(w, n).money).toBe(0);
    const knows = (a: string, b: string) => w.knowsPerson(who(w, a), who(w, b).id);
    expect(knows('Siti', 'Mak Esah') && knows('Mak Esah', 'Siti')).toBe(true);
    expect(knows('Fatimah', 'Hassan') && knows('Hassan', 'Aminah') && knows('Aminah', 'Rahim')).toBe(true);
    expect(knows('Rahim', 'Hassan')).toBe(true);
    expect(knows('Mak Esah', 'Raju')).toBe(false);
  });

  it("a child can't be offered a shift, in the kampung's words; at fourteen they can", () => {
    const w = newWorld(9);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    for (const n of ['Hassan', 'Aminah']) {
      put(w, n, 'kopitiam');
      const reply = refused(act(w, huat.id, { verb: 'offer_job', to: n, wage: '$2', startHour: 10, hours: 4 }));
      expect(reply).toBe(`${n} is too young to work a shift.`);
      expectInWorld(reply);
    }
    expect(w.state.jobOffers).toEqual([]);
    const aminah = who(w, 'Aminah');
    aminah.born -= 2;
    accepted(act(w, huat.id, { verb: 'offer_job', to: 'Aminah', wage: '$2', startHour: 10, hours: 4 }));
  });

  it('children can fish, fetch water and run errands', () => {
    const w = newWorld(9);
    const hassan = put(w, 'Hassan', 'jetty');
    accepted(act(w, hassan.id, { verb: 'fish' }));
    const aminah = put(w, 'Aminah', 'well');
    accepted(act(w, aminah.id, { verb: 'fetch_water' }));
    const siti = put(w, 'Siti', 'well');
    siti.money = 100;
    accepted(act(w, siti.id, { verb: 'ask_errand', to: 'Aminah', text: 'Bring me a pail of water', money: '10¢' }));
  });

  it('Mak Esah, at 63, tires quicker than a younger woman standing beside her', () => {
    const w = newWorld(9);
    const mak = put(w, 'Mak Esah', 'well');
    const siti = put(w, 'Siti', 'well');
    mak.energy = siti.energy = 900;
    for (let i = 0; i < 60; i++) {
      advance(w);
      for (const r of [mak, siti]) {
        r.hunger = 100;
        r.activity = null;
      }
    }
    expect(900 - siti.energy).toBe(40);
    expect(900 - mak.energy).toBe(60);
  });

  it('family call each other as families do: "Mak" is Siti\'s mother to Siti, and Fatimah to her children', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'well');
    put(w, 'Mak Esah', 'well');
    put(w, 'Fatimah', 'well');
    const hassan = put(w, 'Hassan', 'well');
    accepted(act(w, siti.id, { verb: 'say', to: 'Mak', text: 'Mak, I am home.' }));
    expect(who(w, 'Mak Esah').recent.at(-1)!.text).toBe('Siti says to you: "Mak, I am home."');
    accepted(act(w, hassan.id, { verb: 'say', to: 'Mak', text: 'Mak, can I go to the jetty?' }));
    expect(who(w, 'Fatimah').recent.at(-1)!.text).toBe('Hassan says to you: "Mak, can I go to the jetty?"');
    // Not to anyone else.
    const raju = put(w, 'Raju', 'well');
    refused(act(w, raju.id, { verb: 'say', to: 'Mak', text: 'Mak?' }), /don't know anyone called "Mak"/);
  });
});

describe('thinking allowance', () => {
  it('Mak Esah and the children think on about half an adult\'s allowance; everyone else on a full one', () => {
    const half = CAST.filter((c) => c.allowance !== undefined).map((c) => [c.name, c.allowance]);
    expect(half).toEqual([['Mak Esah', 0.5], ['Aminah', 0.5], ['Hassan', 0.5]]);
    const realHour = 3_600_000 / REAL_MS_PER_GAME_MINUTE;
    const full = new Budget(0, 0);
    const halfB = new Budget(0, 0, 0.5);
    full.refill(realHour);
    halfB.refill(realHour);
    expect(full.level).toBeCloseTo(HOURLY_ALLOWANCE);
    expect(halfB.level).toBeCloseTo(HOURLY_ALLOWANCE / 2);
  });

  it('the half share holds over short spells too: half the bucket, starting half full', () => {
    const half = new Budget(0, undefined, 0.5);
    expect(half.level).toBeCloseTo(BUCKET_CAP / 2);
    half.refill(1_000_000);
    expect(half.level).toBeCloseTo(BUCKET_CAP / 2);
    expect(new Budget(0).level).toBe(BUCKET_CAP);
  });
});

describe('ages move with the kampung\'s years', () => {
  it('a year on, Hassan is nine: to himself, on the watch page and in the wiki', () => {
    const w = newWorld(9);
    const hassan = who(w, 'Hassan');
    expect(w.ageOf(hassan)).toBe(8);
    w.state.t += 365 * 1440;
    expect(w.ageOf(hassan)).toBe(9);
    const card = CARDS.find((c) => c.name === 'Hassan')!;
    expect(systemPrompt(card, 'family', null, w.ageOf(hassan))).toContain('You are Hassan, 9.');
    const frame = new FrameBuilder().build(w);
    expect(frame.residents.find((r) => r.id === hassan.id)).toMatchObject({ age: 9, child: true });
    expect(peopleOf(frame, layoutOf(w)).find((p) => p.name === 'Hassan')!.age).toBe(9);
    expect(frame.residents.find((r) => r.name === 'Mak Esah')).toMatchObject({ age: 64, child: false });
  });
});

describe('the upgrade: the families were always here', () => {
  it('adds Mak Esah to Siti\'s house and Aminah and Hassan to Fatimah\'s, at home, known to their family, knowing every place', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 11)!;
    const base = { money: 500, items: {}, knownPlaces: ['house-1'], knownPeople: [] as string[] };
    const world = {
      t: 3 * 1440, calendar: { firstDay: 1 },
      residents: [
        { ...base, id: 'siti', name: 'Siti', homeId: 'house-6', knownPeople: ['fatimah'] },
        { ...base, id: 'fatimah', name: 'Fatimah', homeId: 'house-9', knownPeople: ['rahim', 'siti'] },
        { ...base, id: 'rahim', name: 'Rahim', homeId: 'house-3', knownPeople: ['fatimah', 'ah-huat'] },
        { ...base, id: 'raju', name: 'Raju', homeId: 'house-10' },
      ],
    };
    const up = step.save!({ world, brains: {} }).world as { residents: Record<string, unknown>[] };
    const by = (id: string) => up.residents.find((r) => r.id === id)!;
    expect(up.residents.map((r) => r.id)).toEqual(['siti', 'fatimah', 'rahim', 'raju', 'mak-esah', 'aminah', 'hassan']);
    expect(by('mak-esah')).toMatchObject({ name: 'Mak Esah', role: 'family', homeId: 'house-6', pos: { x: 22, y: 2 }, money: 0, born: -63, knownPeople: ['siti'], activity: null, thinkAt: 3 * 1440 });
    expect(by('hassan')).toMatchObject({ homeId: 'house-9', pos: { x: 34, y: 2 }, born: -8, knownPeople: ['fatimah', 'aminah', 'rahim'] });
    expect((by('aminah').knownPlaces as string[])[0]).toBe('house-9');
    expect(by('aminah').knownPlaces).toHaveLength(18);
    expect(by('siti').knownPeople).toEqual(['fatimah', 'mak-esah']);
    expect(by('fatimah').knownPeople).toEqual(['rahim', 'siti', 'aminah', 'hassan']);
    expect(by('rahim').knownPeople).toEqual(['fatimah', 'ah-huat', 'aminah', 'hassan']);
    expect(by('raju')).toMatchObject({ born: -29, knownPeople: [] });
    expect(by('siti')).toMatchObject({ born: -26 });
  });
});
