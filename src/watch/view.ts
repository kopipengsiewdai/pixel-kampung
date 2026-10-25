/**
 * Turns the live world into what the watch page draws: the layout once, then
 * a frame each minute. Owner's view only (real numbers, ids, everyone at
 * once); nothing here ever goes into a resident's prompt.
 */
import { isRipe, isStaffed, shiftLabel } from '../sim/actions/everyone.ts';
import { quantityLabel, type ItemId } from '../sim/items.ts';
import { MAP_H, MAP_W, PLACES, PLACE_BY_ID, tileAt, type Point, type Tile } from '../sim/map.ts';
import { formatMoney, type Cents } from '../sim/money.ts';
import { energyWord, hungerWord } from '../sim/perception.ts';
import type { Goods, Resident, Shop, World } from '../sim/state.ts';
import { dateAt, MONTHS } from '../sim/calendar.ts';
import { shortStamp } from '../sim/calendar.ts';
import { dayIndex, minuteOfDay, sgtHour, sgtMinute } from '../sim/time.ts';
import type { Card, Carried, Frame, Layout, ResidentView, ShopView, Thought } from './types.ts';

export function layoutOf(w: World): Layout {
  const tiles: Tile[][] = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => tileAt(x, y)!));
  const places = PLACES.map((p) => ({ id: p.id, kind: p.kind, name: w.placeName(p), rect: { ...p.rect }, spot: { ...p.spot } }));
  return { w: MAP_W, h: MAP_H, tiles, places };
}

/** "Monday 1 January, Year 0, 07:05": the kampung's date and time, as residents know it. */
export function clockLabel(w: World): string {
  const t = w.t;
  const d = dateAt(w.state, t);
  const hhmm = `${String(sgtHour(t)).padStart(2, '0')}:${String(sgtMinute(t)).padStart(2, '0')}`;
  return `${d.weekday} ${d.day} ${MONTHS[d.month - 1]}, Year ${d.year}, ${hhmm}`;
}

function carried(g: Goods): Carried[] {
  return (Object.entries(g) as [ItemId, number][])
    .filter(([, n]) => n > 0)
    .map(([item, qty]) => ({ item, qty, label: quantityLabel(item, qty) }));
}

function placeName(id: string | null | undefined, w: World): string | null {
  const p = id ? PLACE_BY_ID.get(id) : undefined;
  return p ? w.placeName(p) : null;
}

function doing(w: World, r: Resident): string {
  const a = r.activity;
  switch (a?.kind) {
    case 'walking':
      if (a.thenSleep) return 'heading home to sleep';
      return a.dest ? `walking to ${placeName(a.dest, w)}` : 'walking';
    case 'fishing': return 'fishing off the jetty';
    case 'working': {
      const job = w.state.jobs.find((j) => j.id === a.jobId);
      return job ? `on shift at ${placeName(job.placeId, w)}` : 'working';
    }
    case 'sleeping':
      return a.reason === 'night' ? 'asleep' : a.reason === 'nap' ? 'napping' : 'dozed off where they stood, worn out';
    default: {
      const own = w.shopOf(r.id);
      if (own && w.isAt(r, own.id)) return 'minding the shop';
      const here = w.placeOf(r);
      if (!here) return 'standing about on the footpath';
      return here.id === r.homeId ? 'at home' : `at ${w.placeName(here)}`;
    }
  }
}

function jobLine(w: World, r: Resident): string | null {
  const own = w.shopOf(r.id);
  if (own) return `Runs ${PLACE_BY_ID.get(own.id)!.name}`;
  const job = w.jobOf(r.id);
  if (!job) return null;
  return `Works at ${PLACE_BY_ID.get(job.placeId)!.name} for ${w.resident(job.employerId).name}, ${shiftLabel(job.startHour, job.hours)}, ${formatMoney(job.wage)} a shift`;
}

function shopView(w: World, s: Shop): ShopView {
  const tag = (item: string, c: Cents) => `${item} ${formatMoney(c)}`;
  return {
    id: s.id,
    name: PLACE_BY_ID.get(s.id)!.name,
    ownerId: s.ownerId,
    stock: carried(s.stock),
    sells: (Object.entries(s.sellPrices) as [ItemId, Cents][]).map(([i, c]) => tag(i, c)),
    buys: (Object.entries(s.buyPrices) as [ItemId, Cents][]).map(([i, c]) => {
      const left = s.buyLimits[i];
      return left === undefined ? tag(i, c) : `${tag(i, c)} (up to ${left} more)`;
    }),
    staffed: isStaffed(w, s),
  };
}

/**
 * Builds a frame a minute. It remembers each walker's remaining path, so the
 * next frame can say which tiles they stepped through and the page can walk
 * them along the footpaths instead of cutting corners.
 */
export class FrameBuilder {
  private paths = new Map<string, Point[]>();

  build(w: World): Frame {
    const t = w.t;
    const today = dayIndex(t);
    const residents = w.state.residents.map((r): ResidentView => {
      const pos = { x: r.pos.x, y: r.pos.y };
      const before = this.paths.get(r.id);
      const i = before ? before.findIndex((p) => p.x === pos.x && p.y === pos.y) : -1;
      const route = i >= 0 ? before!.slice(0, i + 1) : [pos];
      const a = r.activity;
      if (a?.kind === 'walking') this.paths.set(r.id, a.path.map((p) => ({ x: p.x, y: p.y })));
      else this.paths.delete(r.id);
      const here = w.placeOf(r);
      return {
        id: r.id,
        name: r.name,
        role: r.role,
        homeId: r.homeId,
        x: pos.x,
        y: pos.y,
        route,
        activity: a?.kind ?? null,
        sleep: a?.kind === 'sleeping' ? a.reason : null,
        doing: doing(w, r),
        place: here ? w.placeName(here) : null,
        money: r.money,
        hunger: r.hunger,
        energy: r.energy,
        hungerWord: hungerWord(r.hunger),
        energyWord: energyWord(r.energy),
        job: jobLine(w, r),
        carrying: carried(r.items),
      };
    });
    return {
      t,
      stamp: shortStamp(w.state, t),
      clock: clockLabel(w),
      minuteOfDay: minuteOfDay(t),
      lorryHere: w.state.lorryHere,
      residents,
      shops: w.state.shops.map((s) => shopView(w, s)),
      owed: w.state.owed.map((o) => ({ ...o })),
      beds: w.state.beds.map((b) => ({
        n: b.n,
        planted: b.planterId !== null,
        ready: b.planterId !== null && isRipe(w, b),
        wateredToday: b.lastWateredDay === today,
      })),
    };
  }
}

export interface CardExtras {
  plan: Thought | null;
  thoughts: Thought[];
  noticed: Thought[];
  mindNote: string | null;
}

/** The card for one resident: their frame entry, shop and wages, plus what their mind has been thinking. */
export function cardOf(frame: Frame, id: string, extras: CardExtras): Card | null {
  const r = frame.residents.find((x) => x.id === id);
  if (!r) return null;
  const name = (rid: string) => frame.residents.find((x) => x.id === rid)?.name ?? rid;
  const wages = [
    ...frame.owed.filter((o) => o.employerId === id && o.cents > 0).map((o) => `Owes ${name(o.workerId)} ${formatMoney(o.cents)}`),
    ...frame.owed.filter((o) => o.workerId === id && o.cents > 0).map((o) => `Owed ${formatMoney(o.cents)} by ${name(o.employerId)}`),
  ];
  return { ...r, shop: frame.shops.find((s) => s.ownerId === id) ?? null, wages, ...extras };
}
