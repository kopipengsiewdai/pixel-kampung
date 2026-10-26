/**
 * More to do each day (docs/design/daily-life.md C): chores that take a
 * while (fetching water, mending nets, sweeping), helping a neighbour, and
 * paid errands between residents. No AI and no cost: a chore runs in the
 * tick with no thinking until it's done.
 */
import { quantityLabel, type ItemId } from '../items.ts';
import { formatMoney, type Cents } from '../money.ts';
import { addGoods, countGoods, type ChoreKind, type Errand, type Resident, type World } from '../state.ts';
import { dayIndex, MINUTES_PER_DAY, SGT_OFFSET_MIN } from '../time.ts';
import { type ActionResult, type Intent, itemOf, moneyOf, no, ok, personNearby, quoted, textOf } from './common.ts';
import { addDebt } from './debts.ts';
import { waterBed } from './everyone.ts';
import { practise, skillLevel } from '../skills.ts';
import { TRAVELLER_PAYS } from '../travellers.ts';

/** How long each chore takes, in game minutes. */
export const CHORE_MINUTES: Record<ChoreKind, number> = { fetch_water: 10, mend_nets: 30, sweep: 15, cast_net: 45, gather_wood: 20, forage: 30 };
/** Forages a day each (subsistence.md Q1): a meal or two, not a living. */
export const FORAGES_A_DAY = 2;
/** Mended nets bring one more fish on this many catches, the same day. */
export const MENDED_CATCHES = 3;
/** An errand asked lapses unanswered after this many minutes. */
export const ERRAND_OFFER_MINUTES = 30;

/** What someone at a chore is doing, as others see it (and the watch page). */
export const CHORE_DOING: Record<ChoreKind, string> = { fetch_water: 'fetching water', mend_nets: 'mending nets', sweep: 'sweeping', cast_net: 'casting a net', gather_wood: 'gathering firewood', forage: 'foraging' };

/** What they're told if they try something else meanwhile. */
export function busyAt(chore: ChoreKind): string {
  return { fetch_water: "You're fetching water.", mend_nets: "You're mending nets.", sweep: "You're sweeping.", cast_net: "You're casting your net.", gather_wood: "You're gathering firewood.", forage: "You're looking for something to eat." }[chore];
}

/** The start of the next day: when a taken errand lapses. */
function endOfDay(t: number): number {
  return (dayIndex(t) + 1) * MINUTES_PER_DAY - SGT_OFFSET_MIN;
}

function start(w: World, r: Resident, chore: ChoreKind, shopId: string | null, forId: string | null): void {
  const a = r.activity;
  const shift = a?.kind === 'working' ? { jobId: a.jobId, until: a.until, worked: a.worked } : null;
  r.activity = { kind: 'chore', chore, until: w.t + CHORE_MINUTES[chore], shopId, forId, shift };
}

export function fetchWater(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'well')) return no('You need to be at the well to fetch water.');
  start(w, r, 'fetch_water', null, null);
  return ok('You let the pail down into the well.');
}

export function gatherFirewood(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'farm')) return no('The fallen wood is out past the farm plot.');
  start(w, r, 'gather_wood', null, null);
  return ok('You go out past the farm plot to pick up fallen branches.');
}

/** Foraging (subsistence.md Q1): wild kangkong or bananas past the farm plot, a coconut off the jetty's palms. */
export function forage(w: World, r: Resident): ActionResult {
  const farm = w.isAt(r, 'farm');
  if (!farm && !w.isAt(r, 'jetty')) return no("There's nothing to be found to eat here.");
  if (r.foraged?.day === dayIndex(w.t) && r.foraged.n >= FORAGES_A_DAY) return no("You've already picked over what there is to be had today.");
  start(w, r, 'forage', null, null);
  return ok(farm ? 'You go along the ditches past the farm plot, looking for wild kangkong and bananas.' : 'You go up to the palms behind the jetty, looking for a coconut within reach.');
}

