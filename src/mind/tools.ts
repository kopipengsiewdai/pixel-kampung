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
  description: 'Do one thing now. Choose one of the things you could do right now, in those words, and fill in only the details it needs.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'What you do, e.g. "walk to", "say", "buy", "potter about".' },
      where: { type: 'string', description: 'A place you know, someone you know, or a direction: north, south, east or west.' },
      person: { type: 'string', description: 'Who it involves, by name.' },
      words: { type: 'string', description: 'What you say or write.' },
      item: { type: 'string', description: 'The thing, e.g. "fish", "kopi".' },
      amount: { type: 'integer', description: 'How many.' },
      money: { type: 'string', description: 'An amount of money, e.g. "20¢" or "$1.20".' },
      price: { type: 'string', description: 'A price each, e.g. "25¢". "0" to stop.' },
      buying: { type: 'boolean', description: 'For a price: true if it is what you pay, not what you charge.' },
      wanted: { type: 'integer', description: 'For a buying price: the most you will take.' },
      wage: { type: 'string', description: 'Pay for one shift, e.g. "$2.00".' },
      start: { type: 'integer', description: 'Hour the shift starts, 6 to 22.' },
      hours: { type: 'integer', description: 'How long the shift is, in hours.' },
      batches: { type: 'integer', description: 'How many batches to cook.' },
      give: { type: 'object', description: 'In a trade, what you hand over: { "items": { "fish": 2 }, "money": "10¢" }.' },
      want: { type: 'object', description: 'In a trade, what you want back, same shape.' },
    },
    required: ['action'],
  },
};

export const POTTER = 'potter about';

/** The `do` call that expresses an action: what a model would send for it. */
export function fromIntent(intent: Intent): Record<string, unknown> {
  const { verb, to, from, who, text, qty, startHour, side, limit, ...rest } = intent;
  const out: Record<string, unknown> = { action: verb.replace(/_/g, ' ') };
  const person = to ?? from ?? who;
  if (person !== undefined) out.person = person;
  if (text !== undefined) out.words = text;
  if (qty !== undefined) out.amount = qty;
  if (startHour !== undefined) out.start = startHour;
  if (side === 'buy') out.buying = true;
  if (limit !== undefined) out.wanted = limit;
  return { ...out, ...rest };
}

/** A `do` call as an action the town understands, or null to potter about. */
export function toIntent(input: unknown): Intent | null {
  if (!input || typeof input !== 'object') return null;
  const i = input as Record<string, unknown>;
  const action = typeof i.action === 'string' ? i.action.trim().toLowerCase() : '';
  if (!action || action === POTTER) return null;
  const verb = action.replace(/\b(a|an|the|your)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const out: Intent = { verb };
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
  for (const [from, to] of copy) if (i[from] !== undefined && i[from] !== null) out[to] = i[from];
  if (i.buying === true) out.side = 'buy';
  if (i.wanted !== undefined && i.wanted !== null) out.limit = i.wanted;
  return out;
}
