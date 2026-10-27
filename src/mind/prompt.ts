import type { Card } from '../seed/cards.ts';
import type { Role } from '../sim/state.ts';
import { describe, type Perception } from '../sim/perception.ts';
import { quantityLabel } from '../sim/items.ts';
import { languageBetween } from '../seed/languages.ts';
import type { ThinkKind } from './model.ts';
import type { Memory } from './memory.ts';
import { POTTER } from './tools.ts';

/**
 * The stable part of every call: who the resident is, and how a moment works.
 * In-world words only (CLAUDE.md hard rule): no talk of games, systems,
 * features, prices or how anything in the kampung works.
 */
const THINK_IN_ENGLISH = 'Think to yourself in English.';

/** age: their age now, as the kampung's years go by (the card's, if not given). */
export function systemPrompt(card: Card, role: Role, shop: string | null, age = card.age): string {
  // Only an owner's line: it can't go stale. Whether someone has work is in the notes each moment.
  const roleLine = role === 'owner' && shop ? `You own ${shop}.` : '';
  return [
    `You are ${card.name}, ${age}. ${card.personality}`,
    `You want ${card.want}. You worry ${card.worry}.`,
    card.knows,
    card.languages ?? '',
    card.trade ?? '',
    roleLine,
    'You live in a kampung by the sea, in Singapore, in the 1960s.',
    `Live as ${card.name} would, one moment at a time. Each moment you get notes on where you are, what you notice and remember, and what you could do right now.`,
    `Choose one of those things and do it, with do. If nothing is worth doing, ${POTTER}. You may first write a short thought to yourself.`,
    'Speak plainly, as people in the kampung do. Only what you have seen, heard or worked out yourself is real to you.',
    `${THINK_IN_ENGLISH} Say things aloud in the language you would really use with that person, written in plain Roman letters.`,
  ].filter(Boolean).join('\n');
}

function memoryLines(memories: readonly Memory[]): string {
  if (!memories.length) return '';
  return `\nThings on your mind:\n${memories.map((m) => `- ${m.text}`).join('\n')}`;
}

const ASK: Record<ThinkKind, string> = {
  act: 'What do you do now?',
  business: 'Think about your shop: what you sell and for how much, what you buy, your stock, any workers. Then do one thing.',
  plan: "A new day. In a few short lines, what do you mean to do today? (Just plan; don't act yet.)",
  trader: 'Answer briefly.',
  translate: 'Translate.',
  reflect: 'The day is nearly over. In a few short lines to yourself: what happened today that matters, and what have you learned?',
};

/** Which language to use with each person here, if they speak (from both their ways of speaking): " (If you speak to Mdm Tan, use Teochew.)" */
function speakAs(p: Perception): string {
  const here = p.people.filter((o) => o.doing !== 'asleep').slice(0, 4);
  if (!here.length) return '';
  const [first, ...rest] = here.map((o) => ({ name: o.name, lang: languageBetween(p.name, o.name) }));
  return ` (If you speak to ${first!.name}, use ${first!.lang}${rest.map((o) => `; to ${o.name}, ${o.lang}`).join('')}.)`;
}

/** The morning plan, asked from where they are and what they hold, so it starts from what's real. */
function planAsk(p: Perception): string {
  const where = p.atHome ? 'at home' : p.placeId ? `at ${p.where}` : p.where;
  const holding = p.carrying.length ? p.carrying.map((c) => quantityLabel(c.item, c.qty)).join(', ') : 'nothing';
  return `A new day. You're ${where}, carrying ${holding}. In a few short lines, what do you mean to do today, starting from here and with what you have? (Just plan; don't act yet.)`;
}

/** The changing part of a call: this moment, in the resident's own terms. */
export function userPrompt(kind: ThinkKind, p: Perception, memories: readonly Memory[], plan: string | null): string {
  const parts = [describe(p)];
  parts.push(`Places you know: ${p.placesYouKnow.join(', ')}.`);
  // A plan made this morning may say "I'm hungry": it's read against how they feel now.
  if (plan && kind !== 'plan') parts.push(`\nYour plan for today:\n${plan}\n(You feel ${p.hunger} and ${p.energy} right now.)`);
  parts.push(memoryLines(memories));
  if (kind === 'act' || kind === 'business') {
    const doable = [...p.actions.map((a) => `- ${a.verb}: ${a.says}`), `- ${POTTER}`];
    parts.push(`\nThings you could do right now:\n${doable.join('\n')}`);
  }
  // The language to speak comes before the reminder to think in English: read last, "use Malay" carried thoughts into Malay.
  parts.push(`\n${kind === 'plan' ? planAsk(p) : `${ASK[kind]}${kind === 'act' || kind === 'business' ? `${speakAs(p)} ${THINK_IN_ENGLISH}` : ''}`}`);
  return parts.filter(Boolean).join('\n');
}
