import { isRipe, isStaffed, shiftLabel, shopHere } from './actions/everyone.ts';
import { availableActions } from './actions/index.ts';
import { LORRY_BUYS, LORRY_SELLS, quantityLabel, type ItemId } from './items.ts';
import { PLACES, PLACE_BY_ID } from './map.ts';
import { formatMoney, type Cents } from './money.ts';
import type { Goods, Resident, World } from './state.ts';
import { dayIndex, sgtHour, sgtMinute, timeLabel } from './time.ts';

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
  recent: string[];
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
    time: timeLabel(w.t),
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
    recent: r.recent.map((o) => o.text),
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

/** The perception as plain words, as the character would take it in. */
export function describe(p: Perception): string {
  const lines: string[] = [`It's ${p.time}. You're at ${p.place}.`];
  lines.push(p.people.length
    ? `Nearby: ${p.people.map((x) => `${x.name} (${x.doing})`).join(', ')}.`
    : "There's nobody else around.");
  lines.push(`You feel ${p.hunger} and ${p.energy}. You have ${formatMoney(p.money)}${p.carrying.length ? ` and you're carrying ${p.carrying.map((c) => quantityLabel(c.item, c.qty)).join(', ')}` : ''}.`);
  if (p.job) {
    lines.push(`You work for ${p.job.boss} at ${p.job.place}, ${p.job.shift}.${p.job.onShift ? " You're on shift now." : ''}`);
    if (p.job.onShift) lines.push(`In the shop: ${p.job.stock.map((s) => quantityLabel(s.item, s.qty)).join(', ') || 'nothing'}.`);
  }
  if (p.business) {
    lines.push(`You run ${p.business.place}. In stock: ${p.business.stock.map((s) => quantityLabel(s.item, s.qty)).join(', ') || 'nothing'}.`);
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
  if (p.recent.length) lines.push(`Lately: ${p.recent.slice(-5).join(' ')}`);
  if (p.reply) lines.push(p.reply);
  return lines.join('\n');
}
