/**
 * Meals and money between people (Kampung, 2026-10-29, items b and e, from
 * the live town): sharing a meal from what a cook holds (home-cooking.md),
 * and remembering money given today with nothing back.
 */
import { kinOf } from '../seed/cast.ts';
import { type ActionResult, type Intent, itemOf, no, ok } from './actions/common.ts';
import { eat } from './actions/everyone.ts';
import { ROUGH } from './households.ts';
import { ITEMS, type ItemId } from './items.ts';
import { formatMoney } from './money.ts';
import { addGoods, countGoods, type Resident, type World } from './state.ts';
import { dayIndex } from './time.ts';

/** From here a resident is hungry (perception.ts HUNGRY_FROM): who a cook serves. */
export const SERVE_FROM = 450;

/** The food they hold, the most servings first. */
export function heldFood(r: Resident): ItemId[] {
  return (Object.keys(r.items) as ItemId[]).filter((i) => ITEMS[i]?.food && countGoods(r.items, i) > 0)
    .sort((a, b) => countGoods(r.items, b) - countGoods(r.items, a));
}

function family(a: Resident, b: Resident): boolean {
  return (a.homeId === b.homeId && a.homeId !== ROUGH) || kinOf(a.id).some((k) => k.id === b.id) || kinOf(b.id).some((k) => k.id === a.id);
}

/** Family, or the household they live with, here with them, awake and hungry. */
function company(w: World, r: Resident): Resident[] {
  return w.nearby(r).filter((o) => !w.isAsleep(o) && o.hunger >= SERVE_FROM && family(r, o));
}

/** Offered only with real food in hand and someone hungry of theirs with them. */
export function canShareMeal(w: World, r: Resident): boolean {
  return heldFood(r).length > 0 && company(w, r).length > 0;
}

/** A cook holding food serves hungry family or household with them, one serving each, eaten just as they'd eat it themselves. */
export function shareMeal(w: World, r: Resident, i: Intent): ActionResult {
  const named = i.item !== undefined && i.item !== null && i.item !== '' ? itemOf(i.item) : null;
  const item = named && heldFood(r).includes(named) ? named : heldFood(r)[0];
  if (!item) return no("You've no food with you to share.");
  const served: Resident[] = [];
  for (const o of company(w, r)) {
    if (countGoods(r.items, item) < 1) break;
    addGoods(r.items, item, -1);
    addGoods(o.items, item, 1);
    if (!eat(w, o, { verb: 'eat', item }).ok) {
      addGoods(o.items, item, -1);
      addGoods(r.items, item, 1);
      continue;
    }
    served.push(o);
    w.notify(o.id, `${r.name} serves you ${ITEMS[item].one}, and you eat it with them.`);
  }
  if (!served.length) return no("There's nobody hungry of yours here to share it with.");
  const names = served.map((o) => o.name);
  w.emit({ type: 'shared_meal', who: r.id, with: served.map((o) => o.id), item });
  return ok(`You share the ${item}: ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`} ${served.length === 1 ? 'eats' : 'eat'} with you.`);
}

/** Today's money given to someone, as the giver remembers it, or nothing if anything came back. */
function tally(w: World, r: Resident, toId: string): { cents: number } | null {
  const g = r.given[toId];
  return g && g.day === dayIndex(w.t) && !g.got && g.cents > 0 ? g : null;
}

/** Money r gave `toId` just now. */
export function noteGift(w: World, r: Resident, toId: string, cents: number): void {
  const today = dayIndex(w.t);
  const g = r.given[toId];
  r.given[toId] = g && g.day === today ? { ...g, cents: g.cents + cents } : { day: today, cents, got: false };
}

/** r had something from `fromId` (a gift, or a sale): money given them today no longer went for nothing. */
export function noteReceived(w: World, r: Resident, fromId: string): void {
  const g = r.given[fromId];
  if (g && g.day === dayIndex(w.t)) g.got = true;
}

/** "Today you've given Mdm Tan $6.55 and had nothing back.", or null. */
export function givenLine(w: World, r: Resident, o: Resident): string | null {
  const g = tally(w, r, o.id);
  return g ? `Today you've given ${o.name} ${formatMoney(g.cents)} and had nothing back.` : null;
}

/** The lines for everyone r is with now. */
export function givenLines(w: World, r: Resident): string[] {
  return w.nearby(r).map((o) => givenLine(w, r, o)).filter((l): l is string => l !== null);
}
