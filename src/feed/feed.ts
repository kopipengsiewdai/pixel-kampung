import { bundleLabel } from '../sim/actions/common.ts';
import type { GameEvent } from '../sim/events.ts';
import { quantityLabel } from '../sim/items.ts';
import { PLACE_BY_ID } from '../sim/map.ts';
import { formatMoney } from '../sim/money.ts';
import { howTo, oneWho } from '../sim/skills.ts';
import { dealKind } from '../sim/talk.ts';
import { shortStamp, type Calendar } from '../sim/calendar.ts';

export interface FeedLine {
  t: number;
  seq: number;
  text: string;
  /** A hire, a firing, a first sale, someone collapsing: worth highlighting. */
  notable: boolean;
  /** A key moment: shown when the page shows key moments only (sales, hires, money, notes, first visits...). */
  key: boolean;
}

/**
 * What the feed's "Key moments" view keeps: money and goods changing hands,
 * work, notes, first visits, the lorry and prices (and debts, as they come).
 * Walking, arriving, looking about and plain chat are left out.
 */
const KEY_TYPES: ReadonlySet<string> = new Set([
  'bought', 'sold', 'first_sale', 'lorry_arrived', 'lorry_sale', 'lorry_order', 'lorry_bought', 'lorry_haggled', 'lorry_asked', 'lorry_collected', 'lorry_paid',
  'job_offered', 'hired', 'quit', 'let_go', 'wages_paid',
  'gave', 'trade_offered', 'traded', 'trade_declined', 'note_pinned', 'price_set', 'found_place',
  'travellers_hour', 'errand_taken', 'errand_done', 'skill_up', 'lesson_agreed', 'helped', 'price_offered', 'price_refused', 'debt_offered', 'debt_agreed', 'debt_refused', 'repaid', 'let_off',
  'kampung_quiet', 'quiet_spell',
]);

/** Whether an event is a key moment: a key kind, anything notable, or talk claiming a deal done in words. */
export function isKeyMoment(e: GameEvent, notable: boolean): boolean {
  return notable || KEY_TYPES.has(e.type) || (e.type === 'said' && dealKind(e.text) !== null);
}

/**
 * The last n lines, and before them as many key moments again as fill n, in
 * order: so the key-moments view isn't left with a handful when the town is
 * busy with walking and chat.
 */
export function keepFeed<T extends FeedLine>(lines: readonly T[], n: number): T[] {
  const out: T[] = [];
  let keys = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    const recent = lines.length - i <= n;
    if (recent || (l.key && keys < n)) out.push(l);
    if (l.key) keys++;
    if (!recent && keys >= n) break;
  }
  return out.reverse();
}

type Names = (id: string) => string;

function place(id: string): string {
  return PLACE_BY_ID.get(id)?.name ?? id;
}

