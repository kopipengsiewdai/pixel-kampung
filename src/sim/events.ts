import type { SkillId } from './skills.ts';
import type { ChoreKind, Crop } from './state.ts';
import type { ItemId } from './items.ts';
import type { Cents } from './money.ts';
import type { Bundle } from './state.ts';

/** Everything that happens in town. Feeds the story feed; stored in the event log. */
export type EventBody =
  | { type: 'walked'; who: string; to: string }
  | { type: 'went_with'; who: string; with: string; to: string | null }
  | { type: 'arrived'; who: string; at: string }
  | { type: 'said'; who: string; to: string | null; text: string }
  | { type: 'bought'; who: string; from: string; shop: string; item: ItemId; qty: number; cents: Cents }
  | { type: 'took_stock'; who: string; shop: string; item: ItemId; qty: number }
  | { type: 'sold'; who: string; to: string; shop: string; item: ItemId; qty: number; cents: Cents }
  | { type: 'stocked'; who: string; shop: string; item: ItemId; qty: number }
  | { type: 'first_sale'; who: string; shop: string }
  | { type: 'lorry_arrived' }
  | { type: 'lorry_left' }
  | { type: 'lorry_sale'; who: string; item: ItemId; qty: number; cents: Cents }
  | { type: 'lorry_order'; who: string; shop: string; item: ItemId; qty: number; cents: Cents }
  | { type: 'went_fishing'; who: string }
  | { type: 'caught_fish'; who: string; qty: number }
  | { type: 'planted'; who: string; bed: number; crop?: Crop }
  | { type: 'watered'; who: string; beds: number }
  | { type: 'withered'; who: string; bed: number; crop: Crop }
  | { type: 'harvested'; who: string; qty: number; item?: ItemId }
  | { type: 'ate'; who: string; item: ItemId }
  | { type: 'fell_asleep'; who: string; reason: 'night' | 'nap' | 'collapse' }
  | { type: 'woke'; who: string }
  | { type: 'job_offered'; who: string; to: string; wage: Cents; startHour: number; hours: number }
  | { type: 'hired'; who: string; by: string; shop: string; wage: Cents }
  | { type: 'quit'; who: string; from: string }
  | { type: 'let_go'; who: string; worker: string }
  | { type: 'shift_started'; who: string; shop: string }
  | { type: 'shift_ended'; who: string; shop: string; earned: Cents }
  | { type: 'wages_paid'; who: string; to: string; cents: Cents; stillOwed: Cents }
  | { type: 'gave'; who: string; to: string; item: ItemId | null; qty: number; cents: Cents }
  | { type: 'trade_offered'; who: string; to: string; give: Bundle; want: Bundle }
  | { type: 'traded'; who: string; with: string; give: Bundle; want: Bundle }
  | { type: 'trade_declined'; who: string; from: string }
  | { type: 'chore_done'; who: string; chore: ChoreKind; for: string | null }
  | { type: 'helped'; who: string; to: string; how: 'beds' }
  | { type: 'errand_asked'; who: string; to: string; what: string; cents: Cents }
  | { type: 'errand_taken'; who: string; from: string }
  | { type: 'errand_refused'; who: string; from: string }
  | { type: 'errand_done'; who: string; for: string; cents: Cents; paid: boolean }
  | { type: 'skill_up'; who: string; skill: SkillId; level: number }
  | { type: 'skill_lost'; who: string; skill: SkillId; level: number }
  | { type: 'lesson_offered'; who: string; to: string; skill: SkillId }
  | { type: 'lesson_agreed'; who: string; from: string; skill: SkillId }
  | { type: 'lesson_refused'; who: string; from: string; skill: SkillId }
  | { type: 'traveller_bought'; shop: string; owner: string; by: string; item: ItemId; cents: Cents }
  | { type: 'travellers_hour'; shop: string; served: number; cents: Cents; left: number }
  | { type: 'price_offered'; who: string; owner: string; shop: string; item: ItemId; qty: number; cents: Cents }
  | { type: 'price_refused'; who: string; from: string; shop: string; item: ItemId; qty: number; cents: Cents }
  | { type: 'debt_offered'; who: string; to: string; kind: 'lend' | 'borrow' | 'iou'; cents: Cents; what: string | null }
  | { type: 'debt_agreed'; who: string; from: string; kind: 'lend' | 'borrow' | 'iou'; cents: Cents }
  | { type: 'debt_refused'; who: string; from: string; kind: 'lend' | 'borrow' | 'iou'; cents: Cents }
  | { type: 'repaid'; who: string; to: string; cents: Cents; stillOwed: Cents }
  | { type: 'let_off'; who: string; debtor: string; cents: Cents; stillOwed: Cents }
  | { type: 'note_pinned'; who: string; text: string }
  | { type: 'read_notices'; who: string }
  | { type: 'looked_around'; who: string }
  | { type: 'price_set'; who: string; shop: string; item: ItemId; side: 'sell' | 'buy'; cents: Cents; limit: number | null }
  | { type: 'cooked'; who: string; item: ItemId; qty: number }
  | { type: 'night_fell' }
  | { type: 'morning' }
  | { type: 'quiet_spell'; minutes: number }
  | { type: 'found_place'; who: string; place: string }
  | { type: 'kampung_quiet' }
  /** Two people have swapped several lines with nothing done between them (talk-circles.md). */
  | { type: 'circles'; a: string; b: string };

export type EventType = EventBody['type'];
export type GameEvent = EventBody & { seq: number; t: number };

/** One money movement. 'lorry' is outside the town. */
export interface LedgerEntry {
  seq: number;
  t: number;
  from: string;
  to: string;
  cents: Cents;
  reason: string;
}
