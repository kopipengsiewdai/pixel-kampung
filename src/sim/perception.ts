import { isRipe, isStaffed, shiftLabel, shopHere } from './actions/everyone.ts';
import type { DealKind } from './talk.ts';
import { availableActions } from './actions/index.ts';
import { LORRY_BUYS, LORRY_SELLS, quantityLabel, type ItemId } from './items.ts';
import { PLACES, PLACE_BY_ID } from './map.ts';
import { formatMoney, type Cents } from './money.ts';
import { CIRCLE_LINES, TALK_GAP_MINUTES, TALK_SOFT_LIMIT, talkKey, WORD_MINUTES, type Debt, type Goods, type Observation, type Resident, type TalkRecord, type World } from './state.ts';
import { nowLabel } from './calendar.ts';
import { dayIndex, sgtHour, sgtMinute } from './time.ts';

/** How many lines of their own ongoing conversation a resident has in mind. */
export const TALK_LINES = 6;
/** Someone who spoke to you waits this many minutes for an answer, then gives up waiting. */
export const WAIT_MINUTES = 15;

/**
 * Who is waiting on r for an answer: someone still nearby and awake who spoke
 * to r first (r hadn't said anything to them just before) in the last
 * WAIT_MINUTES, and whom r hasn't answered since, to them or to everyone,
 * unless their chat has already run long. An answer to something r said
 * doesn't keep r waited on, so each opener gets an answer without the two
 * going back and forth for the sake of it.
 */
export function waitingOn(w: World, r: Resident): Resident[] {
  return w.nearby(r).filter((o) => {
    if (w.isAsleep(o)) return false;
    const chat = w.state.talk[talkKey(r.id, o.id)];
    // Once the chat has run long ("you've been talking for a while") or gone round in circles, nobody is kept waiting.
    if (chat && (chat.lines >= TALK_SOFT_LIMIT || chat.idle >= CIRCLE_LINES) && w.t - chat.lastT <= TALK_GAP_MINUTES) return false;
    const asked = r.recent.findLastIndex((x) => x.talk && w.t - x.t <= WAIT_MINUTES && x.text.startsWith(`${o.name} says to you: "`));
    if (asked < 0) return false;
    const toThem = (x: Observation) => x.talk === true && (x.text.startsWith(`You say to ${o.name}: "`) || x.text.startsWith('You say: "'));
    const spokeFirst = !r.recent.slice(0, asked).some((x) => toThem(x) && r.recent[asked]!.t - x.t <= WAIT_MINUTES);
    return spokeFirst && !r.recent.slice(asked + 1).some(toThem);
  });
}

/** The chats r is in that are still going (not quiet for the gap), with whom. */
function chatsOf(w: World, r: Resident): { o: Resident; rec: TalkRecord }[] {
  return Object.entries(w.state.talk)
    .filter(([k, rec]) => k.split('|').includes(r.id) && w.t - rec.lastT <= TALK_GAP_MINUTES)
    .map(([k, rec]) => ({ o: w.resident(k.split('|').find((id) => id !== r.id)!), rec }));
}

export type HungerWord = 'full' | 'not hungry' | 'hungry' | 'very hungry' | 'starving';
export type EnergyWord = 'rested' | 'fine' | 'tired' | 'exhausted';

export interface PriceTag { item: ItemId; price: Cents; stock?: number; wants?: number }

/**
 * Everything a resident perceives at one moment: what their character sees,
 * hears, carries and remembers, plus what they could do right here. In-world
 * only: names, not ids; feelings, not numbers, for needs.
 */