function hour(h: number): string {
  return h === 12 ? '12 noon' : h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** The story-feed sentence for an event, or null for events too small to mention. */
export function feedText(e: GameEvent, n: Names): { text: string; notable: boolean } | null {
  const line = (text: string, notable = false) => ({ text, notable });
  switch (e.type) {
    case 'walked': return line(`${n(e.who)} heads to ${e.to}.`);
    case 'went_with': return line(e.to ? `${n(e.who)} goes with ${n(e.with)} to ${e.to}.` : `${n(e.who)} goes after ${n(e.with)}.`);
    case 'said': return line(e.to ? `${n(e.who)} to ${n(e.to)}: "${e.text}"` : `${n(e.who)}: "${e.text}"`);
    case 'bought': return line(`${n(e.who)} bought ${quantityLabel(e.item, e.qty)} from ${n(e.from)} for ${formatMoney(e.cents)}.`);
    case 'sold': return line(`${n(e.who)} sold ${quantityLabel(e.item, e.qty)} to ${n(e.to)} for ${formatMoney(e.cents)}.`);
    case 'stocked': return line(`${n(e.who)} put ${quantityLabel(e.item, e.qty)} on the shelves at ${place(e.shop)}.`);
    case 'first_sale': return line(`${n(e.who)} makes the first sale at ${place(e.shop)}!`, true);
    case 'lorry_arrived': return line("Pak Osman's lorry rumbles in at the lorry stop.");
    case 'lorry_left': return line('Pak Osman pulls away down the road.');
    case 'lorry_sale': return line(`${n(e.who)} sold ${quantityLabel(e.item, e.qty)} to Pak Osman for ${formatMoney(e.cents)}.`);
    case 'lorry_order': return line(`${n(e.who)} bought ${quantityLabel(e.item, e.qty)} off the lorry for the shop, for ${formatMoney(e.cents)}.`);
    case 'lorry_bought': return line(`${n(e.who)} bought ${quantityLabel(e.item, e.qty)} off the lorry for ${formatMoney(e.cents)}${e.later ? ', on credit' : ''}.`);
    case 'lorry_haggled': {
      const what = `${formatMoney(e.cents)} for ${quantityLabel(e.item, e.qty)}`;
      const how = { took: 'takes', countered: `counters at ${formatMoney(e.counter ?? 0)} each to`, refused: 'turns down', flat: "won't haggle over" }[e.answer];
      return line(`Pak Osman ${how} ${n(e.who)}'s ${what}.`);
    }
    case 'lorry_asked': return line(`${n(e.who)} asks Pak Osman to bring ${quantityLabel(e.item, e.qty)} next time${e.deposit ? `, ${formatMoney(e.deposit)} down` : ''}.`);
    case 'lorry_collected': return line(`${n(e.who)} collects ${e.qty} of the ${e.asked} ${e.item} they asked Pak Osman for.`);
    case 'lorry_paid': return line(`${n(e.who)} pays Pak Osman ${formatMoney(e.cents)} off their slate.`);
    case 'lorry_gossip': return line(`Pak Osman, with news from town: "${e.text}"`);
    case 'lorry_priced': return null;
    case 'went_fishing': return line(`${n(e.who)} casts a line off the jetty.`);
    case 'caught_fish': return line(e.qty === 0 ? `${n(e.who)} caught nothing.` : `${n(e.who)} landed ${quantityLabel('fish', e.qty)}.`);
    case 'planted': return line(`${n(e.who)} planted ${e.crop === 'papaya' ? 'a papaya tree' : e.crop ?? 'kangkong'} in bed ${e.bed}.`);
    case 'watered': return line(`${n(e.who)} watered their ${e.beds === 1 ? 'bed' : 'beds'}.`);
    case 'withered': return line(`${n(e.who)}'s ${e.crop === 'papaya' ? 'papaya tree' : e.crop} in bed ${e.bed} withered.`);
    case 'harvested': return line(`${n(e.who)} harvested ${quantityLabel(e.item ?? 'vegetables', e.qty)}.`, true);
    case 'ate': return line(`${n(e.who)} had ${quantityLabel(e.item, 1)}.`);
    case 'fell_asleep':
      if (e.reason === 'collapse') return line(`${n(e.who)} is so worn out they doze off on the spot.`, true);
      if (e.reason === 'nap') return line(`${n(e.who)} lies down for a nap.`);
      return null;
    case 'job_offered': return line(`${n(e.who)} offered ${n(e.to)} work, ${hour(e.startHour)} to ${hour(e.startHour + e.hours)}, at ${formatMoney(e.wage)} a shift.`);
    case 'hired': return line(`${n(e.who)} is now working for ${n(e.by)} at ${place(e.shop)} (${formatMoney(e.wage)} a shift).`, true);
    case 'quit': return line(`${n(e.who)} quit working for ${n(e.from)}.`, true);
    case 'let_go': return line(`${n(e.who)} let ${n(e.worker)} go.`, true);
    case 'shift_started': return line(`${n(e.who)} starts a shift at ${place(e.shop)}.`);
    case 'shift_ended': return line(`${n(e.who)} finished a shift at ${place(e.shop)}, earning ${formatMoney(e.earned)}.`);
    case 'wages_paid': return line(`${n(e.who)} paid ${n(e.to)} ${formatMoney(e.cents)} in wages${e.stillOwed > 0 ? `, still owing ${formatMoney(e.stillOwed)}` : ''}.`);
    case 'gave':
      return line(e.item
        ? `${n(e.who)} gave ${n(e.to)} ${quantityLabel(e.item, e.qty)}.`
        : `${n(e.who)} gave ${n(e.to)} ${formatMoney(e.cents)}.`);
    case 'trade_offered': return line(`${n(e.who)} offered ${n(e.to)} ${bundleLabel(e.give)} for ${bundleLabel(e.want)}.`);
    case 'traded': return line(`${n(e.who)} and ${n(e.with)} made a trade: ${bundleLabel(e.want)} for ${bundleLabel(e.give)}.`);
    case 'trade_declined': return line(`${n(e.who)} turned down ${n(e.from)}'s offer.`);
    case 'traveller_bought': return null;
    case 'chore_done':
      if (e.chore === 'fetch_water') return line(`${n(e.who)} fetched a pail of water from the well.`);
      if (e.chore === 'gather_wood') return line(`${n(e.who)} gathered a bundle of firewood.`);
      if (e.chore === 'mend_nets') return line(e.for ? `${n(e.who)} mended ${n(e.for)}'s nets.` : `${n(e.who)} mended their nets.`);
      return line(`${n(e.who)} swept the shop.`);
    case 'helped': return line(`${n(e.who)} watered ${n(e.to)}'s beds.`);
    case 'errand_asked': return line(`${n(e.who)} asked ${n(e.to)} to ${e.what}, for ${formatMoney(e.cents)}.`);
    case 'errand_taken': return line(`${n(e.who)} took on ${n(e.from)}'s errand.`);
    case 'errand_refused': return line(`${n(e.who)} turned down ${n(e.from)}'s errand.`);
    case 'errand_done': return line(`${n(e.who)} ran an errand for ${n(e.for)} (${formatMoney(e.cents)}${e.paid ? '' : ', owed'}).`);
    case 'skill_up': return line(`${n(e.who)} has become ${oneWho(e.skill, e.level)}.`);
    case 'skill_lost': return line(`${n(e.who)}'s ${e.skill} has slipped for want of practice.`);
    case 'lesson_offered': return line(`${n(e.who)} offered to show ${n(e.to)} ${howTo(e.skill)}.`);
    case 'lesson_agreed': return line(`${n(e.from)} is showing ${n(e.who)} ${howTo(e.skill)}.`);
    case 'lesson_refused': return line(`${n(e.who)} turned down ${n(e.from)}'s offer to show them ${howTo(e.skill)}.`);
    case 'travellers_hour': return line(`Travellers from the road bought ${e.served} ${e.served === 1 ? 'thing' : 'things'} at ${place(e.shop)} this past hour, for ${formatMoney(e.cents)}${e.left ? `; ${e.left} left without being served` : ''}.`);
    case 'price_offered': return line(`${n(e.who)} offers ${formatMoney(e.cents)} for ${quantityLabel(e.item, e.qty)} at ${place(e.shop)}.`);
    case 'price_refused': return line(`${n(e.who)} turns down ${n(e.from)}'s ${formatMoney(e.cents)} for ${quantityLabel(e.item, e.qty)}.`);
    case 'debt_offered': {
      const sum = formatMoney(e.cents);
      if (e.kind === 'lend') return line(`${n(e.who)} offers to lend ${n(e.to)} ${sum}.`);
      if (e.kind === 'borrow') return line(`${n(e.who)} asks to borrow ${sum} from ${n(e.to)}.`);
      return line(`${n(e.who)} writes ${n(e.to)} an IOU for ${sum}${e.what ? ` (${e.what})` : ''}.`);
    }
    case 'debt_agreed': {
      const sum = formatMoney(e.cents);
      if (e.kind === 'lend') return line(`${n(e.who)} borrows ${sum} from ${n(e.from)}.`, true);
      if (e.kind === 'borrow') return line(`${n(e.who)} lends ${n(e.from)} ${sum}.`, true);
      return line(`${n(e.who)} takes ${n(e.from)}'s IOU for ${sum}.`, true);
    }
    case 'debt_refused':
      if (e.kind === 'lend') return line(`${n(e.who)} turns down ${n(e.from)}'s loan.`);
      if (e.kind === 'borrow') return line(`${n(e.who)} won't lend to ${n(e.from)}.`);
      return line(`${n(e.who)} turns down ${n(e.from)}'s IOU.`);
    case 'repaid': return line(`${n(e.who)} pays ${n(e.to)} back ${formatMoney(e.cents)}.`);
    case 'let_off': return line(`${n(e.who)} lets ${n(e.debtor)} off ${formatMoney(e.cents)}.`);
    case 'note_pinned': return line(`${n(e.who)} pinned a note on the board: "${e.text}"`);
    case 'price_set':
      if (e.cents === 0) return line(`${n(e.who)} stopped ${e.side === 'sell' ? 'selling' : 'buying'} ${e.item} at ${place(e.shop)}.`);
      return line(`${n(e.who)} now ${e.side === 'sell' ? 'sells' : 'buys'} ${e.item} at ${formatMoney(e.cents)}${e.limit !== null ? `, up to ${e.limit}` : ''} at ${place(e.shop)}.`);
    case 'cooked': return line(`${n(e.who)} cooked up ${quantityLabel(e.item, e.qty)}.`);
    case 'night_fell': return line('Night falls over the kampung. Everyone heads home to sleep.');
    case 'morning': return line('Dawn. The kampung stirs.');
    case 'kampung_quiet': return line('The kampung goes quiet for a good while. People rest where they are.');
    case 'circles': return null;
    case 'found_place': return line(`${n(e.who)} comes across ${place(e.place)} for the first time.`);
    case 'quiet_spell': return line(`The kampung was quiet for a while (${Math.floor(e.minutes / 60)}h ${e.minutes % 60}m). Everyone rested or worked quietly.`);
    case 'arrived':
    case 'took_stock':
    case 'woke':
    case 'read_notices':
    case 'looked_around':
      return null;
  }
}

export function feedLine(e: GameEvent, n: Names): FeedLine | null {
  const f = feedText(e, n);
  return f ? { t: e.t, seq: e.seq, ...f, key: isKeyMoment(e, f.notable) } : null;
}

/** "[Mon 07:05] ★ Siti is now working for Ah Huat ..." */
export function formatFeedLine(l: FeedLine, w: { calendar: Calendar }): string {
  return `[${shortStamp(w, l.t)}] ${l.notable ? '★ ' : ''}${l.text}`;
}
