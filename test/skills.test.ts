import { describe, expect, it } from 'vitest';
import { FakeBrain } from '../src/brain/fake-brain.ts';
import { feedLine, isKeyMoment } from '../src/feed/feed.ts';
import { importanceOf } from '../src/mind/memory.ts';
import { catchFish } from '../src/sim/activities.ts';
import { describe as describePerception, perceive } from '../src/sim/perception.ts';
import {
  emptyChance, fadeSkills, levelOf, practise, SKILL_LINES, SKILLS, threshold, effectiveLevel, toolsChange, type SkillId,
} from '../src/sim/skills.ts';
import type { World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dayIndex } from '../src/sim/time.ts';
import { FrameBuilder, layoutOf } from '../src/watch/view.ts';
import { peopleOf } from '../src/watch/wiki.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, who } from './helpers.ts';

const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) advance(w); };
/** Sets a resident's skill to a level's threshold (or an exact xp), practised today. */
function skill(w: World, name: string, s: SkillId, level: number, xp = threshold(s, level)) {
  const r = who(w, name);
  r.skills[s] = { xp, peak: level, lastDay: dayIndex(w.t), today: { day: dayIndex(w.t), xp: 0 }, rusty: false, drops: 0 };
  return r;
}

describe('levels and thresholds', () => {
  it('five levels at 5%, 20%, 50% and 100% of a lifetime: fishing and farming two years at the daily cap, cooking one and a half', () => {
    expect([1, 2, 3, 4, 5].map((l) => threshold('fishing', l))).toEqual([0, 219, 876, 2190, 4380]);
    expect([1, 2, 3, 4, 5].map((l) => threshold('farming', l))).toEqual([0, 146, 584, 1460, 2920]);
    expect([1, 2, 3, 4, 5].map((l) => threshold('cooking', l))).toEqual([0, 219, 877, 2192, 4384]);
    expect(SKILLS.fishing.master / SKILLS.fishing.cap).toBe(730);
    expect(SKILLS.farming.master / SKILLS.farming.cap).toBe(730);
    expect(Math.round(SKILLS.cooking.master / SKILLS.cooking.cap)).toBe(548);
    expect(levelOf('fishing', 218)).toBe(1);
    expect(levelOf('fishing', 219)).toBe(2);
    expect(levelOf('fishing', 4380)).toBe(5);
  });

  it('the town starts with the owner\'s old hands; everyone else a novice', () => {
    const w = newWorld(9);
    const level = (n: string, s: SkillId) => levelOf(s, who(w, n).skills[s]?.xp ?? 0);
    expect([level('Rahim', 'fishing'), level('Ah Huat', 'cooking'), level('Mak Esah', 'cooking')]).toEqual([5, 5, 5]);
    expect([level('Fatimah', 'farming'), level('Ah Kow', 'farming'), level('Hassan', 'fishing')]).toEqual([4, 2, 2]);
    expect([level('Siti', 'fishing'), level('Raju', 'cooking'), level('Rahim', 'farming')]).toEqual([1, 1, 1]);
    expect(who(w, 'Rahim').skills.fishing).toMatchObject({ rusty: false, lastDay: dayIndex(w.t) });
  });
});

describe('experience comes only from doing, so much a day', () => {
  it('each line brought up is a deed; past six in a day, nothing more is learnt', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'jetty');
    for (let i = 0; i < 10; i++) {
      siti.activity = { kind: 'fishing', until: w.t };
      catchFish(w, siti);
    }
    expect(siti.skills.fishing!.xp).toBe(6);
    expect(siti.items.fish ?? 0).toBeGreaterThan(0);
  });

  it('planting, watering and harvesting a bed count; a batch off the stove counts per batch', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'plant' }));
    accepted(act(w, siti.id, { verb: 'water' }));
    expect(siti.skills.farming!.xp).toBe(2);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    const before = huat.skills.cooking!.xp;
    w.shop('kopitiam')!.stock = { vegetables: 4, rice: 4 };
    accepted(act(w, huat.id, { verb: 'cook', item: 'vegetable rice', batches: 2 }));
    run(w, 20);
    expect(huat.skills.cooking!.xp).toBe(before + 2);
  });

  it('crossing a line is a moment: a notice they remember, and a key moment in the feed', () => {
    const w = newWorld(9);
    const siti = skill(w, 'Siti', 'fishing', 1, 218);
    practise(w, siti, 'fishing');
    expect(levelOf('fishing', siti.skills.fishing!.xp)).toBe(2);
    const line = siti.recent.at(-1)!.text;
    expect(line).toBe('The line feels natural in your hands now.');
    expect(importanceOf('noticed', line)).toBe(7);
    const e = w.takeEvents().find((x) => x.type === 'skill_up')!;
    expect(e).toMatchObject({ who: siti.id, skill: 'fishing', level: 2 });
    expect(isKeyMoment(e, false)).toBe(true);
    expect(feedLine(e, (id) => w.resident(id).name)!.text).toBe('Siti has become a handy fisher.');
  });
});

