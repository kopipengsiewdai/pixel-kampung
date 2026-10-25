/**
 * What the village head lets (docs/design/households.md §5): empty houses and
 * the stalls by the wet market. Rent goes into the village fund. He collects
 * on his Monday round; a week missed is owed, and if it's still owed at the
 * next round he takes the place back. Family homes are never his to take.
 * All scripted: none of this needs his AI.
 */
import { addGoods, type Lease, type Resident, type World } from '../sim/state.ts';
import { endShift } from '../sim/activities.ts';
import { rehome } from '../sim/households.ts';
import { distance, PLACE_BY_ID, type Point } from '../sim/map.ts';
import { formatMoney, type Cents } from '../sim/money.ts';
import { weekdayAt, dateOfDay, MONTHS, WEEKDAYS } from '../sim/calendar.ts';
import { dayIndex } from '../sim/time.ts';
import { FUND_ID } from './village.ts';

export const HOUSE_RENT: Cents = 150;
export const STALL_RENT: Cents = 300;
export const STALL_DEPOSIT: Cents = 500;
/** The most weeks of rent that can be paid ahead. */
export const AHEAD_WEEKS = 4;
/** Days a stall stays open to asking before he chooses, and days the one chosen has to come and pay. */
export const ASK_DAYS = 3;
export const OFFER_DAYS = 2;
/** How near a tenant must be to his stop to pay him on the round. */
export const PAY_TILES = 3;
export const STALL_IDS = ['stall-1', 'stall-2'] as const;

const placeName = (w: World, id: string) => w.placeName(PLACE_BY_ID.get(id)!);

export function isStall(placeId: string): boolean {
  return PLACE_BY_ID.get(placeId)?.kind === 'stall';
}

export function rentOf(w: World, placeId: string): Cents {
  return w.state.rents[placeId] ?? (isStall(placeId) ? STALL_RENT : HOUSE_RENT);
}

export function leaseOf(w: World, placeId: string): Lease | null {
  return w.state.leases.find((l) => l.placeId === placeId) ?? null;
}

export function leasesOf(w: World, r: Resident): Lease[] {
  return w.state.leases.filter((l) => l.tenantId === r.id);
}

/** The first Monday on or after day index `day`, by the kampung's week. */
export function mondayAfter(w: World, day: number): number {
  const n = ((day - w.state.calendar.firstDay) % 7 + 7) % 7;
  return n === 0 ? day : day + (7 - n);
}

/** "Monday 15 January", for a day index. */
export function dayLabel(w: World, day: number): string {
  const d = dateOfDay(day - w.state.calendar.firstDay);
  return `${WEEKDAYS[((day - w.state.calendar.firstDay) % 7 + 7) % 7]} ${d.day} ${MONTHS[d.month - 1]}`;
}

/** Houses standing empty and stalls nobody rents: what he has to let. */
export function toLet(w: World): { houses: string[]; stalls: string[] } {
  return {
    houses: w.state.houses.filter((h) => h.holderId === null && !leaseOf(w, h.id)).map((h) => h.id),
    stalls: STALL_IDS.filter((id) => !leaseOf(w, id)),
  };
}

/** Where on his round he calls for a lease's rent: the tenant's home door, or for a stall tenant with none, the stall. */
export function stopOf(w: World, lease: Lease): Point {
  const tenant = w.resident(lease.tenantId);
  const at = tenant.homeId ?? lease.placeId;
  return { ...PLACE_BY_ID.get(at)!.spot };
}

/** Takes rent into the fund. */
function payIn(w: World, r: Resident, cents: Cents, placeId: string, what: string): void {
  w.transfer(r.id, FUND_ID, cents, `${what} for ${placeName(w, placeId)}`);
}

/** A house to let becomes theirs to live in, a week in hand. */
export function takeHouse(w: World, r: Resident, placeId: string): void {
  const rent = rentOf(w, placeId);
  payIn(w, r, rent, placeId, 'rent');
  w.state.leases.push({ placeId, tenantId: r.id, rent, deposit: 0, paidUntil: mondayAfter(w, dayIndex(w.t) + 4), owed: 0, excused: false });
  w.state.houses.find((h) => h.id === placeId)!.holderId = r.id;
  r.homeId = placeId;
  w.learnPlace(r, placeId);
  w.emit({ type: 'let', who: r.id, place: placeId, rent, deposit: 0 });
}

