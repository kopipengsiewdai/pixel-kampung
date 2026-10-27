import type Anthropic from '@anthropic-ai/sdk';
import type { Intent } from '../sim/actions/index.ts';

/**
 * The one way a resident acts: `do`, naming one of the things they could do
 * right now (listed fresh in each moment's notes) with the details it needs.
 * A single fixed tool keeps the cached prefix stable and never reveals
 * actions the resident can't take where they are.
 */
export const DO_TOOL: Anthropic.Tool = {
  name: 'do',
  description: 'Do one thing now. Choose one of the things you could do right now, in those words, and fill in only what it needs.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'What you do, in the words given, e.g. "walk to", "say", "potter about".' },
      where: { type: 'string', description: 'A place you know, someone you know, or a direction: north, south, east or west.' },
      person: { type: 'string', description: 'Who it involves, by name.' },
      words: { type: 'string', description: 'What you say or write.' },
      item: { type: 'string', description: 'The thing it is about.' },
      amount: { type: 'integer', description: 'How many.' },
      money: { type: 'string', description: 'An amount of money, e.g. "20¢" or "$1.20".' },
      details: { type: 'object', description: 'Anything else it needs, as named where it is offered.' },
    },
    required: ['action'],
  },
};

export const POTTER = 'potter about';

/** The `do` call that expresses an action: what a model would send for it. */
export function fromIntent(intent: Intent): Record<string, unknown> {
  const { verb, to, from, who, text, qty, startHour, side, limit, where, item, money, ...rest } = intent;
  const out: Record<string, unknown> = { action: verb.replace(/_/g, ' ') };
  const person = to ?? from ?? who;
  if (person !== undefined) out.person = person;
  if (where !== undefined) out.where = where;
  if (text !== undefined) out.words = text;
  if (item !== undefined) out.item = item;
  if (qty !== undefined) out.amount = qty;
  if (money !== undefined) out.money = money;
  const details: Record<string, unknown> = { ...rest };
  if (startHour !== undefined) details.start = startHour;
  if (side === 'buy') details.buying = true;
  if (limit !== undefined) details.wanted = limit;
  if (Object.keys(details).length) out.details = details;
  return out;
}

/** A `do` call as an action the town understands, or null to potter about. */
export function toIntent(input: unknown): Intent | null {
  if (!input || typeof input !== 'object') return null;
  const i = input as Record<string, unknown>;
  const action = typeof i.action === 'string' ? i.action.trim().toLowerCase() : '';
  if (!action || action === POTTER) return null;
  const verb = action.replace(/\b(a|an|the|your)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const out: Intent = { verb };
  // Action-specific details may arrive inside `details` or, from a looser model, at the top level.
  const d = { ...i, ...(i.details && typeof i.details === 'object' ? i.details as Record<string, unknown> : {}) };
  const copy: [string, string][] = [
    ['where', 'where'], ['item', 'item'], ['amount', 'qty'], ['money', 'money'], ['price', 'price'],
    ['wage', 'wage'], ['start', 'startHour'], ['hours', 'hours'], ['batches', 'batches'], ['give', 'give'], ['want', 'want'],
  ];
  if (typeof i.person === 'string') {
    out.to = i.person;
    out.from = i.person;
    out.who = i.person;
  }
  if (typeof i.words === 'string') out.text = i.words;
  for (const [from, to] of copy) if (d[from] !== undefined && d[from] !== null) out[to] = d[from];
  if (out.where === undefined && typeof i.person === 'string') out.where = i.person;
  if (d.buying === true) out.side = 'buy';
  if (d.renting === true) out.renting = true;
  if (d.wanted !== undefined && d.wanted !== null) out.limit = d.wanted;
  return out;
}
