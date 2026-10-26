/**
 * Turns the live world into what the watch page draws: the layout once, then
 * a frame each minute. Owner's view only (real numbers, ids, everyone at
 * once); nothing here ever goes into a resident's prompt.
 */
import { skillsView } from '../sim/skills.ts';
import { CHORE_DOING } from '../sim/actions/chores.ts';
import { DAYS_TO_GROW, isRipe, isStaffed, shiftLabel } from '../sim/actions/everyone.ts';
import { LORRY_BUYS, LORRY_SELLS, quantityLabel, type ItemId } from '../sim/items.ts';
import { MAP_H, MAP_W, PLACES, PLACE_BY_ID, tileAt, type Point, type Tile } from '../sim/map.ts';
import { formatMoney, type Cents } from '../sim/money.ts';
import { energyWord, hungerWord } from '../sim/perception.ts';
import { GROWN_AGE, type Goods, type Resident, type Shop, type World } from '../sim/state.ts';
import { dateAt, MONTHS, shortStamp } from '../sim/calendar.ts';
import { dayIndex, minuteOfDay, sgtHour, sgtMinute } from '../sim/time.ts';
import type { GameEvent } from '../sim/events.ts';
import type { Card, Carried, Frame, Layout, PlaceCard, ResidentView, ShopView, TalkLine, Thought } from './types.ts';
import { LORRY_ARRIVES, LORRY_LEAVES } from '../sim/tick.ts';

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
    case 'chore': return CHORE_DOING[a.chore];
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
    serving: servingAt(w, s),
    workers: w.state.jobs.filter((j) => j.placeId === s.id).map((j) => j.workerId),
  };
}

/** Who is minding a shop, in plain words: "Ah Huat (the owner)", "Siti (on shift)", or null. */
export function mindingLabel(shop: ShopView, name: (id: string) => string): string | null {
  if (!shop.serving) return null;
  return `${name(shop.serving)} (${shop.serving === shop.ownerId ? 'the owner' : 'on shift'})`;
}

/** Who is serving at a shop right now: the owner if they're minding it, else a worker on shift there. */
function servingAt(w: World, s: Shop): string | null {
  const owner = w.resident(s.ownerId);
  if (w.isAt(owner, s.id) && !w.isAsleep(owner) && owner.activity?.kind !== 'walking') return owner.id;
  const worker = w.state.residents.find((x) => {
    const a = x.activity;
    return a?.kind === 'working' && w.state.jobs.some((j) => j.id === a.jobId && j.placeId === s.id);
  });
  return worker?.id ?? null;
}

/** How long a speech bubble stays up, in game minutes. */
export const BUBBLE_MINUTES = 2;

/** Their own latest line, from what they remember saying, if it was in the last couple of minutes. */
function latestLine(w: World, r: Resident): { t: number; text: string } | null {
  const o = r.recent.findLast((x) => x.talk && x.text.startsWith('You say'));
  if (!o || w.t - o.t > BUBBLE_MINUTES) return null;
  const m = /^You say(?: to [^:]+)?: "([\s\S]*)"$/.exec(o.text);
  return m ? { t: o.t, text: m[1]! } : null;
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
        age: w.ageOf(r),
        child: w.ageOf(r) < GROWN_AGE,
        skills: skillsView(r),
        homeId: r.homeId,
        x: pos.x,
        y: pos.y,
        route,
        activity: a?.kind === 'chore' ? 'working' : a?.kind ?? null,
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
        said: latestLine(w, r),
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
        planter: b.planterId,
        wateredDays: b.wateredDays,
      })),
      notes: w.state.notes.map((n) => ({ authorId: n.authorId, text: n.text, t: n.t, stamp: shortStamp(w.state, n.t) })),
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
  const shop = frame.shops.find((s) => s.ownerId === id) ?? null;
  const plan = extras.plan ? tidyThoughts([extras.plan])[0]! : null;
  return { ...r, shop, minding: shop ? mindingLabel(shop, name) : null, wages, ...extras, plan, thoughts: tidyThoughts(extras.thoughts), noticed: tidyThoughts(extras.noticed) };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function priceList(prices: Partial<Record<ItemId, Cents>>): string[] {
  return (Object.entries(prices) as [ItemId, Cents][]).map(([item, c]) => `${item} ${formatMoney(c)}`);
}

/**
 * The card for one place, from a frame and the map: who's there, and what's
 * inside (a shop's stock and prices, the board's notes, the farm's beds, who's
 * fishing, when the lorry comes). Owner's view only.
 */