export function mendNets(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'jetty')) return no('Your nets are down at the jetty.');
  if (r.mended && r.mended.day === dayIndex(w.t) && r.mended.left > 0) return no('Your nets are already mended.');
  start(w, r, 'mend_nets', null, null);
  return ok('You sit down on the jetty and start mending your nets.');
}

/** Nets mended today, with a catch or more left in them. */
export function netsMended(w: World, r: Resident): boolean {
  return !!r.mended && r.mended.day === dayIndex(w.t) && r.mended.left > 0;
}

/** A Skilled fisher's net, thrown from the jetty: 45 minutes, 0–4 fish, and one of the mended nets' catches (skills.md S2). */
export function castNet(w: World, r: Resident): ActionResult {
  if (!w.isAt(r, 'jetty')) return no('You can only cast a net from the jetty.');
  if (skillLevel(r, 'fishing') < 3) return no("You've never got the hang of throwing a net.");
  if (!netsMended(w, r)) return no('Your nets need mending before you can cast them.');
  r.mended!.left -= 1;
  start(w, r, 'cast_net', null, null);
  return ok('You gather the net and throw it out over the water.');
}

/** What a cast net brings in: 0–4 fish, about 2.25 on average. */
const NET_CATCH = [0.1, 0.3, 0.55, 0.8];

/** The shop r can sweep where they stand: their own, or the one they're on shift at. */
export function sweepable(w: World, r: Resident): string | null {
  const own = w.shopOf(r.id);
  if (own && w.isAt(r, own.id)) return own.id;
  const a = r.activity;
  if (a?.kind === 'working') return w.state.jobs.find((j) => j.id === a.jobId)?.placeId ?? null;
  return null;
}

export function sweep(w: World, r: Resident): ActionResult {
  const shopId = sweepable(w, r);
  if (!shopId) return no(w.placeOf(r) && w.shop(w.placeOf(r)!.id) ? "This shop isn't yours to sweep." : "There's no shop of yours here to sweep.");
  if (w.shop(shopId)!.sweptDay === dayIndex(w.t)) return no("You've swept it today already.");
  start(w, r, 'sweep', shopId, null);
  return ok('You fetch the broom and start sweeping.');
}

/** Someone r can help here: their dry beds at the farm, or their nets at the jetty. */
export function canHelp(w: World, r: Resident, o: Resident): 'beds' | 'nets' | null {
  const today = dayIndex(w.t);
  if (w.isAt(r, 'farm') && w.state.beds.some((b) => b.planterId === o.id && b.lastWateredDay !== today)) return 'beds';
  if (w.isAt(r, 'jetty') && w.isNear(r, o) && !(o.mended && o.mended.day === today && o.mended.left > 0)) return 'nets';
  return null;
}

export function help(w: World, r: Resident, i: Intent): ActionResult {
  const o = w.residentByName(i.to, r);
  if (!o || !w.knowsPerson(r, o.id)) return no(`You don't know anyone called ${quoted(i.to)}.`);
  if (o.id === r.id) return no("That's you.");
  const what = canHelp(w, r, o);
  if (!what) return no(`There's nothing to help with for ${o.name} here.`);
  if (what === 'nets') {
    start(w, r, 'mend_nets', null, o.id);
    return ok(`You sit down with ${o.name} and start mending the nets.`);
  }
  const today = dayIndex(w.t);
  const dry = w.state.beds.filter((b) => b.planterId === o.id && b.lastWateredDay !== today);
  for (const b of dry) waterBed(w, b);
  practise(w, r, 'farming', dry.length);
  w.emit({ type: 'helped', who: r.id, to: o.id, how: 'beds' });
  w.notify(o.id, `${r.name} waters your beds for you.`);
  return ok(`You water ${o.name}'s beds.`);
}

