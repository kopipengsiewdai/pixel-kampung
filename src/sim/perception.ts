import { crowdSoon, mastered, skillLevel, skillLines, type SkillId } from './skills.ts';
import { isRipe, isStaffed, shiftLabel, shopHere } from './actions/everyone.ts';
import { canForageToday, CHORE_DOING, errandLines } from './actions/chores.ts';
import { cookable, type CookAt } from './actions/owners.ts';
import { FEELINGS_SHOWN, feelingLine, strength } from './bonds.ts';
import { householdLines } from './households.ts';
import { offersFor } from './actions/haggle.ts';
import { servers } from './travellers.ts';
import { newestOfEach, type DealKind } from './talk.ts';
import { availableActions } from './actions/index.ts';
import { ITEMS, quantityLabel, RECIPES, type ItemId } from './items.ts';
import { HAGGLES_PER_VISIT, OSMAN, priceFor, room } from './osman.ts';
import { distance, PLACES, PLACE_BY_ID, type Place } from './map.ts';
import { doneToday, mrLimAt, openJobHere, whatOf } from './mr-lim.ts';
import { cookingLines, KITCHEN_ID, kitchenBuilt } from './cooking.ts';
import { formatMoney, type Cents } from './money.ts';
import { CIRCLE_LINES, countGoods, NEARBY_TILES, SAID_ALL_LINES, TALK_GAP_MINUTES, TALK_SOFT_LIMIT, talkKey, UNANSWERED_LINES, WORD_MINUTES, type Bond, type Debt, type Goods, type Observation, type Resident, type Shop, type TalkRecord, type World } from './state.ts';
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
  /** Where they are, by the place's own name ("the provision shop", "your house"). */
  place: string;
  placeId: string | null;
  /** Where they are, as they'd say it: a shop by whose it is ("Mdm Tan's provision shop", "your kopitiam"). */
  where: string;
  atHome: boolean;
  /** looks: how hungry they look, if it shows. */
  people: { name: string; doing: string; looks?: string }[];
  /** How they feel about those nearby they know, in words. */
  feelings: string[];
  money: Cents;
  carrying: { item: ItemId; qty: number }[];
  /** Hunger that hurts, in words, from 800; null below. */
  hungerPang: string | null;
  /** Ill from hunger. */
  ill: boolean;
  /** Rent owed, and what can be had at the village head's house. */
  household: string[];
  /** Where they could cook here: a fire burning, or the village kitchen built or going up. */
  cooking: string[];
  /** Mr Lim, when he's near: what he's doing. */
  villageHead: string | null;
  /** Mr Lim's odd job here, open to them. */
  oddJob: { what: string; pay: Cents } | null;
  /** Hungry with nothing to eat: the ways to food they know of. */
  foodWays: string[];
  hunger: HungerWord;
  energy: EnergyWord;
  job: {
    place: string; boss: string; shift: string; startHour: number; hours: number;
    doneToday: boolean; atWork: boolean; onShift: boolean;
    /** What's in the shop, seen while on shift there. */
    stock: { item: ItemId; qty: number }[];
  } | null;
  /** Where they could cook right now, and what. */
  cookable: { at: CookAt; dishes: ItemId[]; fuel: boolean } | null;
  /** At a kitchen they can cook in: what it has none of (and the dishes that wants), and which of those the lorry has today. */
  kitchen: { lacks: { item: ItemId; dishes: ItemId[] }[]; lorryHas: ItemId[] } | null;
  business: {
    place: string;
    atShop: boolean;
    stock: { item: ItemId; qty: number }[];
    sells: PriceTag[];
    buys: PriceTag[];
    workers: string[];
    owed: { name: string; cents: Cents }[];
    /** Travellers waiting now, and today's (seen only at the shop): served, left unserved, and turned away by price (by item). */
    waiting: number;
    today: { served: number; left: number; lost: Cents; tooDear: { item: ItemId; n: number }[] };
  } | null;
  shop: { name: string; staffed: boolean; sells: PriceTag[]; buys: PriceTag[] } | null;
  /** At the lorry stop: the lorry man (by name, once met), his prices for you today, his room, your slate and what you asked him to bring. */
  lorry: {
    here: boolean; who: string; sells: PriceTag[]; buys: PriceTag[]; room: number; owes: Cents;
    brought: { item: ItemId; asked: number; brought: number }[]; asked: { item: ItemId; qty: number }[]; haggled: boolean;
  } | null;
  beds: { n: number; ready: boolean; wateredToday: boolean }[];
  freeBeds: number | null;
  /** At home: pots' worth of kerosene left in the stove. */
  stove: number | null;
  jobOffers: { from: string; wage: Cents; startHour: number; hours: number }[];
  trades: { from: string; give: string; want: string }[];
  /** Money they owe and are owed, summed per person (an IOU's words with it), and wages owed to them. */
  debts: { owe: { name: string; cents: Cents; what: string | null }[]; owedYou: { name: string; cents: Cents; what: string | null }[]; wages: { name: string; cents: Cents }[] };
  /** In a shop someone else runs: who is serving, if only one, and how many travellers wait. */
  busyShop: { server: string; owner: string; alone: boolean; waiting: number } | null;
  /** On shift: how many travellers they've served today. */
  servedToday: number | null;
  /** What they know of their own skills, in words, and an Expert's sense of the moment (docs/design/skills.md). */
  skills: string[];
  /** For the free fake brain only (the words are in `skills`): who offers to show them how, what they could teach, and a crowd coming. */
  lessonOffers: { from: string }[];
  canTeach: SkillId[];
  crowdSoon: boolean;
  /** Errands they're running, asked to run, or asked of someone. */
  errands: string[];
  /** Their nets are mended for today's next catches. */
  netsMended: boolean;
  /** Prices offered at a counter they're minding, below what the shop asks. */
  priceOffers: { from: string; item: ItemId; qty: number; cents: Cents; asking: Cents }[];
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
  /** People nearby you've said several things to in a row, with no answer. */
  unanswered: string[];
  /** People nearby you've gone round in circles with twice over: you've said all there is to say. */
  saidAll: string[];
  /** What happened when they last tried something. */
  reply?: string;
  refused?: boolean;
  actions: { verb: string; says: string }[];
  placesYouKnow: string[];
}

