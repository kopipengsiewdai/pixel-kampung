import { ITEMS, findItem, quantityLabel, type ItemId } from '../items.ts';
import { formatMoney, parseMoney, type Cents } from '../money.ts';
import type { Bundle, Goods, Resident, World } from '../state.ts';

/** What a resident asks to do. Fields come from a brain, so they're checked, never trusted. */
export interface Intent {
  verb: string;
  [field: string]: unknown;
}

/** `reply` is always in-world text: what the character sees, hears or realises. */
export interface ActionResult {
  ok: boolean;
  reply?: string;
}

export const ok = (reply?: string): ActionResult => (reply ? { ok: true, reply } : { ok: true });
export const no = (reply: string): ActionResult => ({ ok: false, reply });

export const MAX_QTY = 100;
export const MAX_PRICE: Cents = 10_000;

export function qtyOf(v: unknown, fallback = 1): number | null {
  if (v === undefined || v === null || v === '') return fallback;
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_QTY ? n : null;
}

/** Cents as an integer, or money text like "$1.20" / "20¢". */
export const MAX_MONEY: Cents = 1_000_000;

export function moneyOf(v: unknown): Cents | null {
  const c = typeof v === 'number' ? v : typeof v === 'string' ? parseMoney(v) : null;
  return c !== null && Number.isSafeInteger(c) && c >= 0 && c <= MAX_MONEY ? c : null;
}

export function itemOf(v: unknown): ItemId | null {
  return typeof v === 'string' ? findItem(v) : null;
}

export function textOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function quoted(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? `"${s.slice(0, 40)}"` : 'that';
}

export const SAY_NOTHING_SENSIBLE = "That's not a sensible amount.";

/** Who is actually with them, for when the one they meant isn't. */
export function whoIsHere(w: World, r: Resident): string {
  const here = w.nearby(r).map((o) => o.name);
  if (!here.length) return "There's nobody here with you.";
  return `Here with you: ${here.length === 1 ? here[0] : `${here.slice(0, -1).join(', ')} and ${here.at(-1)}`}.`;
}

/** Someone the resident can deal with face to face, or the in-world reason they can't. */
export function personNearby(w: World, r: Resident, name: unknown, opts: { awake?: boolean } = {}): Resident | string {
  const o = w.residentByName(name, r);
  if (!o) return `You don't know anyone called ${quoted(name)}; there's nobody by that name in the kampung.`;
  if (o.id === r.id) return "That's you.";
  if (!w.isNear(r, o)) return `${o.name} isn't nearby. ${whoIsHere(w, r)}`;
  if (opts.awake !== false && w.isAsleep(o)) return `${o.name} is fast asleep.`;
  return o;
}

export function goodsLabel(g: Goods): string {
  const parts = (Object.entries(g) as [ItemId, number][]).filter(([, n]) => n > 0).map(([i, n]) => quantityLabel(i, n));
  return parts.join(', ');
}

export function bundleLabel(b: Bundle): string {
  const parts = [goodsLabel(b.items), b.cents > 0 ? formatMoney(b.cents) : ''].filter(Boolean);
  return parts.join(' and ') || 'nothing';
}

/** Parses `{ items: { fish: 2 }, money: "20¢" }`, or the in-world reason it doesn't make sense. */
export function bundleOf(v: unknown): Bundle | string {
  if (v === undefined || v === null) return { items: {}, cents: 0 };
  if (typeof v !== 'object') return "You're not sure what you meant to trade.";
  const o = v as Record<string, unknown>;
  const items: Goods = {};
  if (o.items !== undefined) {
    if (typeof o.items !== 'object' || o.items === null) return "You're not sure what you meant to trade.";
    for (const [name, n] of Object.entries(o.items as Record<string, unknown>)) {
      const item = findItem(name);
      if (!item) return `You don't know what ${quoted(name)} is.`;
      const q = qtyOf(n, 0);
      if (q === null || q === 0) return SAY_NOTHING_SENSIBLE;
      items[item] = (items[item] ?? 0) + q;
    }
  }
  let cents = 0;
  if (o.money !== undefined) {
    const m = moneyOf(o.money);
    if (m === null) return "That doesn't sound like money.";
    cents = m;
  }
  return { items, cents };
}

export function isEmptyBundle(b: Bundle): boolean {
  return b.cents === 0 && Object.values(b.items).every((n) => !n);
}

/** Whether the resident holds everything in the bundle; if not, what's missing, in words. */
export function lacks(r: Resident, b: Bundle, you: boolean): string | null {
  const subject = you ? "You don't" : `${r.name} doesn't`;
  if (r.money < b.cents) return `${subject} have ${formatMoney(b.cents)}.`;
  for (const [item, n] of Object.entries(b.items) as [ItemId, number][]) {
    if ((r.items[item] ?? 0) < n) return `${subject} have ${quantityLabel(item, n)}.`;
  }
  return null;
}

export function itemWord(item: ItemId): string {
  return ITEMS[item].id;
}

/** Whether a sum of money was named at all. */
export function hasMoney(i: Intent): boolean {
  return i.money !== undefined && i.money !== null && i.money !== '';
}

/** "Pay later": true, "yes", "later"... */
export function saysLater(v: unknown): boolean {
  return v === true || (typeof v === 'string' && /^(true|yes|y|later|on credit|credit)$/i.test(v.trim()));
}