describe('what they know of themselves, in words', () => {
  it('a novice is told nothing; from handy up, one line, never a level or a number', () => {
    const w = newWorld(9);
    put(w, 'Siti', 'well');
    const plain = seen(w, 'Siti');
    expect(plain).not.toMatch(/fishing line|a feel for|decent meal/);
    skill(w, 'Siti', 'fishing', 2);
    expect(seen(w, 'Siti')).toContain("You're handy with a fishing line.");
    put(w, 'Rahim', 'well');
    expect(seen(w, 'Rahim')).toContain('People say nobody fishes like you.');
    for (const line of seen(w, 'Rahim').split('\n')) expect(line).not.toMatch(/\b(level|novice|handy|skilled|expert|master|xp|experience)\b|\d+%/i);
  });
});

describe('what each level does (S1: handy and expert)', () => {
  it('fishing: an empty line less often the better you are, half as often at the dawn and evening tides', () => {
    const noon = 12 * 60;
    expect([1, 2, 3, 4, 5].map((l) => emptyChance(l, noon))).toEqual([0.3, 0.25, 0.2, 0.15, 0.1]);
    expect(emptyChance(1, 7 * 60)).toBe(0.15);
    expect(emptyChance(1, 18 * 60)).toBe(0.15);
    expect(emptyChance(5, 18 * 60)).toBe(0.05);
  });

  it('farming: a handy grower harvests 6 a bed; any bed harvested the day it ripens gives 2 more, and only an expert is told', () => {
    const w = newWorld(9);
    const day = dayIndex(w.t);
    const ah = put(w, 'Ah Kow', 'farm');
    const siti = put(w, 'Siti', 'farm');
    w.state.beds[0] = { n: 1, planterId: ah.id, plantedDay: day - 2, wateredDays: 2, lastWateredDay: day - 1, readyDay: day, crop: 'kangkong', pickedDay: null };
    w.state.beds[1] = { n: 2, planterId: siti.id, plantedDay: day - 4, wateredDays: 2, lastWateredDay: day - 3, readyDay: day - 2, crop: 'kangkong', pickedDay: null };
    accepted(act(w, ah.id, { verb: 'harvest' }));
    expect(ah.items.vegetables).toBe(6 + 2);
    accepted(act(w, siti.id, { verb: 'harvest' }));
    expect(siti.items.vegetables).toBe(5);
    const fatimah = put(w, 'Fatimah', 'farm');
    w.state.beds[2] = { n: 3, planterId: fatimah.id, plantedDay: day - 2, wateredDays: 2, lastWateredDay: day - 1, readyDay: day, crop: 'kangkong', pickedDay: null };
    expect(seen(w, 'Fatimah')).toContain('Bed 3 is at its best today.');
    w.state.beds[3] = { n: 4, planterId: siti.id, plantedDay: day - 2, wateredDays: 2, lastWateredDay: day - 1, readyDay: day, crop: 'kangkong', pickedDay: null };
    expect(seen(w, 'Siti')).not.toContain('at its best');
  });

  it('a bed is ready on the day of its second watering, two days after planting at the soonest', () => {
    const w = newWorld(9);
    const siti = put(w, 'Siti', 'farm');
    accepted(act(w, siti.id, { verb: 'plant' }));
    accepted(act(w, siti.id, { verb: 'water' }));
    const bed = w.state.beds.find((b) => b.planterId === siti.id)!;
    expect(bed.readyDay).toBeNull();
    w.state.t += 1440;
    accepted(act(w, siti.id, { verb: 'water' }));
    expect(bed.readyDay).toBe(bed.plantedDay + 2);
  });

  it('cooking: a handy cook is a fifth quicker at the stove; an expert is told when the crowds will come', () => {
    const w = newWorld(11, 20);
    const huat = put(w, 'Ah Huat', 'kopitiam');
    w.shop('kopitiam')!.stock = { fish: 2, rice: 2, water: 2 };
    accepted(act(w, huat.id, { verb: 'cook', item: 'fish porridge', batches: 1 }));
    expect(huat.stove!.until).toBe(w.t + 8);
    expect(seen(w, 'Ah Huat')).toContain('The noon crowd from the road will be in soon.');
    put(w, 'Siti', 'kopitiam');
    expect(seen(w, 'Siti')).not.toContain('crowd');
  });

  it('fishing: an expert is told the tides', () => {
    const w = newWorld(16, 40);
    put(w, 'Rahim', 'jetty');
    put(w, 'Siti', 'jetty');
    expect(seen(w, 'Rahim')).toContain('The evening tide is coming in: the fish will bite well until seven.');
    expect(seen(w, 'Siti')).not.toContain('tide');
  });
});

