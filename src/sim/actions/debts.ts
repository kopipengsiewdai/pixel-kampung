/**
 * Real debts and lending (docs/design/daily-life.md A): nobody is put in debt
 * without agreeing. A loan offered or asked for, or an IOU written, waits on
 * the other one's yes; money moves only through World.transfer.
 */
import { quantityLabel } from '../items.ts';
import { formatMoney, type Cents } from '../money.ts';
import type { Debt, DebtOffer, Resident, World } from '../state.ts';
import { acceptPrice, priceOfferFrom, refusePrice } from './haggle.ts';
import { type ActionResult, type Intent, moneyOf, no, ok, personNearby, quoted, textOf } from './common.ts';

export const DEBT_OFFER_MINUTES = 30;
export const MAX_IOU_WORDS = 80;

/** How much they meant, or the in-world reason it isn't a sum. */
function sumOf(v: unknown, how: string): Cents | string {
  if (v === undefined || v === null || v === '') return how;
  const cents = moneyOf(v);
  return cents === null || cents === 0 ? "That doesn't sound like money." : cents;
}

function iouWords(v: unknown): string | null {
  const t = textOf(v);
  return t ? t.replace(/[.!]+$/, '').slice(0, MAX_IOU_WORDS) : null;
}

const bracket = (what: string | null) => (what ? ` (${what})` : '');

function offer(w: World, r: Resident, o: Resident, kind: DebtOffer['kind'], cents: Cents, what: string | null): void {
  w.state.debtOffers = w.state.debtOffers.filter((x) => !(x.fromId === r.id && x.toId === o.id));
  w.state.debtOffers.push({ id: w.nextId(), kind, fromId: r.id, toId: o.id, cents, what, expires: w.t + DEBT_OFFER_MINUTES });
  w.emit({ type: 'debt_offered', who: r.id, to: o.id, kind, cents, what });
}

export function lend(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const cents = sumOf(i.money, 'Lend them how much?');
  if (typeof cents === 'string') return no(cents);
  if (r.money < cents) return no(`You don't have ${formatMoney(cents)}.`);
  offer(w, r, o, 'lend', cents, null);
  w.notify(o.id, `${r.name} offers to lend you ${formatMoney(cents)}.`);
  return ok(`You offer to lend ${o.name} ${formatMoney(cents)}.`);
}

export function borrow(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const cents = sumOf(i.money, 'Borrow how much?');
  if (typeof cents === 'string') return no(cents);
  offer(w, r, o, 'borrow', cents, null);
  w.notify(o.id, `${r.name} asks to borrow ${formatMoney(cents)} from you.`);
  return ok(`You ask ${o.name} to lend you ${formatMoney(cents)}.`);
}

export function writeIou(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const cents = sumOf(i.money, 'An IOU for how much?');
  if (typeof cents === 'string') return no(cents);
  const what = iouWords(i.text);
  offer(w, r, o, 'iou', cents, what);
  w.notify(o.id, `${r.name} writes you an IOU for ${formatMoney(cents)}${bracket(what)}.`);
  return ok(`You write ${o.name} an IOU for ${formatMoney(cents)}${bracket(what)}.`);
}

/** Adds to what debtor owes creditor of this kind, keeping when it began. */
function addDebt(w: World, debtor: string, creditor: string, kind: Debt['kind'], cents: Cents, what: string | null): void {
  const d = w.state.debts.find((x) => x.debtor === debtor && x.creditor === creditor && x.kind === kind);
  if (!d) {
    w.state.debts.push({ id: w.nextId(), debtor, creditor, cents, since: w.t, kind, due: null, what });
    return;
  }
  d.cents += cents;
  if (what && d.what !== what) d.what = (d.what ? `${d.what}, ${what}` : what).slice(0, MAX_IOU_WORDS);
}

function offerFrom(w: World, r: Resident, from: unknown): { o: Resident; offer: DebtOffer } | string {
  const o = w.residentByName(from);
  if (!o) return `You don't know anyone called ${quoted(from)}.`;
  const found = w.state.debtOffers.find((x) => x.fromId === o.id && x.toId === r.id);
  if (!found) return `${o.name} hasn't asked you about any money.`;
  return { o, offer: found };
}

/**
 * Which of someone's offers r means: a price at r's counter (when r names the
 * item, or it's the only one), a money offer, or neither (asked which).
 */
function whichOffer(w: World, r: Resident, i: Intent): { price: ReturnType<typeof priceOfferFrom> } | { money: { o: Resident; offer: DebtOffer } } | string {
  const money = offerFrom(w, r, i.from);
  const price = priceOfferFrom(w, r, i.from);
  if (typeof money === 'string') return price ? { price } : money;
  if (!price) return { money };
  if (i.item !== undefined && i.item !== null && i.item !== '') return { price };
  return `${money.o.name} has asked you about money and offered ${formatMoney(price.offer.cents)} for ${quantityLabel(price.offer.item, price.offer.qty)}. Which do you mean?`;
}