/** A chore done: what it gives, and back to the shift if it was taken in one. */
export function finishChore(w: World, r: Resident): void {
  const a = r.activity;
  if (a?.kind !== 'chore') return;
  const today = dayIndex(w.t);
  r.activity = a.shift ? { kind: 'working', jobId: a.shift.jobId, until: a.shift.until, worked: a.shift.worked } : null;
  r.thinkAt = Math.min(r.thinkAt, w.t);
  if (a.chore === 'fetch_water') {
    addGoods(r.items, 'water', 1);
    w.emit({ type: 'chore_done', who: r.id, chore: a.chore, for: null });
    w.remember(r.id, 'You draw up a pail of water.');
  } else if (a.chore === 'gather_wood') {
    addGoods(r.items, 'firewood', 1);
    w.emit({ type: 'chore_done', who: r.id, chore: a.chore, for: null });
    w.remember(r.id, 'You tie up a bundle of firewood.');
  } else if (a.chore === 'forage') {
    const item: ItemId = w.isAt(r, 'jetty') ? 'coconut' : w.rng.next() < 0.5 ? 'vegetables' : 'banana';
    addGoods(r.items, item, 1);
    r.foraged = { day: today, n: (r.foraged?.day === today ? r.foraged.n : 0) + 1 };
    w.emit({ type: 'foraged', who: r.id, item });
    w.remember(r.id, item === 'coconut' ? 'You knock down a coconut.' : item === 'banana' ? 'You find a hand of bananas.' : 'You pick a bunch of wild kangkong.');
  } else if (a.chore === 'mend_nets') {
    const owner = a.forId ? w.resident(a.forId) : r;
    owner.mended = { day: today, left: MENDED_CATCHES };
    w.emit({ type: 'chore_done', who: r.id, chore: a.chore, for: a.forId });
    if (a.forId) {
      w.notify(a.forId, `${r.name} mends your nets for you.`);
      w.remember(r.id, `You mend ${owner.name}'s nets.`);
    } else w.remember(r.id, 'Your nets are mended.');
  } else if (a.chore === 'cast_net') {
    const roll = w.rng.next();
    const qty = NET_CATCH.filter((p) => roll >= p).length;
    if (qty > 0) addGoods(r.items, 'fish', qty);
    practise(w, r, 'fishing', 2);
    w.emit({ type: 'caught_fish', who: r.id, qty });
    w.remember(r.id, qty ? `You haul in the net: ${quantityLabel('fish', qty)}.` : 'You haul in the net: nothing in it.');
  } else if (a.shopId) {
    const shop = w.shop(a.shopId);
    if (shop) shop.sweptDay = today;
    w.emit({ type: 'chore_done', who: r.id, chore: a.chore, for: null });
    w.remember(r.id, 'The shop is swept clean.');
  }
}

/** One minute of a chore: a held shift counts the minute as worked, until the shift's end. */
export function choreMinute(w: World, r: Resident): void {
  const a = r.activity;
  if (a?.kind !== 'chore') return;
  if (a.shift && w.t < a.shift.until) a.shift.worked += 1;
  if (w.t >= a.until) finishChore(w, r);
}

const ERRAND_HINT = 'An errand is "fetch water", or "take something to someone".';

/** "fetch water" / "take a fish to Mdm Tan": what's being asked, or why it can't be. */
function errandOf(w: World, r: Resident, words: string | null): { kind: 'water' | 'take'; item: ItemId | null; to: Resident | null } | string {
  if (!words) return ERRAND_HINT;
  const s = words.toLowerCase().replace(/[.!]+$/, '').trim();
  if (/^(fetch|get|bring)( me)?( (a|some))?( pails? of)? water\b/.test(s)) return { kind: 'water', item: null, to: null };
  const m = /^take (.+?) to (.+)$/.exec(s);
  if (!m) return ERRAND_HINT;
  const item = itemOf(m[1]!.replace(/^(a|an|the|some|my)\s+/, ''));
  if (!item) return `You don't have anything called ${quoted(m[1])}.`;
  const to = w.residentByName(m[2], r);
  if (!to || !w.knowsPerson(r, to.id)) return `You don't know anyone called ${quoted(m[2])}.`;
  return { kind: 'take', item, to };
}

