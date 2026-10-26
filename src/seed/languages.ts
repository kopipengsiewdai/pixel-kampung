/**
 * Which language two residents speak together (docs/design/cast.md, languages;
 * the cards say it in words): their home language if they share it, otherwise
 * bazaar Malay, the kampung's common tongue. Asked of a resident only as "say
 * things to Mdm Tan in Teochew", never as a rule about the game.
 */

/** Each resident's home language, as their card says. */
export const HOME_LANGUAGE: Readonly<Record<string, string>> = {
  'ah-huat': 'Hokkien', 'mdm-tan': 'Teochew', rahim: 'Malay', 'mei-ling': 'Teochew', 'ah-kow': 'Hakka', siti: 'Malay',
  muthu: 'Tamil', 'ah-seng': 'Hokkien', fatimah: 'Malay', raju: 'Tamil', 'mak-esah': 'Malay', aminah: 'Malay', hassan: 'Malay',
};

const byName = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

/** The language two residents (by name) would use together. */
export const languageBetween = (a: string, b: string) => languageWith(byName(a), byName(b));

/** The language a and b would use together. */
export function languageWith(a: string, b: string): string {
  const la = HOME_LANGUAGE[a];
  return la && la === HOME_LANGUAGE[b] ? la : 'bazaar Malay';
}
