import type { Card } from '../seed/cards.ts';
import { describe, type Perception } from '../sim/perception.ts';
import type { ThinkKind } from './model.ts';
import type { Memory } from './memory.ts';
import { POTTER } from './tools.ts';

/**
 * The stable part of every call: who the resident is, and how a moment works.
 * In-world words only (CLAUDE.md hard rule): no talk of games, systems,
 * features, prices or how anything in the kampung works.
 */
export function systemPrompt(card: Card, role: 'owner' | 'seeker', shop: string | null): string {
  // Only an owner's line: it can't go stale. Whether someone has work is in the notes each moment.
  const roleLine = role === 'owner' && shop ? `You own ${shop}.` : '';
  return [
    `You are ${card.name}, ${card.age}. ${card.personality}`,
    `You want ${card.want}. You worry ${card.worry}.`,
    card.knows,
    card.trade ?? '',
    roleLine,
    'You live in a kampung by the sea, in Singapore, in the 1960s.',
    `Live as ${card.name} would, one moment at a time. Each moment you get notes on where you are, what you notice and remember, and what you could do right now.`,
    `Choose one of those things and do it, with do. If nothing is worth doing, ${POTTER}. You may first write a short thought to yourself.`,
    'Speak plainly, as people in the kampung do. Only what you have seen, heard or worked out yourself is real to you.',
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
  reflect: 'The day is nearly over. In a few short lines to yourself: what happened today that matters, and what have you learned?',
};

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
  parts.push(`\n${ASK[kind]}`);
  return parts.filter(Boolean).join('\n');
}