export function placeCardOf(frame: Frame, layout: Layout, id: string): PlaceCard | null {
  const place = layout.places.find((p) => p.id === id);
  if (!place) return null;
  const name = (rid: string | null | undefined) => (rid ? frame.residents.find((r) => r.id === rid)?.name ?? rid : null);
  const inside = (r: { x: number; y: number }) => r.x >= place.rect.x && r.x < place.rect.x + place.rect.w && r.y >= place.rect.y && r.y < place.rect.y + place.rect.h;
  const people = frame.residents.filter(inside);
  const card: PlaceCard = { id, kind: place.kind, name: place.name, here: people.map((r) => r.name), shop: null, notes: null, beds: null, fishing: null, lorry: null, home: null };
  const shop = frame.shops.find((s) => s.id === id);
  if (shop) {
    card.shop = {
      owner: name(shop.ownerId)!, serving: mindingLabel(shop, (x) => name(x)!), workers: (shop.workers ?? []).map((w) => name(w)!),
      stock: shop.stock, sells: shop.sells, buys: shop.buys,
    };
  }
  if (place.kind === 'notice_board') {
    card.notes = (frame.notes ?? []).slice().reverse().map((n) => ({ author: name(n.authorId)!, stamp: n.stamp, text: n.text }));
  }
  if (place.kind === 'farm') {
    card.beds = frame.beds.map((b) => {
      const who = b.planted ? name(b.planter ?? null) : null;
      const status = !b.planted ? 'free'
        : b.ready ? 'ready to harvest'
          : `growing (watered ${b.wateredDays ?? 0} of ${DAYS_TO_GROW} days${b.wateredToday ? ', today too' : ''})`;
      return { n: b.n, who, growing: b.planted ? 'kangkong' : null, ready: b.ready, status };
    });
  }
  if (place.kind === 'jetty') card.fishing = people.filter((r) => r.activity === 'fishing').map((r) => r.name);
  if (place.kind === 'lorry_stop') {
    const next = frame.lorryHere ? `Pak Osman is here now, until about ${hhmm(LORRY_LEAVES)}.`
      : `Pak Osman comes about ${hhmm(LORRY_ARRIVES)} ${frame.minuteOfDay < LORRY_ARRIVES ? 'today' : 'tomorrow'}, and stays until about noon.`;
    card.lorry = { here: frame.lorryHere, next, sells: priceList(LORRY_SELLS), buys: priceList(LORRY_BUYS) };
  }
  if (place.kind === 'house') card.home = { of: frame.residents.find((r) => r.homeId === id)?.name ?? null };
  return card;
}

/** How many of a resident's lines of talk the card's Talk tab holds. */
export const TALK_LINES = 50;
/** How far back, in game days, the Talk tab reads a resident's talk from the save. */
export const TALK_DAYS = 7;
/** Quiet minutes after which the same two are in a new conversation. */
export const TALK_GAP = 10;

/**
 * A resident's conversations from the saved talk: what they said and what was
 * said to them, newest first, the last TALK_LINES lines. A new partner, or
 * more than TALK_GAP quiet minutes, starts a new conversation.
 */
export function talkOf(events: readonly GameEvent[], id: string, name: (id: string) => string, w: { calendar: { firstDay: number } }): { with: string; lines: TalkLine[] }[] {
  const said = events
    .filter((e): e is Extract<GameEvent, { type: 'said' }> => e.type === 'said' && (e.who === id || e.to === id))
    .sort((a, b) => b.seq - a.seq)
    .slice(0, TALK_LINES);
  const talks: { with: string; lines: TalkLine[] }[] = [];
  let partner: string | null = null;
  let lastT = Infinity;
  for (const e of said) {
    const other = e.who === id ? (e.to ?? '') : e.who;
    const current = talks.at(-1);
    if (!current || other !== partner || lastT - e.t > TALK_GAP) {
      talks.push({ with: other ? name(other) : 'everyone nearby', lines: [] });
      partner = other;
    }
    lastT = e.t;
    talks.at(-1)!.lines.push({ t: e.t, stamp: shortStamp(w, e.t), speaker: name(e.who), to: e.to ? name(e.to) : null, text: e.text, mine: e.who === id });
  }
  return talks;
}

const THOUGHT_WORDS = (text: string) => new Set(text.toLowerCase().match(/[a-z']+/g)?.filter((w) => w.length > 2) ?? []);

/**
 * Thoughts as the card shows them: the model's own labels ("*Ah Kow
 * thinks:*") and asterisks gone, and near-identical ones folded into the
 * newest of them with how many times. Newest last, as given.
 */
export function tidyThoughts(list: readonly Thought[]): Thought[] {
  const kept: { th: Thought; words: Set<string> }[] = [];
  for (const raw of list.slice().reverse()) {
    const text = raw.text.replace(/^\s*\*?\s*[^*:\n]{1,40}\bthinks:\s*\*?\s*/i, '').replace(/\*/g, '').trim();
    const words = THOUGHT_WORDS(text);
    const same = kept.find((k) => {
      const shared = [...words].filter((w) => k.words.has(w)).length;
      return shared / Math.max(1, new Set([...words, ...k.words]).size) >= 0.5;
    });
    if (same) same.th.times = (same.th.times ?? 1) + 1;
    else kept.push({ th: { ...raw, text }, words });
  }
  return kept.map((k) => k.th).reverse();
}
