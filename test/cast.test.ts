import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { systemPrompt } from '../src/mind/prompt.ts';
import { CARDS } from '../src/seed/cards.ts';
import { CAST } from '../src/seed/cast.ts';
import { PLACE_BY_ID } from '../src/sim/map.ts';
import { act, accepted, expectInWorld, newWorld, refused, who } from './helpers.ts';

/** The approved cast, as written in docs/design/cast.md. */
function castDoc(): { name: string; age: number; business: string | null; family: boolean }[] {
  const doc = readFileSync(new URL('../docs/design/cast.md', import.meta.url), 'utf8');
  const BUSINESS: Record<string, string> = { kopitiam: 'kopitiam', 'provision shop': 'provision-shop', 'wet-market stall': 'market-stall' };
  const familyFrom = doc.indexOf('## Living with family');
  return [...doc.matchAll(/^\*\*\d+\. (.+?)\*\*, (\d+)(?:, runs the (.+))?$/gm)]
    .map((m) => ({ name: m[1]!, age: Number(m[2]), business: m[3] ? BUSINESS[m[3].trim()]! : null, family: m.index! > familyFrom }));
}

describe('the cast', () => {
  it('matches the approved cast: names, ages, roles and businesses', () => {
    const doc = castDoc();
    expect(doc).toHaveLength(13);
    expect(CARDS.map((c) => [c.name, c.age])).toEqual(doc.map((d) => [d.name, d.age]));
    expect(CAST.map((c) => [c.name, c.role, c.business ?? null]))
      .toEqual(doc.map((d) => [d.name, d.business ? 'owner' : d.family ? 'family' : 'seeker', d.business]));
  });

  it("each card's trade is the one on the approved page, word for word, and only six have one", () => {
    const doc = readFileSync(new URL('../docs/design/cast.md', import.meta.url), 'utf8');
    const told = [...doc.matchAll(/^- \*Trade \(told as\):\* "(.+)"$/gm)].map((m) => m[1]);
    expect(CARDS.filter((c) => c.trade).map((c) => c.trade)).toEqual(told);
    expect(told).toHaveLength(6);
  });

  it("each card's ties name exactly the people they start out knowing", () => {
    const names = CAST.map((c) => c.name);
    for (const member of CAST) {
      const card = CARDS.find((c) => c.name === member.name)!;
      for (const n of member.knows) expect(names, `${member.name} knows ${n}`).toContain(n);
      const named = names.filter((n) => n !== member.name && new RegExp(`\\b${n}\\b`).test(card.knows));
      expect(named.sort(), member.name).toEqual([...member.knows].sort());
    }
  });

  it('family and old friends are known from day one; everyone else is met in play', () => {
    const w = newWorld(9, 0, 1, true, false);
    const huat = who(w, 'Ah Huat');
    expect(w.knowsPerson(huat, who(w, 'Ah Seng').id)).toBe(true);
    expect(w.knowsPerson(huat, who(w, 'Rahim').id)).toBe(true);
    expect(w.knowsPerson(huat, who(w, 'Siti').id)).toBe(false);
    expect(who(w, 'Ah Kow').knownPeople).toEqual([]);
    for (const member of CAST) {
      const r = who(w, member.name);
      expect(r.knownPeople.map((id) => w.resident(id).name).sort()).toEqual([...member.knows].sort());
    }
    // A cousin can go and find his cousin; a newcomer can't look for someone he's never met.
    accepted(act(w, who(w, 'Muthu').id, { verb: 'walk_to', where: 'Raju' }));
    refused(act(w, who(w, 'Ah Kow').id, { verb: 'walk_to', where: 'Ah Huat' }));
  });

  it("each resident is told who they are and whom they know, in the kampung's own words", () => {
    const banned = /\b(game|simulation|simulated|agent|AI|API|system|feature|implemented|tool|JSON|token|model|prompt|player|npc|engine|server|database|lorry|price)\b|_/i;
    for (const member of CAST) {
      const card = CARDS.find((c) => c.name === member.name)!;
      const shop = member.business ? PLACE_BY_ID.get(member.business)!.name : null;
      const text = systemPrompt(card, member.role, shop);
      expect(text).toContain(card.knows);
      expect(text, member.name).not.toMatch(banned);
      expectInWorld(text);
    }
    const huat = systemPrompt(CARDS[0]!, 'owner', 'the kopitiam');
    expect(huat).toContain('Ah Seng is your son.');
    expect(huat).toContain('You own the kopitiam.');
  });
});
