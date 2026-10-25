/**
 * Haggling at the counter: a buyer names a price below what the shop asks,
 * and whoever minds the counter (the owner, or a worker on shift) takes it or
 * turns it down. Nothing changes hands until it's taken; a taken offer is a
 * sale at the price agreed, like any other.
 */
import { quantityLabel, type ItemId } from '../items.ts';
import { formatMoney, type Cents } from '../money.ts';
import { addGoods, countGoods, type PriceOffer, type Resident, type Shop, type World } from '../state.ts';
import { type ActionResult, no, ok } from './common.ts';
import { isStaffed, recordFirstSale } from './everyone.ts';

/** How long a price offered at the counter stands without an answer. */
export const PRICE_OFFER_MINUTES = 5;
/** The lowest share of the asking price a worker on shift may take (owner, 2026-10-25). Owners may take any. */
export const WORKER_FLOOR = 0.8;

/** Whether r is minding this shop's counter right now: its owner there, or a worker on shift there. */
export function minds(w: World, r: Resident, shop: Shop): boolean {
  if (w.isAsleep(r)) return false;
  if (shop.ownerId === r.id) return w.isAt(r, shop.id) && r.activity?.kind !== 'walking';
  const a = r.activity;
  return a?.kind === 'working' && w.state.jobs.some((j) => j.id === a.jobId && j.placeId === shop.id);
}

/** Price offers waiting at counters r is minding (never r's own). */
export function offersFor(w: World, r: Resident): PriceOffer[] {
  return w.state.priceOffers.filter((o) => {
    if (o.buyerId === r.id) return false;
    const shop = w.shop(o.shopId);
    return !!shop && minds(w, r, shop);
  });
}

/** A price offered stands while the buyer is still in the shop and someone is minding it. */
export function stillAtCounter(w: World, o: PriceOffer): boolean {
  const shop = w.shop(o.shopId);
  return !!shop && w.isAt(w.resident(o.buyerId), o.shopId) && isStaffed(w, shop);
}

/** Lets go of offers that have run out of time or lost their buyer or counter; each buyer hears theirs wasn't taken. */
export function lapsePriceOffers(w: World): void {
  const keep: PriceOffer[] = [];
  for (const o of w.state.priceOffers) {
    if (o.expires > w.t && stillAtCounter(w, o)) keep.push(o);
    else w.notify(o.buyerId, `${w.resident(w.shop(o.shopId)!.ownerId).name} didn't take your offer for the ${o.item}.`);
  }
  w.state.priceOffers = keep;
}

/** Puts a price below the shop's to whoever minds the counter. */
export function offerPrice(w: World, r: Resident, shop: Shop, item: ItemId, qty: number, cents: Cents): ActionResult {
  if (r.money < cents) return no(`You don't have ${formatMoney(cents)}.`);
  w.state.priceOffers = w.state.priceOffers.filter((o) => !(o.buyerId === r.id && o.shopId === shop.id));
  w.state.priceOffers.push({ id: w.nextId(), buyerId: r.id, shopId: shop.id, item, qty, cents, expires: w.t + PRICE_OFFER_MINUTES });
  w.emit({ type: 'price_offered', who: r.id, owner: shop.ownerId, shop: shop.id, item, qty, cents });
  const what = `${formatMoney(cents)} for ${quantityLabel(item, qty)}`;
  for (const m of w.state.residents) if (m.id !== r.id && minds(w, m, shop)) w.notify(m.id, `${r.name} offers ${what}.`);
  return ok(`You offer ${what}.`);
}

/** The price offer from someone named, at a counter r is minding. */
export function priceOfferFrom(w: World, r: Resident, from: unknown): { buyer: Resident; offer: PriceOffer; shop: Shop } | null {
  const buyer = w.residentByName(from, r);
  if (!buyer) return null;
  const offer = offersFor(w, r).find((o) => o.buyerId === buyer.id);
  return offer ? { buyer, offer, shop: w.shop(offer.shopId)! } : null;
}

export function acceptPrice(w: World, r: Resident, found: { buyer: Resident; offer: PriceOffer; shop: Shop }): ActionResult {
  const { buyer, offer, shop } = found;
  const what = `${formatMoney(offer.cents)} for ${quantityLabel(offer.item, offer.qty)}`;
  if (!w.isAt(buyer, shop.id)) return no(`${buyer.name} has gone.`);
  // Never more than the shop asks now (its price may have come down since).
  const asking = (shop.sellPrices[offer.item] ?? 0) * offer.qty;
  const cents = asking > 0 ? Math.min(offer.cents, asking) : offer.cents;
  // A worker can take an offer only down to what the owner would (owner, 2026-10-25: four-fifths of the price).
  if (shop.ownerId !== r.id && cents < WORKER_FLOOR * asking) return no(`That's below what ${w.resident(shop.ownerId).name} lets you take.`);
  if (buyer.money < cents) return no(`${buyer.name} doesn't have ${formatMoney(cents)} any more.`);
  const have = countGoods(shop.stock, offer.item);
  if (have < offer.qty) return no(have === 0 ? `There's no ${offer.item} left.` : `There's only ${quantityLabel(offer.item, have)} left.`);
  w.state.priceOffers = w.state.priceOffers.filter((o) => o.id !== offer.id);
  w.transfer(buyer.id, shop.ownerId, cents, `bought ${offer.item}`);
  addGoods(shop.stock, offer.item, -offer.qty);
  addGoods(buyer.items, offer.item, offer.qty);
  w.emit({ type: 'bought', who: buyer.id, from: shop.ownerId, shop: shop.id, item: offer.item, qty: offer.qty, cents });
  recordFirstSale(w, shop);
  if (shop.ownerId !== r.id) w.remember(shop.ownerId, `${buyer.name} bought ${quantityLabel(offer.item, offer.qty)} for ${formatMoney(cents)}.`);
  w.notify(buyer.id, `${r.name} takes your ${what}.`);
  return ok(`You take ${buyer.name}'s ${what}.`);
}

export function refusePrice(w: World, r: Resident, found: { buyer: Resident; offer: PriceOffer; shop: Shop }): ActionResult {
  const { buyer, offer, shop } = found;
  const what = `${formatMoney(offer.cents)} for ${quantityLabel(offer.item, offer.qty)}`;
  w.state.priceOffers = w.state.priceOffers.filter((o) => o.id !== offer.id);
  w.emit({ type: 'price_refused', who: r.id, from: buyer.id, shop: shop.id, item: offer.item, qty: offer.qty, cents: offer.cents });
  w.notify(buyer.id, `${r.name} won't take ${what}.`);
  return ok(`You turn down ${buyer.name}'s ${what}.`);
}