export interface Perception {
  name: string;
  time: string;
  hour: number;
  minute: number;
  place: string;
  atHome: boolean;
  people: { name: string; doing: string }[];
  money: Cents;
  carrying: { item: ItemId; qty: number }[];
  hunger: HungerWord;
  energy: EnergyWord;
  job: {
    place: string; boss: string; shift: string; startHour: number; hours: number;
    doneToday: boolean; atWork: boolean; onShift: boolean;
    /** What's in the shop, seen while on shift there. */
    stock: { item: ItemId; qty: number }[];
  } | null;
  business: {
    place: string;
    atShop: boolean;
    stock: { item: ItemId; qty: number }[];
    sells: PriceTag[];
    buys: PriceTag[];
    workers: string[];
    owed: { name: string; cents: Cents }[];
  } | null;
  shop: { name: string; staffed: boolean; sells: PriceTag[]; buys: PriceTag[] } | null;
  lorry: { here: boolean; sells: PriceTag[]; buys: PriceTag[] } | null;
  beds: { n: number; ready: boolean; wateredToday: boolean }[];
  freeBeds: number | null;
  jobOffers: { from: string; wage: Cents; startHour: number; hours: number }[];
  trades: { from: string; give: string; want: string }[];
  /** Money they owe and are owed, summed per person (an IOU's words with it), and wages owed to them. */
  debts: { owe: { name: string; cents: Cents; what: string | null }[]; owedYou: { name: string; cents: Cents; what: string | null }[]; wages: { name: string; cents: Cents }[] };
  /** Loans offered or asked for, and IOUs written to them, waiting on their yes. */
  moneyOffers: { from: string; kind: 'lend' | 'borrow' | 'iou'; cents: Cents; what: string | null }[];
  recent: string[];
  /** The last lines of their own conversations, oldest first (they also stay in `recent`). */
  talk: string[];
  /** People they've been talking with for a while. */
  longTalks: string[];
  /** People nearby who said something to them and haven't had an answer yet. */
  waiting: string[];
  /** Deals talked of with someone nearby that nothing has backed yet: who, what about, and whether you said it. */
  unbacked: { name: string; kind: DealKind; mine: boolean }[];
  /** People nearby you keep going round in circles with. */
  circles: string[];
  /** What happened when they last tried something. */
  reply?: string;
  refused?: boolean;
  actions: { verb: string; says: string }[];
  placesYouKnow: string[];
}

export function hungerWord(h: number): HungerWord {
  return h < 200 ? 'full' : h < 450 ? 'not hungry' : h < 700 ? 'hungry' : h < 1000 ? 'very hungry' : 'starving';
}

export function energyWord(e: number): EnergyWord {
  return e > 700 ? 'rested' : e > 350 ? 'fine' : e > 150 ? 'tired' : 'exhausted';
}

function goodsList(g: Goods): { item: ItemId; qty: number }[] {
  return (Object.entries(g) as [ItemId, number][]).filter(([, n]) => n > 0).map(([item, qty]) => ({ item, qty }));
}

function doing(w: World, o: Resident): string {
  switch (o.activity?.kind) {
    case 'walking': return 'walking by';
    case 'fishing': return 'fishing';
    case 'working': return 'working';
    case 'sleeping': return 'asleep';
    default: return w.shopOf(o.id) && w.isAt(o, w.shopOf(o.id)!.id) ? 'minding the shop' : 'standing about';
  }
}

function tags(prices: Partial<Record<ItemId, Cents>>, stock?: Goods): PriceTag[] {
  return (Object.entries(prices) as [ItemId, Cents][]).map(([item, price]) =>
    (stock ? { item, price, stock: stock[item] ?? 0 } : { item, price }));
}

function buyTags(shop: { buyPrices: Partial<Record<ItemId, Cents>>; buyLimits: Partial<Record<ItemId, number>> }): PriceTag[] {
  return tags(shop.buyPrices).map((t) => {
    const wants = shop.buyLimits[t.item];
    return wants === undefined ? t : { ...t, wants };
  });
}