function errandLabel(w: World, e: { kind: 'water' | 'take'; item: ItemId | null; toId: string | null }): string {
  return e.kind === 'water' ? 'fetch water' : `take ${quantityLabel(e.item!, 1)} to ${w.resident(e.toId!).name}`;
}

export function askErrand(w: World, r: Resident, i: Intent): ActionResult {
  const o = personNearby(w, r, i.to);
  if (typeof o === 'string') return no(o);
  const what = errandOf(w, r, textOf(i.text));
  if (typeof what === 'string') return no(what);
  if (what.kind === 'take' && countGoods(r.items, what.item!) < 1) return no(`You don't have ${quantityLabel(what.item!, 1)}.`);
  if (i.money === undefined || i.money === null || i.money === '') return no('How much will you pay for it?');
  const cents = moneyOf(i.money);
  if (cents === null || cents === 0) return no("That doesn't sound like money.");
  w.state.errands = w.state.errands.filter((e) => e.taken || !(e.askerId === r.id && e.runnerId === o.id));
  const errand: Errand = { id: w.nextId(), askerId: r.id, runnerId: o.id, kind: what.kind, item: what.item, toId: what.to?.id ?? null, cents, taken: false, expires: w.t + ERRAND_OFFER_MINUTES };
  w.state.errands.push(errand);
  const label = errandLabel(w, errand);
  w.emit({ type: 'errand_asked', who: r.id, to: o.id, what: label, cents });
  w.notify(o.id, `${r.name} asks you to ${label}, for ${formatMoney(cents)}.`);
  return ok(`You ask ${o.name} to ${label}, for ${formatMoney(cents)}.`);
}

/** The errand someone named has asked r to run, not yet taken up. */
export function errandFrom(w: World, r: Resident, from: unknown): Errand | null {
  const o = w.residentByName(from, r);
  return o ? w.state.errands.find((e) => !e.taken && e.askerId === o.id && e.runnerId === r.id) ?? null : null;
}

export function describeErrand(w: World, e: Errand): string {
  return `asked you to ${errandLabel(w, e)}, for ${formatMoney(e.cents)}`;
}

export function takeErrand(w: World, r: Resident, e: Errand): ActionResult {
  const asker = w.resident(e.askerId);
  const near = personNearby(w, r, asker.name);
  if (typeof near === 'string') return no(near);
  if (e.kind === 'take') {
    // The thing changes hands as the errand is taken up.
    if (countGoods(asker.items, e.item!) < 1) return no(`${asker.name} doesn't have ${quantityLabel(e.item!, 1)} any more.`);
    addGoods(asker.items, e.item!, -1);
    addGoods(r.items, e.item!, 1);
  }
  e.taken = true;
  e.expires = endOfDay(w.t);
  w.emit({ type: 'errand_taken', who: r.id, from: asker.id });
  w.notify(asker.id, `${r.name} will ${errandLabel(w, e)} for you, for ${formatMoney(e.cents)}.`);
  return ok(`You'll ${errandLabel(w, e)} for ${asker.name}, for ${formatMoney(e.cents)}.`);
}

export function refuseErrand(w: World, r: Resident, e: Errand): ActionResult {
  const asker = w.resident(e.askerId);
  w.state.errands = w.state.errands.filter((x) => x.id !== e.id);
  w.emit({ type: 'errand_refused', who: r.id, from: asker.id });
  w.notify(asker.id, `${r.name} won't run your errand.`);
  return ok(`You tell ${asker.name} you won't do it.`);
}