describe('teaching', () => {
  it('a master offers to show someone; once agreed, deeds count double while they are together, up to twice the day\'s learning', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'jetty');
    const siti = put(w, 'Siti', 'jetty');
    expect(perceive(w, rahim).actions.some((a) => a.verb === 'teach')).toBe(true);
    expect(perceive(w, siti).actions.some((a) => a.verb === 'teach')).toBe(false);
    accepted(act(w, rahim.id, { verb: 'teach', to: 'Siti', item: 'fishing' }));
    expect(seen(w, 'Siti')).toContain('Rahim offers to show you how to fish.');
    accepted(act(w, siti.id, { verb: 'agree', from: 'Rahim' }));
    expect(seen(w, 'Siti')).toContain('Rahim is showing you how to fish.');
    expect(seen(w, 'Rahim')).toContain("You're showing Siti how to fish.");
    for (let i = 0; i < 10; i++) practise(w, siti, 'fishing');
    expect(siti.skills.fishing!.xp).toBe(12);
    // Apart, the lesson waits.
    put(w, 'Rahim', 'well');
    expect(seen(w, 'Siti')).not.toContain('is showing you');
  });

  it('teaching takes someone only as far as expert; the rest is their own', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'jetty');
    const siti = put(w, 'Siti', 'jetty');
    skill(w, 'Siti', 'fishing', 3, threshold('fishing', 4) - 1);
    accepted(act(w, rahim.id, { verb: 'teach', to: 'Siti', item: 'fishing' }));
    accepted(act(w, siti.id, { verb: 'agree', from: 'Rahim' }));
    practise(w, siti, 'fishing');
    expect(siti.skills.fishing!.xp).toBe(threshold('fishing', 4));
    expect(siti.recent.some((o) => o.text === "You've learnt all Rahim can show you; the rest is up to you.")).toBe(true);
    expect(w.state.lessons).toEqual([]);
    expect(refused(act(w, rahim.id, { verb: 'teach', to: 'Siti', item: 'fishing' }))).toBe('Siti knows as much as you could show.');
    expect(refused(act(w, rahim.id, { verb: 'teach', to: 'Siti', item: 'cooking' }))).toBe("You don't know cooking well enough to teach it.");
  });

  it('an offer not taken up lapses; a lesson ends with the day', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'jetty');
    const siti = put(w, 'Siti', 'jetty');
    accepted(act(w, rahim.id, { verb: 'teach', to: 'Siti', item: 'fishing' }));
    for (const r of [rahim, siti]) r.activity = null;
    run(w, 31);
    expect(w.state.lessonOffers).toEqual([]);
    for (const r of [rahim, siti]) put(w, r.name, 'jetty');
    accepted(act(w, rahim.id, { verb: 'teach', to: 'Siti', item: 'fish' }));
    accepted(act(w, siti.id, { verb: 'agree', from: 'Rahim', text: 'Yes, show me' }));
    expect(w.state.lessons).toHaveLength(1);
    w.state.t += 1440;
    advance(w);
    expect(w.state.lessons).toEqual([]);
  });
});

describe('fading', () => {
  it('a month away from the nets and you go rusty: one level down in what you can do, until a good day\'s practice', () => {
    const w = newWorld(9);
    const rahim = skill(w, 'Rahim', 'fishing', 5);
    rahim.skills.fishing!.lastDay = dayIndex(w.t) - SKILLS.fishing.rustyDays;
    fadeSkills(w);
    expect(rahim.skills.fishing!.rusty).toBe(true);
    expect(effectiveLevel(rahim, 'fishing')).toBe(4);
    put(w, 'Rahim', 'jetty');
    expect(seen(w, 'Rahim')).toContain("It's been a while since you last fished; your hands are slow.");
    for (let i = 0; i < SKILLS.fishing.cap; i++) practise(w, rahim, 'fishing');
    expect(rahim.skills.fishing!.rusty).toBe(false);
    expect(rahim.recent.at(-1)!.text).toBe('The feel of the line comes back to you.');
  });

  it('a year unused loses a level, and another each year more, but never below handy once skilled', () => {
    const w = newWorld(9);
    const siti = skill(w, 'Siti', 'fishing', 3);
    siti.skills.fishing!.lastDay = dayIndex(w.t) - 365;
    fadeSkills(w);
    expect(levelOf('fishing', siti.skills.fishing!.xp)).toBe(2);
    expect(siti.recent.at(-1)!.text).toBe("You've lost some of your feel for the nets.");
    fadeSkills(w);
    expect(levelOf('fishing', siti.skills.fishing!.xp)).toBe(2);
    siti.skills.fishing!.lastDay = dayIndex(w.t) - 3 * 365;
    fadeSkills(w);
    expect(levelOf('fishing', siti.skills.fishing!.xp)).toBe(2);
    const raju = skill(w, 'Raju', 'cooking', 2);
    raju.skills.cooking!.lastDay = dayIndex(w.t) - 365;
    fadeSkills(w);
    expect(levelOf('cooking', raju.skills.cooking!.xp)).toBe(1);
  });

  it('a change of tools turns everyone rusty at it at once', () => {
    const w = newWorld(9);
    toolsChange(w, 'cooking');
    expect(who(w, 'Ah Huat').skills.cooking!.rusty).toBe(true);
    expect(who(w, 'Rahim').skills.fishing!.rusty).toBe(false);
  });
});