export function perceive(w: World, r: Resident): Perception {
  const here = w.placeOf(r);
  const today = dayIndex(w.t);
  const jobRow = w.jobOf(r.id);
  const own = w.shopOf(r.id);
  const shop = shopHere(w, r);
  const p: Perception = {
    name: r.name,
    time: nowLabel(w.state, w.t),
    hour: sgtHour(w.t),
    minute: sgtMinute(w.t),
    place: here ? (here.id === r.homeId ? 'your house' : w.placeName(here)) : 'out on the footpath',
    atHome: w.isAt(r, r.homeId),
    people: w.nearby(r).map((o) => ({ name: o.name, doing: doing(w, o) })),
    money: r.money,
    carrying: goodsList(r.items),
    hunger: hungerWord(r.hunger),
    energy: energyWord(r.energy),
    job: jobRow ? {
      place: PLACE_BY_ID.get(jobRow.placeId)!.name,
      boss: w.resident(jobRow.employerId).name,
      shift: shiftLabel(jobRow.startHour, jobRow.hours),
      startHour: jobRow.startHour,
      hours: jobRow.hours,
      doneToday: jobRow.lastWorkedDay === today,
      atWork: w.isAt(r, jobRow.placeId),
      onShift: r.activity?.kind === 'working',
      stock: r.activity?.kind === 'working' ? goodsList(w.shop(jobRow.placeId)?.stock ?? {}) : [],
    } : null,
    business: own ? {
      place: PLACE_BY_ID.get(own.id)!.name,
      atShop: w.isAt(r, own.id),
      stock: goodsList(own.stock),
      sells: tags(own.sellPrices, own.stock),
      buys: buyTags(own),
      workers: w.state.jobs.filter((j) => j.employerId === r.id).map((j) => w.resident(j.workerId).name),
      owed: w.state.owed.filter((o) => o.employerId === r.id).map((o) => ({ name: w.resident(o.workerId).name, cents: o.cents })),
    } : null,
    shop: shop && shop.ownerId !== r.id ? {
      name: PLACE_BY_ID.get(shop.id)!.name,
      staffed: isStaffed(w, shop),
      sells: tags(shop.sellPrices, shop.stock),
      buys: buyTags(shop),
    } : null,
    lorry: w.isAt(r, 'lorry-stop') ? {
      here: w.state.lorryHere,
      sells: r.role === 'owner' ? tags(LORRY_SELLS) : [],
      buys: tags(LORRY_BUYS),
    } : null,
    beds: w.state.beds.filter((b) => b.planterId === r.id)
      .map((b) => ({ n: b.n, ready: isRipe(w, b), wateredToday: b.lastWateredDay === today })),
    freeBeds: w.isAt(r, 'farm') ? w.state.beds.filter((b) => b.planterId === null).length : null,
    jobOffers: w.state.jobOffers.filter((o) => o.workerId === r.id)
      .map((o) => ({ from: w.resident(o.employerId).name, wage: o.wage, startHour: o.startHour, hours: o.hours })),
    trades: w.state.trades.filter((t) => t.toId === r.id).map((t) => ({
      from: w.resident(t.fromId).name,
      give: describeBundle(t.give),
      want: describeBundle(t.want),
    })),
    debts: {
      owe: debtsBy(w, (d) => d.debtor === r.id, (d) => d.creditor),
      owedYou: debtsBy(w, (d) => d.creditor === r.id, (d) => d.debtor),
      wages: w.state.owed.filter((o) => o.workerId === r.id).map((o) => ({ name: w.resident(o.employerId).name, cents: o.cents })),
    },
    moneyOffers: w.state.debtOffers.filter((o) => o.toId === r.id)
      .map((o) => ({ from: w.resident(o.fromId).name, kind: o.kind, cents: o.cents, what: o.what })),
    recent: r.recent.map((o) => o.text),
    talk: r.recent.filter((o) => o.talk && w.t - o.t <= TALK_GAP_MINUTES).slice(-TALK_LINES).map((o) => o.text),
    longTalks: chatsOf(w, r).filter(({ rec }) => rec.lines >= TALK_SOFT_LIMIT && rec.idle < CIRCLE_LINES).map(({ o }) => o.name),
    waiting: waitingOn(w, r).map((o) => o.name),
    unbacked: chatsOf(w, r)
      .filter(({ o, rec }) => rec.word && w.t - rec.word.t >= WORD_MINUTES && w.isNear(r, o) && !w.isAsleep(o)
        && !(rec.word.kind === 'job' && w.workBetween(r.id, o.id)))
      .map(({ o, rec }) => ({ name: o.name, kind: rec.word!.kind, mine: rec.word!.by === r.id })),
    circles: chatsOf(w, r).filter(({ o, rec }) => rec.idle >= CIRCLE_LINES && w.isNear(r, o) && !w.isAsleep(o)).map(({ o }) => o.name),
    actions: availableActions(w, r),
    placesYouKnow: PLACES.filter((pl) => w.knowsPlace(r, pl.id)).flatMap((pl) => {
      if (pl.id === r.homeId) return ['home'];
      if (pl.kind !== 'house') return [pl.name];
      const owner = w.state.residents.find((x) => x.homeId === pl.id);
      return owner && w.knowsPerson(r, owner.id) ? [w.placeName(pl)] : [];
    }),
  };
  if (r.reply) {
    p.reply = r.reply.text;
    p.refused = !r.reply.ok;
  }
  return p;
}