/** Something handed over: if it finishes an errand r is running, the pay moves (or becomes a debt); handed back to the asker, the errand's off. */
export function handedOver(w: World, r: Resident, to: Resident, item: ItemId): void {
  const back = w.state.errands.find((x) => x.taken && x.runnerId === r.id && x.kind === 'take' && x.item === item && x.askerId === to.id);
  if (back) {
    w.state.errands = w.state.errands.filter((x) => x.id !== back.id);
    w.notify(to.id, `${r.name} hands back the ${item}: the errand's off.`);
    w.remember(r.id, `You hand ${to.name} back the ${item}: the errand's off.`);
    return;
  }
  const e = w.state.errands.find((x) => x.taken && x.runnerId === r.id
    && ((x.kind === 'water' && item === 'water' && x.askerId === to.id) || (x.kind === 'take' && x.item === item && x.toId === to.id)));
  if (!e) return;
  w.state.errands = w.state.errands.filter((x) => x.id !== e.id);
  const asker = w.resident(e.askerId);
  const paid = asker.money >= e.cents;
  if (paid) {
    w.transfer(asker.id, r.id, e.cents, 'errand');
    w.notify(r.id, `${asker.name} pays you ${formatMoney(e.cents)} for the errand.`);
    w.notify(asker.id, `You pay ${r.name} ${formatMoney(e.cents)} for the errand.`);
  } else {
    // Both agreed when it was taken: what can't be paid is owed.
    addDebt(w, asker.id, r.id, 'iou', e.cents, 'for the errand');
    w.notify(r.id, `${asker.name} couldn't pay, so owes you ${formatMoney(e.cents)}.`);
    w.notify(asker.id, `You couldn't pay ${r.name} for the errand, so you owe ${formatMoney(e.cents)}.`);
  }
  w.emit({ type: 'errand_done', who: r.id, for: asker.id, cents: e.cents, paid });
}

/** Errands that lapse: asked and unanswered, or taken and not done by the day's end. */
export function lapseErrands(w: World): void {
  const keep: Errand[] = [];
  for (const e of w.state.errands) {
    if (e.expires > w.t) {
      keep.push(e);
      continue;
    }
    if (e.taken) {
      const asker = w.resident(e.askerId);
      const runner = w.resident(e.runnerId);
      w.notify(e.runnerId, `The errand for ${asker.name} came to nothing.`);
      w.notify(e.askerId, `${runner.name} never did your errand.`);
      if (e.kind === 'take') returnTaken(w, e, asker, runner);
    }
  }
  w.state.errands = keep;
}

/** A "take" errand that came to nothing: the thing goes back to the asker, or, gone, is owed for at what travellers pay. */
function returnTaken(w: World, e: Errand, asker: Resident, runner: Resident): void {
  const item = e.item!;
  if (countGoods(runner.items, item) > 0) {
    addGoods(runner.items, item, -1);
    addGoods(asker.items, item, 1);
    w.notify(runner.id, `You give ${asker.name} back the ${item}.`);
    w.notify(asker.id, `${runner.name} gives you back the ${item}.`);
    return;
  }
  const cents = TRAVELLER_PAYS[item] ?? 0;
  if (cents <= 0) return;
  addDebt(w, runner.id, asker.id, 'iou', cents, `for the ${item}`);
  w.notify(runner.id, `You no longer have ${asker.name}'s ${item}, so you owe ${asker.name} ${formatMoney(cents)}.`);
  w.notify(asker.id, `${runner.name} no longer has your ${item}, so owes you ${formatMoney(cents)}.`);
}

/** What r sees of errands: those they're running, those asked of them, and those they asked. */
export function errandLines(w: World, r: Resident): string[] {
  const out: string[] = [];
  for (const e of w.state.errands) {
    const asker = w.resident(e.askerId);
    const runner = w.resident(e.runnerId);
    const pay = formatMoney(e.cents);
    if (e.runnerId === r.id && e.taken) {
      out.push(e.kind === 'water' ? `You're fetching water for ${asker.name}, for ${pay}.` : `You're taking ${quantityLabel(e.item!, 1)} to ${w.resident(e.toId!).name} for ${asker.name}, for ${pay}.`);
    } else if (e.runnerId === r.id) out.push(`${asker.name} asks you to ${errandLabel(w, e)}, for ${pay}.`);
    else if (e.askerId === r.id && e.taken) out.push(`${runner.name} is running your errand, for ${pay}.`);
  }
  return out;
}