describe('the free fake brain', () => {
  it('a master fishing beside someone offers to show them, and the learner agrees', () => {
    const w = newWorld(9);
    const rahim = put(w, 'Rahim', 'jetty');
    const siti = put(w, 'Siti', 'jetty');
    siti.activity = { kind: 'fishing', until: w.t + 30 };
    const b = new FakeBrain(5);
    let d = null;
    for (let i = 0; i < 40 && d?.verb !== 'teach'; i++) d = b.decide(perceive(w, rahim));
    expect(d).toMatchObject({ verb: 'teach', to: 'Siti', item: 'fishing' });
    accepted(act(w, rahim.id, d!));
    siti.activity = null;
    expect(new FakeBrain(1).decide(perceive(w, siti))).toMatchObject({ verb: 'agree', from: 'Rahim' });
  });
});

describe('the upgrade: everyone gets better at what they do from here', () => {
  it('gives the old hands their levels, everyone else nothing yet; no lessons; beds learn when they were ready', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 12)!;
    const world = {
      t: 3 * 1440,
      residents: [{ id: 'rahim' }, { id: 'ah-huat' }, { id: 'mak-esah' }, { id: 'fatimah' }, { id: 'ah-kow' }, { id: 'hassan' }, { id: 'siti' }],
      beds: [
        { n: 1, planterId: 'siti', plantedDay: 1, wateredDays: 2, lastWateredDay: 2 },
        { n: 2, planterId: 'siti', plantedDay: 3, wateredDays: 1, lastWateredDay: 3 },
        { n: 3, planterId: null, plantedDay: 0, wateredDays: 0, lastWateredDay: null },
      ],
    };
    const up = step.save!({ world, brains: {} }).world as { residents: { id: string; skills: Record<string, { xp: number; peak: number; lastDay: number }> }[]; beds: { readyDay: number | null }[]; lessons: unknown[]; lessonOffers: unknown[] };
    const of = (id: string) => up.residents.find((r) => r.id === id)!.skills;
    const day = Math.floor((3 * 1440 + 480) / 1440);
    expect(of('rahim')).toEqual({ fishing: { xp: 4380, peak: 5, lastDay: day, today: { day, xp: 0 }, rusty: false, drops: 0 } });
    expect(of('ah-huat').cooking!.xp).toBe(4384);
    expect(of('mak-esah').cooking!.xp).toBe(4384);
    expect(of('fatimah').farming!.xp).toBe(1460);
    expect(of('ah-kow').farming!.xp).toBe(146);
    expect(of('hassan').fishing!.xp).toBe(219);
    expect(of('siti')).toEqual({});
    expect(up.beds.map((b) => b.readyDay)).toEqual([3, null, null]);
    expect([up.lessons, up.lessonOffers]).toEqual([[], []]);
  });
});

describe('the wiki', () => {
  it("shows each resident's skills by level name and how far to the next, for watchers", () => {
    const w = newWorld(9);
    skill(w, 'Siti', 'fishing', 2, threshold('fishing', 2) + Math.round((threshold('fishing', 3) - threshold('fishing', 2)) / 4));
    const frame = new FrameBuilder().build(w);
    const people = peopleOf(frame, layoutOf(w));
    expect(people.find((p) => p.name === 'Rahim')!.skills).toEqual([{ skill: 'fishing', level: 'Master', toNext: null, rusty: false }]);
    expect(people.find((p) => p.name === 'Siti')!.skills).toEqual([{ skill: 'fishing', level: 'Handy', toNext: 25, rusty: false }]);
    expect(people.find((p) => p.name === 'Raju')!.skills).toEqual([]);
  });
});

it('every new line reads in-world', () => {
  for (const s of Object.values(SKILL_LINES)) for (const line of Object.values(s).flat()) expectInWorld(line);
});