const HUNGRY: ReadonlySet<HungerWord> = new Set(['hungry', 'very hungry', 'starving']);

/** From here hunger hurts, and then it can't wait. */
export const ACHING_HUNGER = 800;
export const FAINT_HUNGER = 950;

/** Hunger that matters, in words: eating (or going where food is) is the next thing to do. */
/**
 * Hungry with nothing to eat in hand: where they know food can be had right
 * now (a shop being minded with food they can pay for, the lorry while it's in),
 * and the sea, which always has fish. Only places they know.
 */
function foodWays(w: World, r: Resident): string[] {
  if (r.hunger < HUNGRY_FROM || (Object.keys(r.items) as ItemId[]).some((i) => ITEMS[i]?.food && (r.items[i] ?? 0) > 0)) return [];
  const here = w.placeOf(r)?.id ?? null;
  const shops = w.state.shops.filter((s) => s.id !== here && r.knownPlaces.includes(s.id) && isStaffed(w, s)
    && (Object.entries(s.sellPrices) as [ItemId, number][]).some(([i, price]) => ITEMS[i].food && (s.stock[i] ?? 0) > 0 && price <= r.money))
    .map((s) => w.placeName(PLACE_BY_ID.get(s.id)!));
  const v = w.state.osman.visit;
  if (v && here !== 'lorry-stop' && r.knownPlaces.includes('lorry-stop')
    && (Object.keys(v.goods) as ItemId[]).some((i) => ITEMS[i].food && (v.goods[i] ?? 0) > 0 && (priceFor(w, r, 'sells', i) ?? Infinity) <= r.money)) {
    shops.push(w.placeName(PLACE_BY_ID.get('lorry-stop')!));
  }
  const out: string[] = [];
  if (shops.length) out.push(`You could get something to eat at ${shops.length === 1 ? shops[0] : `${shops.slice(0, -1).join(', ')} or ${shops.at(-1)}`}.`);
  // The land gives a little, free, to anyone who goes and looks (twice a day each).
  if (!r.ill && canForageToday(w, r)) {
    const jetty = r.knownPlaces.includes('jetty');
    const farm = r.knownPlaces.includes('farm');
    if (jetty && farm) out.push('There are coconuts on the palms by the jetty, and bananas and wild kangkong past the farm plot.');
    else if (jetty) out.push('There are coconuts on the palms by the jetty.');
    else if (farm) out.push('There are bananas and wild kangkong past the farm plot.');
  }
  // Too ill to fish, the sea is no use to them.
  if (here !== 'jetty' && r.knownPlaces.includes('jetty') && !r.ill) out.push('You could catch a fish at the jetty.');
  return out;
}