/** Debts picked out, summed per the other person (in order of the oldest), with any IOU words joined. */
function debtsBy(w: World, mine: (d: Debt) => boolean, other: (d: Debt) => string): { name: string; cents: Cents; what: string | null }[] {
  const out = new Map<string, { name: string; cents: Cents; what: string | null }>();
  for (const d of w.state.debts.filter(mine).sort((a, b) => a.since - b.since || a.id - b.id)) {
    const id = other(d);
    const row = out.get(id) ?? { name: w.resident(id).name, cents: 0, what: null };
    row.cents += d.cents;
    if (d.what) row.what = row.what ? `${row.what}, ${d.what}` : d.what;
    out.set(id, row);
  }
  return [...out.values()];
}

function describeBundle(b: { items: Goods; cents: Cents }): string {
  const parts = goodsList(b.items).map((g) => quantityLabel(g.item, g.qty));
  if (b.cents > 0) parts.push(formatMoney(b.cents));
  return parts.join(' and ') || 'nothing';
}

function priceLine(t: PriceTag): string {
  const stock = t.stock === undefined ? '' : t.stock === 0 ? ' (sold out)' : ` (${t.stock} left)`;
  const wants = t.wants === undefined ? '' : t.wants === 0 ? ' (no more wanted)' : ` (wants ${t.wants} more)`;
  return `${t.item} ${formatMoney(t.price)}${stock}${wants}`;
}

/** The last few things they saw or heard, besides the talk shown on its own. */
export function latelyLines(p: Perception): string[] {
  const talk = new Set(p.talk);
  return p.recent.filter((l) => !talk.has(l)).slice(-5);
}

/**
 * A deal talked of as done with nothing done yet, as either of the two sees
 * it. Talk of paying or a deal is worded for both alike (the one who said it
 * may be the one paid, "all paid"); talk of a job names who talked of it.
 */
function unbackedLine(u: { name: string; kind: DealKind; mine: boolean }): string {
  if (u.kind === 'paying') return `You and ${u.name} have talked of paying, but no money has changed hands.`;
  if (u.kind === 'deal') return `You and ${u.name} have talked of a deal, but nothing has changed hands.`;
  return u.mine
    ? `You've talked with ${u.name} about a job, but no job has been offered.`
    : `${u.name} talks about a job, but no job has been offered.`;
}

