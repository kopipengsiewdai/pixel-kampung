/**
 * The nightly money check (daily-life.md A): replays the ledger from its
 * opening entries and compares every purse with the money in the world.
 * Owner's eyes only (the town log); nothing a resident sees.
 */
import type { LedgerEntry } from './events.ts';
import { formatMoney, type Cents } from './money.ts';
import { OPENING_ID, OUTSIDE } from './state.ts';

export function auditLedger(entries: readonly LedgerEntry[], residents: readonly { id: string; name: string; money: Cents }[]): { ok: boolean; line: string } {
  // An older town's ledger began at its upgrade: what came before its opening entries is history, already in them.
  const start = entries.findIndex((l) => l.from === OPENING_ID);
  if (start < 0) return { ok: false, line: 'ledger MISMATCH: no opening entries' };
  const balance = new Map<string, Cents>();
  for (const l of entries.slice(start)) {
    if (!OUTSIDE.has(l.from)) balance.set(l.from, (balance.get(l.from) ?? 0) - l.cents);
    if (!OUTSIDE.has(l.to)) balance.set(l.to, (balance.get(l.to) ?? 0) + l.cents);
  }
  const off = residents.filter((r) => (balance.get(r.id) ?? 0) !== r.money)
    .map((r) => `${r.name} has ${formatMoney(r.money)} but the ledger says ${formatMoney(balance.get(r.id) ?? 0)}`);
  const here = new Set(residents.map((r) => r.id));
  const strangers = [...balance.keys()].filter((id) => !here.has(id)).map((id) => `the ledger has ${id}, who isn't in town`);
  const all = [...off, ...strangers];
  return all.length ? { ok: false, line: `ledger MISMATCH: ${all.join('; ')}` } : { ok: true, line: 'ledger OK' };
}