/** A thing as stuff, with no count: "rice", "coffee powder", "chillies". */
const stuff = (item: ItemId) => ITEMS[item].many.replace(/^\{n\} (?:\w+ of )?/, '');
const andOr = (xs: string[], word: string) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${word} ${xs.at(-1)}`);

/** The kitchen r can cook in here (their own, or the one they're on shift in): what it has none of for the dishes they know. */
function kitchenView(w: World, r: Resident): Perception['kitchen'] {
  const own = w.shopOf(r.id);
  const job = w.jobOf(r.id);
  const shop = own?.id === 'kopitiam' && w.isAt(r, own.id) ? own
    : r.activity?.kind === 'working' && job?.placeId === 'kopitiam' ? w.shop('kopitiam') : null;
  if (!shop) return null;
  const has = (i: ItemId) => countGoods(shop.stock, i) + (own?.id === shop.id ? countGoods(r.items, i) : 0) > 0;
  const lacks = new Map<ItemId, ItemId[]>();
  for (const [dish, recipe] of Object.entries(RECIPES) as [ItemId, NonNullable<(typeof RECIPES)[ItemId]>][]) {
    if (skillLevel(r, 'cooking') < (recipe.level ?? 1)) continue;
    for (const need of Object.keys(recipe.needs) as ItemId[]) if (!has(need)) lacks.set(need, [...(lacks.get(need) ?? []), dish]);
  }
  if (!lacks.size) return null;
  const v = w.state.osman.visit;
  const lorryHas = [...lacks.keys()].filter((i) => v && countGoods(v.goods, i) > 0);
  return { lacks: [...lacks].map(([item, dishes]) => ({ item, dishes })), lorryHas };
}

export function hungerPang(h: number): string | null {
  if (h >= FAINT_HUNGER) return "You're faint with hunger. You must eat now.";
  if (h >= ACHING_HUNGER) return 'Your stomach aches; you need to eat soon.';
  return null;
}

/** From here a resident is hungry. */
export const HUNGRY_FROM = 450;

export function hungerWord(h: number): HungerWord {
  return h < 200 ? 'full' : h < HUNGRY_FROM ? 'not hungry' : h < 700 ? 'hungry' : h < 1000 ? 'very hungry' : 'starving';
}

export function energyWord(e: number): EnergyWord {
  return e > 700 ? 'rested' : e > 350 ? 'fine' : e > 150 ? 'tired' : 'exhausted';
}

function goodsList(g: Goods): { item: ItemId; qty: number }[] {
  return (Object.entries(g) as [ItemId, number][]).filter(([, n]) => n > 0).map(([item, qty]) => ({ item, qty }));
}

/** How hungry someone looks to anyone nearby. */
function looks(o: Resident): string {
  if (o.ill && o.activity?.kind !== 'sleeping') return o.hunger >= FAINT_HUNGER ? 'looking ill and faint with hunger' : o.hunger >= LOOKS_HUNGRY ? 'looking ill and hungry' : 'looking ill';
  return o.activity?.kind === 'sleeping' ? '' : o.hunger >= FAINT_HUNGER ? 'looking faint with hunger' : o.hunger >= LOOKS_HUNGRY ? 'looking hungry' : '';
}
const LOOKS_HUNGRY = 700;

function doing(w: World, o: Resident): string {
  switch (o.activity?.kind) {
    case 'walking': return 'walking by';
    case 'fishing': return 'fishing';
    case 'chore': return o.activity.kind === 'chore' ? CHORE_DOING[o.activity.chore] : 'busy';
    case 'working': return 'working';
    case 'sleeping': return 'asleep';
    default: return w.shopOf(o.id) && w.isAt(o, w.shopOf(o.id)!.id) ? 'minding the shop' : 'standing about';
  }
}

/** The lorry stop as r sees it: his name once they've met him, and his prices for them. */
function lorryView(w: World, r: Resident): NonNullable<Perception['lorry']> {
  const o = w.state.osman;
  const v = o.visit;
  const a = o.accounts[r.id];
  const price = (side: 'sells' | 'buys', from: Partial<Record<ItemId, Cents>>, stock?: Goods): PriceTag[] =>
    (Object.keys(from) as ItemId[]).map((item) => ({ item, price: priceFor(w, r, side, item)!, ...(stock ? { stock: stock[item] ?? 0 } : {}) }));
  const mine = o.orders.filter((x) => x.who === r.id);
  return {
    here: !!v,
    who: a ? OSMAN : 'the lorry man',
    sells: v ? price('sells', v.sells, v.goods) : [],
    buys: v ? price('buys', v.buys) : [],
    room: v ? room(v) : 0,
    owes: a?.owes ?? 0,
    brought: v ? mine.filter((x) => x.brought !== null).map((x) => ({ item: x.item, asked: x.qty, brought: x.brought! })) : [],
    asked: mine.filter((x) => x.brought === null).map((x) => ({ item: x.item, qty: x.qty })),
    haggled: !!v && v.haggles >= HAGGLES_PER_VISIT,
  };
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

/** Where they are, in their words: home, a shop by whose it is ("Mdm Tan's provision shop", "your kopitiam"), or the place. */
function placeLabel(w: World, r: Resident, here: Place): string {
  if (here.id === r.homeId) return 'your house';
  const shop = w.shop(here.id);
  if (!shop) return w.placeName(here);
  const what = here.name.replace(/^the /, '');
  return shop.ownerId === r.id ? `your ${what}` : `${w.resident(shop.ownerId).name}'s ${what}`;
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
    placeId: here?.id ?? null,
    where: here ? placeLabel(w, r, here) : 'out on the footpath',
    atHome: w.isAt(r, r.homeId),
    feelings: w.nearby(r).filter((o) => !w.isAsleep(o) && w.knowsPerson(r, o.id))
      .map((o) => ({ o, b: w.state.bonds?.[`${r.id}>${o.id}`] }))
      .filter((x): x is { o: Resident; b: Bond } => !!x.b && feelingLine(x.b, x.o.name) !== null)
      .sort((x, y) => strength(y.b) - strength(x.b)).slice(0, FEELINGS_SHOWN)
      .map((x) => feelingLine(x.b, x.o.name)!),
    people: w.nearby(r).map((o) => { const l = looks(o); return l ? { name: o.name, doing: doing(w, o), looks: l } : { name: o.name, doing: doing(w, o) }; }),
    money: r.money,
    carrying: goodsList(r.items),
    hunger: hungerWord(r.hunger),
    hungerPang: hungerPang(r.hunger),
    ill: r.ill !== null,
    foodWays: foodWays(w, r),
    household: householdLines(w, r, w.isAt(r, 'village-head')),
    cooking: cookingLines(w, r),
    villageHead: (() => { const m = mrLimAt(w, w.t); return m.out && distance(m.pos, r.pos) <= NEARBY_TILES ? m.doing : null; })(),
    oddJob: (() => { const j = doneToday(w, r) ? null : openJobHere(w, r); return j ? { what: whatOf(j.kind), pay: j.pay } : null; })(),
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
    kitchen: kitchenView(w, r),
    cookable: cookable(w, r),
    business: own ? {
      place: PLACE_BY_ID.get(own.id)!.name,
      atShop: w.isAt(r, own.id),
      stock: goodsList(own.stock),
      sells: tags(own.sellPrices, own.stock),
      buys: buyTags(own),
      workers: w.state.jobs.filter((j) => j.employerId === r.id).map((j) => w.resident(j.workerId).name),
      owed: w.state.owed.filter((o) => o.employerId === r.id).map((o) => ({ name: w.resident(o.workerId).name, cents: o.cents })),
      waiting: own.queue.length,
      // Today's count is seen at the shop; away from it, the owner hears on coming back who found nobody serving.
      today: w.isAt(r, own.id) && own.today.day === today ? {
        served: own.today.served,
        // Unserved: gave up in the queue, or found nobody serving.
        left: own.today.left + own.today.away,
        lost: own.today.lost,
        tooDear: (Object.entries(own.today.tooDear) as [ItemId, number][]).filter(([, n]) => n > 0).map(([item, n]) => ({ item, n })),
      } : { served: 0, left: 0, lost: 0, tooDear: [] },
    } : null,
    shop: shop && shop.ownerId !== r.id ? {
      name: PLACE_BY_ID.get(shop.id)!.name,
      staffed: isStaffed(w, shop),
      sells: tags(shop.sellPrices, shop.stock),
      buys: buyTags(shop),
    } : null,
    lorry: w.isAt(r, 'lorry-stop') ? lorryView(w, r) : null,
    beds: w.state.beds.filter((b) => b.planterId === r.id)
      .map((b) => ({ n: b.n, ready: isRipe(w, b), wateredToday: b.lastWateredDay === today })),
    freeBeds: w.isAt(r, 'farm') ? w.state.beds.filter((b) => b.planterId === null).length : null,
    stove: w.isAt(r, r.homeId) ? w.state.stoves[r.homeId] ?? 0 : w.isAt(r, KITCHEN_ID) && kitchenBuilt(w) ? w.state.stoves[KITCHEN_ID] ?? 0 : null,
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
    busyShop: shop && shop.ownerId !== r.id && !(r.activity?.kind === 'working') ? busyShopOf(w, shop) : null,
    servedToday: r.activity?.kind === 'working' && jobRow ? (w.shop(jobRow.placeId)?.today.servedBy[r.id] ?? 0) : null,
    skills: skillLines(w, r),
    lessonOffers: w.state.lessonOffers.filter((o) => o.learnerId === r.id).map((o) => ({ from: w.resident(o.teacherId).name })),
    canTeach: mastered(r),
    crowdSoon: crowdSoon(w, r),
    errands: errandLines(w, r),
    netsMended: !!r.mended && r.mended.day === today && r.mended.left > 0,
    priceOffers: offersFor(w, r).map((o) => ({
      from: w.resident(o.buyerId).name, item: o.item, qty: o.qty, cents: o.cents, asking: (w.shop(o.shopId)!.sellPrices[o.item] ?? 0) * o.qty,
    })),
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
    circles: chatsOf(w, r).filter(({ o, rec }) => rec.idle >= CIRCLE_LINES && rec.idle < SAID_ALL_LINES && w.isNear(r, o) && !w.isAsleep(o)).map(({ o }) => o.name),
    unanswered: Object.entries(w.state.talk).filter(([k, rec]) => k.split('|').includes(r.id) && rec.unanswered?.by === r.id && rec.unanswered.n >= UNANSWERED_LINES && w.t - rec.unanswered.t <= TALK_GAP_MINUTES)
      .map(([k]) => w.resident(k.split('|').find((x) => x !== r.id)!)).filter((o) => w.isNear(r, o) && !w.isAsleep(o)).map((o) => o.name),
    saidAll: chatsOf(w, r).filter(({ o, rec }) => rec.idle >= SAID_ALL_LINES && w.isNear(r, o) && !w.isAsleep(o)).map(({ o }) => o.name),
    actions: availableActions(w, r),
    placesYouKnow: PLACES.filter((pl) => w.knowsPlace(r, pl.id)).flatMap((pl) => {
      if (pl.id === r.homeId) return ['home'];
      if (pl.kind !== 'house') return [pl.name];
      const owner = w.state.residents.find((x) => x.homeId === pl.id);
      // A house is known by whose it is; the person is still met in play.
      return owner ? [w.placeName(pl)] : [];
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

function busyShopOf(w: World, shop: Shop): { server: string; owner: string; alone: boolean; waiting: number } | null {
  if (!shop.queue.length) return null;
  const on = servers(w, shop);
  return { server: on[0] ? on[0].name : w.resident(shop.ownerId).name, owner: w.resident(shop.ownerId).name, alone: on.length === 1, waiting: shop.queue.length };
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** "Three", "12": a small count as a word. */
function count(n: number, capital = false): string {
  const s = NUMBER_WORDS[n] ?? String(n);
  return capital ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
  return newestOfEach(p.recent.filter((l) => !talk.has(l)), (l) => l).slice(-5);
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
  const lines: string[] = [`It's ${p.time}. You're at ${p.where}.`];
  lines.push(p.people.length
    ? `Nearby: ${p.people.map((x) => `${x.name} (${x.doing}${x.looks ? `, ${x.looks}` : ''})`).join(', ')}.`
    : "There's nobody else around.");
  lines.push(...p.feelings);
  for (const n of p.unanswered) lines.push(`${n} hasn't answered you.`);
  if (p.atHome && HUNGRY.has(p.hunger) && !p.carrying.some((c) => ITEMS[c.item].food)) lines.push("There's no food in the house.");
  if (p.hungerPang) lines.push(p.hungerPang);
  if (p.ill) lines.push("You're ill: feverish and weak. You need to eat, and rest.");
  lines.push(...p.foodWays);
  lines.push(...p.household);
  lines.push(...p.cooking);
  if (p.villageHead) lines.push(`Mr Lim, the village head, is here, ${p.villageHead}.`);
  if (p.oddJob) lines.push(`Mr Lim wants someone to ${p.oddJob.what} here: ${formatMoney(p.oddJob.pay)} for an hour's work.`);
  lines.push(`You feel ${p.hunger} and ${p.energy}. You have ${formatMoney(p.money)}${p.carrying.length ? ` and you're carrying ${p.carrying.map((c) => quantityLabel(c.item, c.qty)).join(', ')}` : ''}.`);
  // What's owed, every moment, next to their money: so talk of debts meets what's true.
  const bracket = (what: string | null) => (what ? ` (${what})` : '');
  for (const d of p.debts.owe) lines.push(`You owe ${d.name} ${formatMoney(d.cents)}${bracket(d.what)}.`);
  for (const d of p.debts.owedYou) lines.push(`${d.name} owes you ${formatMoney(d.cents)}${bracket(d.what)}.`);
  for (const d of p.debts.wages) lines.push(`${d.name} owes you ${formatMoney(d.cents)} in wages.`);
  if (!p.debts.owe.length && !p.debts.owedYou.length && !p.debts.wages.length && !p.business?.owed.length) {
    lines.push('Nobody owes you anything, and you owe nobody.');
  }
  lines.push(...p.skills);
  // What they are, every moment, so nobody talks as if they ran a shop they don't (or shared one that's theirs).
  if (!p.job && !p.business) lines.push("You have no work just now, and you don't run a stall or shop.");
  if (p.job) {
    lines.push(`You work for ${p.job.boss} at ${p.job.place}, ${p.job.shift}.${p.job.onShift ? " You're on shift now." : ''}`);
    if (!p.business) lines.push("You don't run a stall or shop.");
    if (p.job.onShift) lines.push(`In the shop: ${p.job.stock.map((s) => quantityLabel(s.item, s.qty)).join(', ') || 'nothing'}.`);
  }
  if (p.cookable?.dishes.length) {
    const dishes = andOr(p.cookable.dishes, 'or');
    if (p.cookable.at === 'kitchen') lines.push(`With what's here you could make ${dishes}.`);
    else if (p.cookable.at === 'fire') lines.push(`With what you have you could cook ${dishes} over the fire.`);
    else lines.push(p.cookable.fuel ? `With what you have you could cook ${dishes}.`
      : `With what you have you could cook ${dishes}, but the stove has nothing to burn: dry wood from past the farm plot, or kerosene off the lorry.`);
  }
  if (p.kitchen) {
    for (const l of p.kitchen.lacks) lines.push(`The kitchen has no ${stuff(l.item)}: no ${andOr(l.dishes, 'or')} without it.`);
    if (p.kitchen.lorryHas.length) lines.push(`The lorry at the lorry stop has ${andOr(p.kitchen.lorryHas.map(stuff), 'and')} today.`);
  }
  if (p.business) {
    lines.push(`You run ${p.business.place}. It's yours alone. In stock: ${p.business.stock.map((s) => quantityLabel(s.item, s.qty)).join(', ') || 'nothing'}.`);
    lines.push(`Your prices: ${p.business.sells.map(priceLine).join(', ') || 'none set'}.`);
    if (p.business.buys.length) lines.push(`You're buying: ${p.business.buys.map(priceLine).join(', ')}.`);
    if (p.business.workers.length) lines.push(`Working for you: ${p.business.workers.join(', ')}.`);
    if (p.business.owed.length) lines.push(`You owe wages: ${p.business.owed.map((o) => `${o.name} ${formatMoney(o.cents)}`).join(', ')}.`);
    if (p.business.atShop && p.business.waiting) {
      lines.push(`${count(p.business.waiting, true)} ${p.business.waiting === 1 ? 'traveller from the road is' : 'travellers from the road are'} waiting to be served.`);
    }
    const t = p.business.today;
    if (t.served || t.left) lines.push(`Today you've served ${t.served}; ${t.left} left without being served.`);
    if (t.lost > 0) lines.push(`Travellers who left unserved today would have paid about ${formatMoney(t.lost)}.`);
    for (const d of t.tooDear) lines.push(`${count(d.n, true)} ${d.n === 1 ? 'person' : 'people'} turned away at your ${d.item} price.`);
  }
  if (p.shop) {
    lines.push(`${p.shop.staffed ? 'Someone is serving.' : "Nobody's serving right now."} For sale: ${p.shop.sells.map(priceLine).join(', ') || 'nothing'}.`);
    if (p.shop.buys.length) lines.push(`They're buying: ${p.shop.buys.map(priceLine).join(', ')}.`);
  }
  if (p.lorry) {
    const l = p.lorry;
    if (!l.here) lines.push("The lorry isn't here.");
    else {
      lines.push(`${l.who === OSMAN ? `${OSMAN}'s lorry` : 'The lorry'} is here. He's selling ${l.sells.map(priceLine).join(', ') || 'nothing'}.`);
      lines.push(`He buys ${l.buys.map(priceLine).join(', ')}${l.room === 0 ? ", but his lorry is full today" : l.room < 10 ? `, with room for only ${l.room} more` : ''}.`);
      if (l.haggled) lines.push("He's done haggling for this morning: his price or nothing.");
      for (const b of l.brought) {
        lines.push(b.brought === b.asked ? `He has the ${quantityLabel(b.item, b.asked)} you asked for.`
          : b.brought === 0 ? `He couldn't get any of the ${b.item} you asked for.` : `He could only get ${b.brought} of the ${b.asked} ${b.item} you asked for.`);
      }
    }
    for (const a of l.asked) lines.push(`You've asked him to bring ${quantityLabel(a.item, a.qty)} next time.`);
    if (l.owes > 0) lines.push(`You owe ${l.who} ${formatMoney(l.owes)}.`);
  }
  if (p.beds.length) lines.push(`Your beds on the farm plot: ${p.beds.map((b) => `bed ${b.n} ${b.ready ? 'ready to harvest' : b.wateredToday ? 'watered today' : 'needs water'}`).join('; ')}.`);
  if (p.stove) lines.push(`There's kerosene in the stove for ${p.stove === 1 ? 'one more pot' : `${p.stove} more pots`}.`);
  if (p.freeBeds !== null) lines.push(`${p.freeBeds} bed${p.freeBeds === 1 ? ' is' : 's are'} free on the plot.`);
  for (const o of p.jobOffers) lines.push(`${o.from} has offered you work ${shiftLabel(o.startHour, o.hours)} for ${formatMoney(o.wage)} a shift.`);
  for (const t of p.trades) lines.push(`${t.from} offers you ${t.give} for ${t.want}.`);
  if (p.busyShop) {
    const b = p.busyShop;
    const waiting = `${count(b.waiting)} ${b.waiting === 1 ? 'traveller is' : 'travellers are'} waiting`;
    lines.push(b.alone ? `${b.server} is serving alone, and ${waiting}.` : `${count(b.waiting, true)} ${b.waiting === 1 ? 'traveller from the road is' : 'travellers from the road are'} waiting.`);
  }
  if (p.servedToday !== null && p.servedToday > 0) lines.push(`You've served ${p.servedToday} ${p.servedToday === 1 ? 'person' : 'people'} this shift.`);
  lines.push(...p.errands);
  for (const o of p.priceOffers) lines.push(`${o.from} offers ${formatMoney(o.cents)} for ${quantityLabel(o.item, o.qty)}.`);
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
  for (const n of p.saidAll) lines.push(`You and ${n} have said all there is to say.`);
  for (const u of p.unbacked) lines.push(unbackedLine(u));
  for (const n of p.waiting) lines.push(`${n} is waiting for your answer.`);
  if (p.reply) lines.push(p.reply);
  return lines.join('\n');
}