/** The perception as plain words, as the character would take it in. */
export function describe(p: Perception): string {
  const lines: string[] = [`It's ${p.time}. You're at ${p.place}.`];
  lines.push(p.people.length
    ? `Nearby: ${p.people.map((x) => `${x.name} (${x.doing})`).join(', ')}.`
    : "There's nobody else around.");
  lines.push(`You feel ${p.hunger} and ${p.energy}. You have ${formatMoney(p.money)}${p.carrying.length ? ` and you're carrying ${p.carrying.map((c) => quantityLabel(c.item, c.qty)).join(', ')}` : ''}.`);
  // What's owed, every moment, next to their money: so talk of debts meets what's true.
  const bracket = (what: string | null) => (what ? ` (${what})` : '');
  for (const d of p.debts.owe) lines.push(`You owe ${d.name} ${formatMoney(d.cents)}${bracket(d.what)}.`);
  for (const d of p.debts.owedYou) lines.push(`${d.name} owes you ${formatMoney(d.cents)}${bracket(d.what)}.`);
  for (const d of p.debts.wages) lines.push(`${d.name} owes you ${formatMoney(d.cents)} in wages.`);
  if (!p.debts.owe.length && !p.debts.owedYou.length && !p.debts.wages.length && !p.business?.owed.length) {
    lines.push('Nobody owes you anything, and you owe nobody.');
  }
  // What they are, every moment, so nobody talks as if they ran a shop they don't (or shared one that's theirs).
  if (!p.job && !p.business) lines.push("You have no work just now, and you don't run a stall or shop.");
  if (p.job) {
    lines.push(`You work for ${p.job.boss} at ${p.job.place}, ${p.job.shift}.${p.job.onShift ? " You're on shift now." : ''}`);
    if (!p.business) lines.push("You don't run a stall or shop.");
    if (p.job.onShift) lines.push(`In the shop: ${p.job.stock.map((s) => quantityLabel(s.item, s.qty)).join(', ') || 'nothing'}.`);
  }
  if (p.business) {
    lines.push(`You run ${p.business.place}. It's yours alone. In stock: ${p.business.stock.map((s) => quantityLabel(s.item, s.qty)).join(', ') || 'nothing'}.`);
    lines.push(`Your prices: ${p.business.sells.map(priceLine).join(', ') || 'none set'}.`);
    if (p.business.buys.length) lines.push(`You're buying: ${p.business.buys.map(priceLine).join(', ')}.`);
    if (p.business.workers.length) lines.push(`Working for you: ${p.business.workers.join(', ')}.`);
    if (p.business.owed.length) lines.push(`You owe wages: ${p.business.owed.map((o) => `${o.name} ${formatMoney(o.cents)}`).join(', ')}.`);
  }
  if (p.shop) {
    lines.push(`${p.shop.staffed ? 'Someone is serving.' : "Nobody's serving right now."} For sale: ${p.shop.sells.map(priceLine).join(', ') || 'nothing'}.`);
    if (p.shop.buys.length) lines.push(`They're buying: ${p.shop.buys.map(priceLine).join(', ')}.`);
  }
  if (p.lorry) {
    if (!p.lorry.here) lines.push("The lorry isn't here.");
    else {
      lines.push(`The lorry is here. The lorry man buys ${p.lorry.buys.map(priceLine).join(', ')}.`);
      if (p.lorry.sells.length) lines.push(`The lorry man takes orders for ${p.lorry.sells.map(priceLine).join(', ')}.`);
    }
  }
  if (p.beds.length) lines.push(`Your beds on the farm plot: ${p.beds.map((b) => `bed ${b.n} ${b.ready ? 'ready to harvest' : b.wateredToday ? 'watered today' : 'needs water'}`).join('; ')}.`);
  if (p.freeBeds !== null) lines.push(`${p.freeBeds} bed${p.freeBeds === 1 ? ' is' : 's are'} free on the plot.`);
  for (const o of p.jobOffers) lines.push(`${o.from} has offered you work ${shiftLabel(o.startHour, o.hours)} for ${formatMoney(o.wage)} a shift.`);
  for (const t of p.trades) lines.push(`${t.from} offers you ${t.give} for ${t.want}.`);
  for (const o of p.moneyOffers) {
    const sum = formatMoney(o.cents);
    lines.push(o.kind === 'lend' ? `${o.from} offers to lend you ${sum}.`
      : o.kind === 'borrow' ? `${o.from} asks to borrow ${sum} from you.`
      : `${o.from} writes you an IOU for ${sum}${bracket(o.what)}.`);
  }
  const lately = latelyLines(p);
  if (lately.length) lines.push(`Lately: ${lately.join(' ')}`);
  if (p.talk.length) lines.push(`The talk so far:\n${p.talk.map((l) => `- ${l}`).join('\n')}`);
  for (const n of p.longTalks) lines.push(`You've been talking with ${n} for a while.`);
  for (const n of p.circles) lines.push(`You and ${n} keep going round in circles.`);
  for (const u of p.unbacked) lines.push(unbackedLine(u));
  for (const n of p.waiting) lines.push(`${n} is waiting for your answer.`);
  if (p.reply) lines.push(p.reply);
  return lines.join('\n');
}