/** A stall becomes theirs to trade from: a deposit and a week's rent paid. */
export function takeStall(w: World, r: Resident, placeId: string): void {
  const rent = rentOf(w, placeId);
  payIn(w, r, STALL_DEPOSIT, placeId, 'deposit');
  w.state.fund.depositsHeld += STALL_DEPOSIT;
  payIn(w, r, rent, placeId, 'rent');
  w.state.leases.push({ placeId, tenantId: r.id, rent, deposit: STALL_DEPOSIT, paidUntil: mondayAfter(w, dayIndex(w.t) + 4), owed: 0, excused: false });
  w.state.shops.push({ id: placeId, ownerId: r.id, stock: {}, sellPrices: {}, buyPrices: {}, buyLimits: {} });
  w.state.stallCalls = w.state.stallCalls.filter((c) => c.placeId !== placeId);
  // One stall each: any other they asked for passes on.
  for (const c of w.state.stallCalls) {
    c.applicants = c.applicants.filter((id) => id !== r.id);
    if (c.offeredTo === r.id) {
      c.offeredTo = null;
      c.offerUntil = null;
    }
  }
  r.role = 'owner';
  w.learnPlace(r, placeId);
  w.emit({ type: 'let', who: r.id, place: placeId, rent, deposit: STALL_DEPOSIT });
}

/** The place goes back to the village head: handed back, or taken back for rent unpaid. */
export function takeBack(w: World, lease: Lease, why: 'handed' | 'unpaid'): void {
  const tenant = w.resident(lease.tenantId);
  w.state.leases = w.state.leases.filter((l) => l !== lease);
  const name = placeName(w, lease.placeId);
  if (isStall(lease.placeId)) {
    const shop = w.state.shops.find((s) => s.id === lease.placeId);
    if (shop) {
      for (const [item, n] of Object.entries(shop.stock)) if (n) addGoods(tenant.items, item as never, n);
      w.state.shops = w.state.shops.filter((s) => s !== shop);
    }
    for (const job of w.state.jobs.filter((j) => j.placeId === lease.placeId)) {
      const worker = w.resident(job.workerId);
      if (worker.activity?.kind === 'working' && worker.activity.jobId === job.id) endShift(w, worker);
      w.notify(worker.id, `The ${PLACE_BY_ID.get(lease.placeId)!.name.replace(/^the /, '')} has closed. You no longer work there.`);
    }
    w.state.jobs = w.state.jobs.filter((j) => j.placeId !== lease.placeId);
    if (!w.shopOf(tenant.id)) {
      tenant.role = 'seeker';
      w.state.jobOffers = w.state.jobOffers.filter((o) => o.employerId !== tenant.id);
    }
    // The deposit settles what's owed; the rest comes back.
    w.state.fund.depositsHeld -= lease.deposit;
    const refund = lease.deposit - Math.min(lease.deposit, lease.owed);
    if (refund > 0) w.transfer(FUND_ID, tenant.id, refund, `deposit back for ${name}`);
    w.state.stallCalls.push({ placeId: lease.placeId, opened: dayIndex(w.t), applicants: [], offeredTo: null, offerUntil: null });
  } else {
    const house = w.state.houses.find((h) => h.id === lease.placeId)!;
    house.holderId = null;
    w.state.homeOffers = w.state.homeOffers.filter((o) => o.houseId !== lease.placeId);
    for (const r of w.state.residents.filter((x) => x.homeId === lease.placeId)) {
      rehome(w, r);
      if (r.id !== tenant.id) w.notify(r.id, `${name} has gone back to Mr Lim. ${r.homeId ? `You go back to ${w.placeName(w.home(r)!)}.` : "You've nowhere to sleep tonight."}`);
    }
  }
  w.notify(tenant.id, why === 'unpaid'
    ? `Mr Lim has taken ${name} back for the rent you didn't pay.`
    : `You've handed ${name} back to Mr Lim.`);
  w.emit({ type: why === 'unpaid' ? 'taken_back' : 'handed_back', who: tenant.id, place: lease.placeId });
}

/**
 * His call for the rent, at the stop for these leases (Monday round). A tenant
 * near his stop, awake and with the money pays; otherwise this week is owed.
 * A week still owed from the last round, and not paid now, loses the place.
 */
