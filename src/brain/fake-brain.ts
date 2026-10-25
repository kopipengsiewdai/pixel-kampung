import { ITEMS, type ItemId } from '../sim/items.ts';
import type { Intent } from '../sim/actions/index.ts';
import type { Perception } from '../sim/perception.ts';
import { Rng } from '../sim/rng.ts';
import type { Brain } from './brain.ts';

const HUNGRY = new Set(['hungry', 'very hungry', 'starving']);

const CHATTER = [
  'Hot today, lah.',
  'The fish are biting this morning.',
  'Did you hear the lorry come in?',
  'Kopi here is still the best.',
  'Rain coming, I think.',
  'Business slow or not?',
  'My kangkong is coming up nicely.',
  'Wah, so expensive now.',
];

/** What a fake owner tops up to at the lorry (to twice this when below it): enough for the town and a day's travellers. */
const RESTOCK: Record<string, Partial<Record<ItemId, number>>> = {
  'the kopitiam': { rice: 4, coffee: 2, fish: 2, vegetables: 2 },
  'the provision shop': { rice: 15, coffee: 4, bread: 8 },
  'the wet-market stall': { fish: 6, vegetables: 6 },
};

/** Where a hungry fake resident looks for food, in turn, and the least they need on them to try. */
const FOOD_ROUND: readonly [string, number][] = [['the kopitiam', 35], ['the wet-market stall', 30], ['the provision shop', 20]];

/**
 * The fake owners' own pricing habits: a range each picks from. This is the
 * fake brain's policy, not a rule of the world; real owners price as they like.
 */
const HABITS: Record<string, { sell: Partial<Record<ItemId, [number, number]>>; buy: Partial<Record<ItemId, [number, number]>> }> = {
  'the kopitiam': {
    sell: { kopi: [8, 12], 'fish porridge': [30, 40], 'vegetable rice': [26, 34] },
    buy: { fish: [18, 26], vegetables: [10, 16], water: [6, 10] },
  },
  'the provision shop': { sell: { rice: [25, 35], coffee: [60, 80], bread: [16, 24] }, buy: {} },
  'the wet-market stall': {
    sell: { fish: [25, 35], vegetables: [16, 24] },
    buy: { fish: [15, 22], vegetables: [8, 14] },
  },
};

interface Memory {
  rng: number;
  /** Day label ("Monday") on which the lorry run was done. */
  lorryDay: string | null;
  /** Item → day label on which the buying limit was last topped up. */
  buyDays: Record<string, string>;
}

/** The weekday ("Monday"), from "Monday, 1 January, Year 0, 7:05 in the morning". */
function day(p: Perception): string {
  return p.time.split(/[ ,]/)[0]!;
}

function fill(item: ItemId): number {
  return ITEMS[item].food?.hunger ?? 0;
}

/**
 * A simple needs-driven resident: eat when hungry, sleep when tired, work the
 * shift, otherwise fish, farm, sell surplus and chat. Owners mind the shop,
 * meet the lorry, cook, hire and pay. Seeded, so a run is repeatable.
 */