export function agree(w: World, r: Resident, i: Intent): ActionResult {
  const which = whichOffer(w, r, i);
  if (typeof which === 'string') return no(which);
  if ('price' in which) return acceptPrice(w, r, which.price!);
  const found = which.money;
  const { o, offer: x } = found;
  const near = personNearby(w, r, o.name);
  if (typeof near === 'string') return no(near);
  const sum = formatMoney(x.cents);
  if (x.kind === 'iou') {
    addDebt(w, o.id, r.id, 'iou', x.cents, x.what);
  } else {
    const [lender, borrower] = x.kind === 'lend' ? [o, r] : [r, o];
    if (lender.money < x.cents) return no(lender === r ? `You don't have ${sum}.` : `${o.name} doesn't have ${sum}.`);
    w.transfer(lender.id, borrower.id, x.cents, 'loan');
    addDebt(w, borrower.id, lender.id, 'loan', x.cents, null);
  }
  w.state.debtOffers = w.state.debtOffers.filter((y) => y.id !== x.id);
  w.emit({ type: 'debt_agreed', who: r.id, from: o.id, kind: x.kind, cents: x.cents });
  if (x.kind === 'lend') {
    w.notify(o.id, `${r.name} agrees to borrow ${sum} from you.`);
    return ok(`You borrow ${sum} from ${o.name}.`);
  }
  if (x.kind === 'borrow') {
    w.notify(o.id, `${r.name} agrees to lend you ${sum}.`);
    return ok(`You lend ${o.name} ${sum}.`);
  }
  w.notify(o.id, `${r.name} takes your IOU for ${sum}.`);
  return ok(`You take ${o.name}'s IOU for ${sum}.`);
}

export function refuse(w: World, r: Resident, i: Intent): ActionResult {
  const which = whichOffer(w, r, i);
  if (typeof which === 'string') return no(which);
  if ('price' in which) return refusePrice(w, r, which.price!);
  const found = which.money;
  const { o, offer: x } = found;
  const sum = formatMoney(x.cents);
  w.state.debtOffers = w.state.debtOffers.filter((y) => y.id !== x.id);
  w.emit({ type: 'debt_refused', who: r.id, from: o.id, kind: x.kind, cents: x.cents });
  if (x.kind === 'lend') {
    w.notify(o.id, `${r.name} doesn't want to borrow ${sum} from you.`);
    return ok(`You turn down ${o.name}'s offer to lend you ${sum}.`);
  }
  if (x.kind === 'borrow') {
    w.notify(o.id, `${r.name} won't lend you ${sum}.`);
    return ok(`You tell ${o.name} you won't lend ${sum}.`);
  }
  w.notify(o.id, `${r.name} won't take your IOU for ${sum}.`);
  return ok(`You turn down ${o.name}'s IOU.`);
}

const between = (w: World, debtor: string, creditor: string) =>
  w.state.debts.filter((d) => d.debtor === debtor && d.creditor === creditor).sort((a, b) => a.since - b.since || a.id - b.id);

const total = (ds: Debt[]) => ds.reduce((n, d) => n + d.cents, 0);

/** Takes cents off the debts in this order; cleared ones go. */
function reduce(w: World, ds: Debt[], cents: Cents): void {
  let left = cents;
  for (const d of ds) {
    const off = Math.min(d.cents, left);
    d.cents -= off;
    left -= off;
  }
  w.state.debts = w.state.debts.filter((d) => d.cents > 0);
}

export function repay(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const mine = between(w, r.id, o.id);
  if (mine.length === 0) return no(`You don't owe ${o.name} anything.`);
  const owed = total(mine);
  const asked = i.money === undefined || i.money === null || i.money === '' ? owed : sumOf(i.money, '');
  if (typeof asked === 'string') return no(asked);
  const cents = Math.min(asked, owed);
  if (r.money < cents) return no(`You only have ${formatMoney(r.money)}.`);
  w.transfer(r.id, o.id, cents, 'repaid');
  reduce(w, mine, cents);
  const still = owed - cents;
  w.emit({ type: 'repaid', who: r.id, to: o.id, cents, stillOwed: still });
  w.notify(o.id, `${r.name} pays you back ${formatMoney(cents)}.${still ? ` ${r.name} still owes you ${formatMoney(still)}.` : ''}`);
  return ok(`You pay ${o.name} back ${formatMoney(cents)}. ${still ? `You still owe ${o.name} ${formatMoney(still)}.` : `You don't owe ${o.name} anything now.`}`);
}

export function letOff(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to, { awake: false });
  if (typeof o === 'string') return no(o);
  // The newest first: letting someone off part leaves the oldest standing.
  const theirs = between(w, o.id, r.id).reverse();
  if (theirs.length === 0) return no(`${o.name} doesn't owe you anything.`);
  const owed = total(theirs);
  const asked = i.money === undefined || i.money === null || i.money === '' ? owed : sumOf(i.money, '');
  if (typeof asked === 'string') return no(asked);
  const cents = Math.min(asked, owed);
  reduce(w, theirs, cents);
  const still = owed - cents;
  w.emit({ type: 'let_off', who: r.id, debtor: o.id, cents, stillOwed: still });
  w.notify(o.id, `${r.name} lets you off ${formatMoney(cents)}. ${still ? `You still owe ${r.name} ${formatMoney(still)}.` : `You don't owe ${r.name} anything now.`}`);
  return ok(`You let ${o.name} off ${formatMoney(cents)}.${still ? ` ${o.name} still owes you ${formatMoney(still)}.` : ''}`);
}
