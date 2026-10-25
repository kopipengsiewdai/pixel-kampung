import { bundleLabel } from '../sim/actions/common.ts';
import type { GameEvent } from '../sim/events.ts';
import { quantityLabel } from '../sim/items.ts';
import { PLACE_BY_ID } from '../sim/map.ts';
import { formatMoney } from '../sim/money.ts';
import { shortStamp, type Calendar } from '../sim/calendar.ts';

export interface FeedLine {
  t: number;
  seq: number;
  text: string;
  /** A hire, a firing, a first sale, someone collapsing: worth highlighting. */
  notable: boolean;
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
    case 'lorry_arrived': return line('The morning lorry rumbles in at the lorry stop.');
    case 'lorry_left': return line('The lorry pulls away down the road.');
    case 'lorry_sale': return line(`${n(e.who)} sold ${quantityLabel(e.item, e.qty)} to the lorry for ${formatMoney(e.cents)}.`);
    case 'lorry_order': return line(`${n(e.who)} ordered ${quantityLabel(e.item, e.qty)} off the lorry for ${formatMoney(e.cents)}.`);
    case 'went_fishing': return line(`${n(e.who)} casts a line off the jetty.`);
    case 'caught_fish': return line(e.qty === 0 ? `${n(e.who)} caught nothing.` : `${n(e.who)} landed ${quantityLabel('fish', e.qty)}.`);
    case 'planted': return line(`${n(e.who)} planted kangkong in bed ${e.bed}.`);
    case 'watered': return line(`${n(e.who)} watered the kangkong.`);
    case 'harvested': return line(`${n(e.who)} harvested ${quantityLabel('vegetables', e.qty)}.`, true);
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
  return f ? { t: e.t, seq: e.seq, ...f } : null;
}

/** "[Mon 07:05] ★ Siti is now working for Ah Huat ..." */
export function formatFeedLine(l: FeedLine, w: { calendar: Calendar }): string {
  return `[${shortStamp(w, l.t)}] ${l.notable ? '★ ' : ''}${l.text}`;
}
