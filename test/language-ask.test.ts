import { describe, expect, it } from 'vitest';
import { cleanThought, englishOwnWords } from '../src/mind/mind.ts';
import { userPrompt } from '../src/mind/prompt.ts';
import { CARDS } from '../src/seed/cards.ts';
import { languageWith, HOME_LANGUAGE } from '../src/seed/languages.ts';
import { perceive } from '../src/sim/perception.ts';
import { expectInWorld, newWorld, put } from './helpers.ts';

describe('which language with whom (B5)', () => {
  it('every resident has a home language, matching their card', () => {
    for (const c of CARDS) {
      const id = c.name.toLowerCase().replace(/\s+/g, '-');
      expect(HOME_LANGUAGE[id], c.name).toBeTruthy();
      expect(c.languages).toContain(HOME_LANGUAGE[id]!);
    }
  });

  it('the same home language between them, else bazaar Malay', () => {
    expect(languageWith('mei-ling', 'mdm-tan')).toBe('Teochew');
    expect(languageWith('muthu', 'raju')).toBe('Tamil');
    expect(languageWith('mei-ling', 'raju')).toBe('bazaar Malay');
    expect(languageWith('siti', 'mak-esah')).toBe('Malay');
    expect(languageWith('ah-huat', 'rahim')).toBe('bazaar Malay');
  });

  it('the ask line names the language for each person with them', () => {
    const w = newWorld(9);
    put(w, 'Mei Ling', 'well');
    put(w, 'Mdm Tan', 'well');
    put(w, 'Raju', 'well');
    const p = perceive(w, w.state.residents.find((r) => r.name === 'Mei Ling')!);
    const ask = userPrompt('act', p, [], null).split('\n').at(-1)!;
    expect(ask).toMatch(/to Mdm Tan in Teochew/);
    expect(ask).toMatch(/to Raju in bazaar Malay/);
    expectInWorld(ask);
  });
});

describe('their own words, in English', () => {
  it('older thoughts and plans not in English are left out of what comes to mind; talk heard is kept', () => {
    const kept = englishOwnWords([
      { t: 1, kind: 'thought', text: 'Saya lapar sangat, mesti cari makan.' },
      { t: 2, kind: 'plan', text: 'My plan for today: Pergi ke jeti dan tangkap ikan.' },
      { t: 3, kind: 'thought', text: 'I should fish at the jetty this morning.' },
      { t: 4, kind: 'noticed', text: 'Mak Esah says to you: "Siti, makan dulu."' },
    ]);
    expect(kept.map((m) => m.t)).toEqual([3, 4]);
  });

  it('the instruction never leaks into a thought', () => {
    expect(cleanThought('*Think to myself:* I am hungry.')).toBe('I am hungry.');
    expect(cleanThought('(Thinking to myself) The lorry is late.')).toBe('The lorry is late.');
    expect(cleanThought('Think to myself: Rahim owes me 50 cents.')).toBe('Rahim owes me 50 cents.');
    expect(cleanThought('I think to myself that it will rain.')).toBe('I think to myself that it will rain.');
  });
});