export function rentRound(w: World, leases: readonly Lease[]): void {
  const today = dayIndex(w.t);
  for (const lease of [...leases]) {
    if (!w.state.leases.includes(lease) || lease.paidUntil > today) continue;
    const r = w.resident(lease.tenantId);
    const name = placeName(w, lease.placeId);
    const here = distance(r.pos, stopOf(w, lease)) <= PAY_TILES && !w.isAsleep(r);
    const due = lease.owed + lease.rent;
    if (here && r.money >= due) {
      payIn(w, r, due, lease.placeId, 'rent');
      lease.owed = 0;
      lease.paidUntil = today + 7;
      w.notify(r.id, `Mr Lim came by for the rent; you paid him ${formatMoney(due)} for ${name}.`);
      w.emit({ type: 'rent_paid', who: r.id, place: lease.placeId, cents: due });
    } else if (lease.owed > 0 && !lease.excused) {
      takeBack(w, lease, 'unpaid');
    } else {
      // A first miss; or a second when the grace week was lost to the town being stopped, which carries over.
      lease.owed += lease.rent;
      lease.excused = false;
      lease.paidUntil = today + 7;
      w.notify(r.id, here
        ? `Mr Lim came by for the rent, and you couldn't pay. You owe him ${formatMoney(lease.owed)} for ${name} by next Monday.`
        : `Mr Lim called for the rent and found you out. You owe him ${formatMoney(lease.owed)} for ${name} by next Monday.`);
      w.emit({ type: 'rent_missed', who: r.id, place: lease.placeId, cents: lease.rent });
    }
  }
}

/** Paying at his door: anything owed first, then weeks ahead (up to four in hand). Null if paid, else why not. */
export function payAtDoor(w: World, r: Resident, lease: Lease, weeks: number): string | null {
  const today = dayIndex(w.t);
  // A round missed while the town was stopped is owed nothing: paying starts from this week.
  if (lease.paidUntil <= today) lease.paidUntil = mondayAfter(w, today + 1) - 7;
  const ahead = Math.max(0, Math.round((lease.paidUntil - today) / 7));
  const take = lease.owed > 0 ? Math.max(0, weeks - 1) : weeks;
  if (ahead + take > AHEAD_WEEKS) return `You've already paid up to ${dayLabel(w, lease.paidUntil)}. Mr Lim won't take more ahead than that.`;
  const due = lease.owed + take * lease.rent;
  if (r.money < due) return `That would be ${formatMoney(due)}. You only have ${formatMoney(r.money)}.`;
  payIn(w, r, due, lease.placeId, 'rent');
  lease.owed = 0;
  lease.paidUntil += take * 7;
  w.emit({ type: 'rent_paid', who: r.id, place: lease.placeId, cents: due });
  return null;
}

/** Each morning at 09:00: stalls whose asking time is over go to the earliest who asked and has no business; an offer not taken up passes on. */
export function chooseStallTenants(w: World): void {
  const today = dayIndex(w.t);
  for (const call of w.state.stallCalls) {
    if (call.offeredTo && call.offerUntil !== null && today > call.offerUntil) {
      call.applicants = call.applicants.filter((id) => id !== call.offeredTo);
      call.offeredTo = null;
      call.offerUntil = null;
    }
    if (call.offeredTo || today < call.opened + ASK_DAYS) continue;
    const next = call.applicants.map((id) => w.resident(id)).find((r) => !w.shopOf(r.id));
    if (!next) continue;
    call.offeredTo = next.id;
    call.offerUntil = today + OFFER_DAYS;
    w.notify(next.id, `Mr Lim sends word: ${placeName(w, call.placeId)} is yours if you come to his house and pay by ${dayLabel(w, call.offerUntil)}: ${formatMoney(STALL_DEPOSIT)} down and ${formatMoney(rentOf(w, call.placeId))} a week.`);
    w.emit({ type: 'stall_offered', who: next.id, place: call.placeId });
  }
}

/** His notice: what he has to let and where to find him. In-world, and never a rule. */
export function letNotice(w: World): string | null {
  const { houses, stalls } = toLet(w);
  if (!houses.length && !stalls.length) return null;
  const parts: string[] = [];
  if (houses.length) parts.push(`${houses.map((id) => placeName(w, id)).join(' and ')}, ${formatMoney(HOUSE_RENT)} a week`);
  for (const id of stalls) {
    const call = w.state.stallCalls.find((c) => c.placeId === id);
    const by = call ? `; ask by ${WEEKDAYS[((call.opened + ASK_DAYS - 1 - w.state.calendar.firstDay) % 7 + 7) % 7]}` : '';
    parts.push(`${placeName(w, id)}, ${formatMoney(rentOf(w, id))} a week and ${formatMoney(STALL_DEPOSIT)} down${by}`);
  }
  return `To let: ${parts.join('; ')}. Come to my house at the top of the path, mornings and afternoons. Lim, village head.`;
}

/** Whether a weekday rule says today is his rent day. */
export function isRentDay(w: World): boolean {
  return weekdayAt(w.state, w.t) === 'Monday';
}