export class FakeBrain implements Brain {
  private rng: Rng;
  private mem: Memory;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.mem = { rng: this.rng.state, lorryDay: null, buyDays: {} };
  }

  save(): unknown {
    return { ...this.mem, rng: this.rng.state };
  }

  load(saved: unknown): void {
    const m = saved as Memory;
    this.mem = { ...m, buyDays: { ...m.buyDays } };
    this.rng.state = m.rng;
  }

  decide(p: Perception): Intent | null {
    if (p.job?.onShift) {
      if (p.refused) return null;
      const haggle = p.priceOffers[0];
      if (haggle) return { verb: haggle.cents >= 0.8 * haggle.asking ? 'agree' : 'refuse', from: haggle.from, item: haggle.item };
      return this.onShift(p);
    }
    if (p.refused) return this.rng.chance(0.5) ? null : this.wander(p);
    // An owner meets the lorry even when hungry: an empty shop feeds nobody.
    return (p.business ? this.lorry(p) : null) ?? this.needs(p) ?? this.offers(p) ?? this.shift(p)
      ?? (p.business ? this.owner(p) : this.seeker(p));
  }

  private carrying(p: Perception, item: ItemId): number {
    return p.carrying.find((c) => c.item === item)?.qty ?? 0;
  }

  private needs(p: Perception): Intent | null {
    if (HUNGRY.has(p.hunger)) {
      const food = p.carrying.filter((c) => ITEMS[c.item].food).sort((a, b) => fill(b.item) - fill(a.item));
      if (food.length) return { verb: 'eat', item: food[0]!.item };
      if (p.business?.atShop) {
        const own = p.business.stock.filter((s) => ITEMS[s.item].food).sort((a, b) => fill(b.item) - fill(a.item));
        if (own.length) return { verb: 'buy', item: own[0]!.item };
      }
      if (p.shop?.staffed) {
        const options = p.shop.sells
          .filter((s) => ITEMS[s.item].food && (s.stock ?? 0) > 0 && s.price <= p.money)
          .sort((a, b) => fill(b.item) / b.price - fill(a.item) / a.price);
        if (options.length) return { verb: 'buy', item: options[0]!.item };
      }
      // Round the shops once, in turn (the kopitiam, the stall, the provision shop), rather than back and forth.
      const next = FOOD_ROUND.slice(FOOD_ROUND.findIndex(([place]) => place === p.place) + 1).find(([, least]) => p.money >= least);
      if (next) return this.go(p, next[0]);
      if (!p.business && !p.job && p.money < 20) {
        // Broke and hungry: ask someone nearby to lend a little, now and then, unless they've just said no.
        const near = p.people.filter((x) => x.doing !== 'asleep');
        const turnedDown = p.recent.slice(-4).some((t) => / won't lend you /.test(t));
        if (near.length && !turnedDown && this.rng.chance(0.3)) return { verb: 'borrow', to: this.rng.pick(near).name, money: '50¢' };
      }
      // Nothing to eat anywhere: an owner too goes and catches something.
      if (!p.business || p.place === 'the provision shop') return this.goFish(p);
    }
    if (p.energy === 'exhausted' || (p.energy === 'tired' && p.hour >= 20)) {
      return p.atHome ? { verb: 'sleep' } : { verb: 'walk_to', where: 'home' };
    }
    return null;
  }

  private offers(p: Perception): Intent | null {
    // A price offered at the counter: taken if it's within a fifth of the asking price.
    const haggle = p.priceOffers[0];
    if (haggle) return { verb: haggle.cents >= 0.8 * haggle.asking ? 'agree' : 'refuse', from: haggle.from, item: haggle.item };
    const trade = p.trades[0];
    if (trade) return { verb: this.rng.chance(0.6) ? 'accept_trade' : 'decline_trade', from: trade.from };
    const ask = p.moneyOffers[0];
    if (ask) {
      // A loan asked for: an owner with over $30 says yes half the time. Offered a loan or an IOU: yes when short.
      if (ask.kind === 'borrow') return { verb: p.business && p.money > 3000 && this.rng.chance(0.5) ? 'agree' : 'refuse', from: ask.from };
      return { verb: ask.kind === 'iou' || p.money < 50 ? 'agree' : 'refuse', from: ask.from };
    }
    const owe = p.debts.owe.find((d) => p.people.some((x) => x.name === d.name));
    if (owe && p.money > 200) return { verb: 'repay', to: owe.name, money: Math.min(owe.cents, p.money) };
    const job = p.jobOffers[0];
    if (job && !p.job && p.people.some((x) => x.name === job.from)) return { verb: 'accept_job', from: job.from };
    return null;
  }

  private shift(p: Perception): Intent | null {
    const j = p.job;
    if (!j || j.doneToday) return null;
    if (p.hour >= j.startHour && p.hour < j.startHour + j.hours) {
      return j.atWork ? { verb: 'work_shift' } : this.go(p, j.place);
    }
    if (p.hour === j.startHour - 1 && p.minute >= 30 && !j.atWork) return this.go(p, j.place);
    return null;
  }

  /** Mid-shift: kopitiam hands keep the dishes coming; elsewhere just mind the shop. */
  private onShift(p: Perception): Intent | null {
    if (p.job!.place !== 'the kopitiam') return null;
    return this.kitchen(p.job!.stock);
  }

  private kitchen(stock: { item: ItemId; qty: number }[]): Intent | null {
    const n = (i: ItemId) => stock.find((s) => s.item === i)?.qty ?? 0;
    if (n('kopi') < 5 && n('coffee') > 0 && n('water') > 0) return { verb: 'cook', item: 'kopi' };
    if (n('fish porridge') + n('vegetable rice') < 4) {
      if (n('fish') > 0 && n('rice') > 0 && n('water') > 0) return { verb: 'cook', item: 'fish porridge' };
      if (n('vegetables') > 0 && n('rice') > 0) return { verb: 'cook', item: 'vegetable rice' };
    }
    return null;
  }

  /** Prices the owner hasn't set yet, and buying limits that ran out on an earlier day. */
  private pricing(p: Perception): Intent | null {
    const b = p.business!;
    const habit = HABITS[b.place];
    if (!habit) return null;
    for (const [item, [lo, hi]] of Object.entries(habit.sell) as [ItemId, [number, number]][]) {
      if (!b.sells.some((s) => s.item === item)) return { verb: 'set_price', item, price: this.rng.int(lo, hi) };
    }
    for (const [item, [lo, hi]] of Object.entries(habit.buy) as [ItemId, [number, number]][]) {
      const tag = b.buys.find((s) => s.item === item);
      const spent = tag?.wants === 0 && this.mem.buyDays[item] !== day(p);
      if ((!tag || spent) && p.money >= 1500) {
        this.mem.buyDays[item] = day(p);
        return { verb: 'set_price', item, price: this.rng.int(lo, hi), side: 'buy', limit: this.rng.int(6, 12) };
      }
    }
    return null;
  }

  /** At lorry time, once a day: meet the lorry and top the shop up. */
  private lorry(p: Perception): Intent | null {
    const b = p.business!;
    const lorryTime = (p.hour === 6 && p.minute >= 30) || (p.hour === 7 && p.minute < 25);
    if (!lorryTime || this.mem.lorryDay === day(p)) return null;
    if (p.place !== 'the lorry stop') return this.go(p, 'the lorry stop');
    if (!p.lorry?.here) return null;
    const want = RESTOCK[b.place] ?? {};
    for (const [item, target] of Object.entries(want) as [ItemId, number][]) {
      const have = b.stock.find((s) => s.item === item)?.qty ?? 0;
      const price = p.lorry.sells.find((s) => s.item === item)?.price ?? Infinity;
      const qty = Math.min(target * 2 - have, Math.floor((p.money - 1500) / price));
      if (have < target && qty > 0) return { verb: 'order_stock', item, qty };
    }
    this.mem.lorryDay = day(p);
    return null;
  }

  private owner(p: Perception): Intent | null {
    const b = p.business!;
    if (!b.atShop) return this.go(p, b.place);
    const priced = this.pricing(p);
    if (priced) return priced;

    for (const o of b.owed) {
      if (!p.people.some((x) => x.name === o.name)) continue;
      if (o.cents <= p.money) return { verb: 'pay_wages', to: o.name };
      if (p.money >= 2) return { verb: 'pay_wages', to: o.name, money: Math.floor(p.money / 2) };
    }
    if (b.place === 'the kopitiam') {
      const cooking = this.kitchen(b.stock);
      if (cooking) return cooking;
    }
    const asked = p.recent.slice(-4).map((t) => /^(.+) says to you: "Any work going/.exec(t)?.[1]).find(Boolean);
    const here = p.people.filter((x) => x.doing !== 'asleep').map((x) => x.name);
    // Hires whoever asked once five travellers have left unserved today: a true need, seen.
    if (b.workers.length === 0 && b.today.left >= 5 && p.money >= 1500 && p.hour >= 7 && p.hour <= 15 && asked && here.includes(asked)) {
      const start = Math.min(p.hour + 1, 14);
      return { verb: 'offer_job', to: asked, wage: this.rng.int(18, 26) * 10, startHour: start, hours: 4 };
    }
    if (b.workers.length > 0 && p.money < 800) {
      const w = b.workers.find((n) => here.includes(n));
      if (w) return { verb: 'let_go', who: w };
    }
    if (p.actions.some((a) => a.verb === 'sweep') && this.rng.chance(0.1)) return { verb: 'sweep' };
    const soldOut = b.sells.find((s) => s.stock === 0 && this.rng.chance(0.02));
    if (soldOut) return { verb: 'set_price', item: soldOut.item, price: soldOut.price + 1 };
    if (here.length && this.rng.chance(0.05)) return { verb: 'say', text: this.rng.pick(CHATTER), to: this.rng.pick(here) };
    return null;
  }

  private seeker(p: Perception): Intent | null {
    // Someone serving alone with people waiting: ask the owner for work, once in a while.
    const busy = p.busyShop;
    if (!p.job && busy?.alone && !p.recent.slice(-6).some((t) => t.startsWith(`You say to ${busy.owner}: "You look busy`))) {
      return { verb: 'say', to: busy.owner, text: 'You look busy. Any work going, boss?' };
    }
    const water = this.carrying(p, 'water');
    if (water > 0 && p.shop?.staffed && p.shop.buys.some((b) => b.item === 'water')) return { verb: 'sell', item: 'water', qty: water };
    if (water > 0 && p.place !== 'the kopitiam' && this.rng.chance(0.3)) return this.go(p, 'the kopitiam');
    const fish = this.carrying(p, 'fish');
    const veg = this.carrying(p, 'vegetables');
    const surplus = fish >= 2 || veg >= 3;
    if (surplus) {
      const sellItem: ItemId = fish >= 2 ? 'fish' : 'vegetables';
      const qty = sellItem === 'fish' ? fish - 1 : veg - 1;
      if (p.lorry?.here) return { verb: 'sell', item: sellItem, qty };
      if ((p.hour === 6 && p.minute >= 45) || (p.hour === 7 && p.minute < 15)) {
        if (p.place !== 'the lorry stop') return this.go(p, 'the lorry stop');
        return null;
      }
      if (p.shop?.staffed && p.shop.buys.some((b) => b.item === sellItem)) return { verb: 'sell', item: sellItem, qty };
      if (p.place !== 'the wet-market stall' && p.place !== 'the kopitiam') {
        return this.go(p, this.rng.chance(0.6) ? 'the wet-market stall' : 'the kopitiam');
      }
    }
    const ready = p.beds.some((b) => b.ready);
    const dry = p.beds.some((b) => !b.wateredToday);
    if (ready || dry) {
      if (p.place !== 'the farm plot') return this.go(p, 'the farm plot');
      return { verb: ready ? 'harvest' : 'water' };
    }
    if (p.place === 'the farm plot' && p.beds.length < 2 && (p.freeBeds ?? 0) > 0) return { verb: 'plant' };
    if (!p.job) {
      const boss = p.people.find((x) => x.doing === 'minding the shop');
      if (boss && this.rng.chance(0.3)) return { verb: 'say', text: 'Any work going, boss?', to: boss.name };
    }
    // Nets first, once a day, then fishing.
    if (p.place === 'the jetty' && !p.netsMended && this.rng.chance(0.5)) return { verb: 'mend_nets' };
    if (p.place === 'the jetty' && this.rng.chance(0.85)) return { verb: 'fish' };
    // At the well: a pail to sell to the kopitiam.
    if (p.place === 'the well' && this.carrying(p, 'water') === 0 && this.rng.chance(0.5)) return { verb: 'fetch_water' };
    if (p.place === 'the notice board') {
      if (this.rng.chance(0.2)) return { verb: 'pin_note', text: `${p.name} looking for work. Can fish, can farm.` };
      if (this.rng.chance(0.5)) return { verb: 'read_notice_board' };
    }
    return this.wander(p);
  }

  /** Walk to a place they know; if they've not found it yet, set off exploring. */
  private go(p: Perception, where: string): Intent {
    if (p.placesYouKnow.includes(where)) return { verb: 'walk_to', where };
    return { verb: 'walk_to', where: this.rng.pick(['north', 'south', 'east', 'west', 'south', 'south']) };
  }

  private goFish(p: Perception): Intent {
    return p.place === 'the jetty' ? { verb: 'fish' } : this.go(p, 'the jetty');
  }

  private wander(p: Perception): Intent | null {
    const roll = this.rng.next();
    if (p.business) return p.business.atShop ? null : this.go(p, p.business.place);
    if (roll < 0.45) return this.goFish(p);
    if (roll < 0.6) return p.place === 'the farm plot' ? null : this.go(p, 'the farm plot');
    if (roll < 0.7) return p.place === 'the notice board' ? { verb: 'read_notice_board' } : this.go(p, 'the notice board');
    if (roll < 0.85) {
      const shop = this.rng.pick(['the kopitiam', 'the provision shop', 'the wet-market stall']);
      return p.place === shop ? null : this.go(p, shop);
    }
    const chat = p.people.filter((x) => x.doing !== 'asleep');
    if (chat.length) return { verb: 'say', text: this.rng.pick(CHATTER), to: this.rng.pick(chat).name };
    return null;
  }
}
