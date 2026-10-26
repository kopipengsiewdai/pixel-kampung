import type { Cents } from './money.ts';

export type ItemId =
  | 'fish' | 'vegetables' | 'rice' | 'coffee' | 'bread'
  | 'kopi' | 'fish porridge' | 'vegetable rice' | 'water'
  | 'red snapper' | 'chilli' | 'papaya' | 'sambal kangkong' | 'kerosene' | 'bubur'
  | 'firewood' | 'grilled fish' | 'boiled kangkong' | 'banana' | 'coconut';

export interface ItemDef {
  id: ItemId;
  /** "a fish" / "3 fish": unit words for quantities. */
  one: string;
  many: string;
  aliases: string[];
  /**
   * How much hunger a serving takes away (needs run 0–1000), and energy it gives.
   * Hunger rises about 1,100–1,160 over a day: a proper meal takes off about a
   * third of that (360–380, in the agreed 330–380), a snack 100–220, a drink
   * less (subsistence.md Q2).
   */
  food?: { hunger: number; energy?: number };
  /** In-world reason it can't be eaten as it is. */
  inedible?: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  fish: { id: 'fish', one: 'a fish', many: '{n} fish', aliases: ['fishes'], food: { hunger: 150 } },
  vegetables: {
    id: 'vegetables', one: 'a bunch of vegetables', many: '{n} bunches of vegetables',
    aliases: ['vegetable', 'veg', 'veggies', 'kangkong'], food: { hunger: 100 },
  },
  rice: {
    id: 'rice', one: 'a bag of rice', many: '{n} bags of rice', aliases: ['bag of rice', 'bags of rice'],
    inedible: "You can't eat raw rice. It needs cooking on a stove.",
  },
  coffee: {
    id: 'coffee', one: 'a tin of coffee powder', many: '{n} tins of coffee powder',
    aliases: ['coffee powder', 'kopi powder'], inedible: 'Dry coffee powder? It needs brewing first.',
  },
  bread: { id: 'bread', one: 'a loaf of bread', many: '{n} loaves of bread', aliases: ['loaf', 'loaves'], food: { hunger: 200 } },
  water: {
    id: 'water', one: 'a pail of water', many: '{n} pails of water', aliases: ['pail', 'pails', 'pail of water', 'pails of water'],
    inedible: "You'd want to boil it first.",
  },
  'red snapper': { id: 'red snapper', one: 'a red snapper', many: '{n} red snappers', aliases: ['snapper', 'snappers', 'red snappers', 'ikan merah'], food: { hunger: 220 } },
  chilli: {
    id: 'chilli', one: 'a handful of chillies', many: '{n} handfuls of chillies', aliases: ['chillies', 'chili', 'chilies', 'cili'],
    inedible: 'Chillies on their own? They would burn your mouth.',
  },
  papaya: { id: 'papaya', one: 'a papaya', many: '{n} papayas', aliases: ['papayas', 'betik'], food: { hunger: 150 } },
  'sambal kangkong': {
    id: 'sambal kangkong', one: 'a plate of sambal kangkong', many: '{n} plates of sambal kangkong',
    aliases: ['sambal', 'kangkong belacan'], food: { hunger: 370 },
  },
  bubur: {
    id: 'bubur', one: 'a bowl of bubur', many: '{n} bowls of bubur',
    aliases: ['plain rice', 'rice porridge', 'plain porridge', 'congee', 'boiled rice', 'cooked rice', 'nasi', 'bowl of rice', 'rice bowl', 'nasi putih', 'bubur kosong', 'soft rice', 'plain rice porridge', 'white rice'], food: { hunger: 370 },
  },
  firewood: {
    id: 'firewood', one: 'a bundle of firewood', many: '{n} bundles of firewood', aliases: ['wood', 'kayu api', 'sticks', 'bundle of firewood', 'bundles of firewood'],
    inedible: "You can't eat firewood.",
  },
  'grilled fish': {
    id: 'grilled fish', one: 'a grilled fish', many: '{n} grilled fish', aliases: ['ikan bakar', 'fried fish', 'cooked fish', 'grilled fishes'], food: { hunger: 360 },
  },
  'boiled kangkong': {
    id: 'boiled kangkong', one: 'a plate of boiled kangkong', many: '{n} plates of boiled kangkong',
    aliases: ['kangkong rebus', 'boiled vegetables', 'cooked vegetables', 'cooked kangkong'], food: { hunger: 160 },
  },
  kerosene: {
    id: 'kerosene', one: 'a tin of kerosene', many: '{n} tins of kerosene', aliases: ['minyak tanah', 'lamp oil', 'paraffin'],
    inedible: "Kerosene? That's for the lamp, not for drinking.",
  },
  banana: { id: 'banana', one: 'a hand of bananas', many: '{n} hands of bananas', aliases: ['bananas', 'pisang', 'hand of bananas', 'hands of bananas'], food: { hunger: 150 } },
  coconut: { id: 'coconut', one: 'a coconut', many: '{n} coconuts', aliases: ['coconuts', 'kelapa', 'young coconut'], food: { hunger: 180 } },
  kopi: { id: 'kopi', one: 'a cup of kopi', many: '{n} cups of kopi', aliases: ['kopi o', 'kopi-o', 'kopi susu'], food: { hunger: 50, energy: 120 } },
  'fish porridge': {
    id: 'fish porridge', one: 'a bowl of fish porridge', many: '{n} bowls of fish porridge',
    aliases: ['porridge', 'fish congee'], food: { hunger: 380 },
  },
  'vegetable rice': {
    id: 'vegetable rice', one: 'a plate of vegetable rice', many: '{n} plates of vegetable rice',
    aliases: ['veg rice', 'vegetables rice'], food: { hunger: 380 },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Every name a thing goes by: its own, its other names, and the game's labels ("a cup of kopi", "2 loaves of bread"). */
function namesOf(def: ItemDef): string[] {
  return [def.id, ...def.aliases, def.one.replace(/^(?:a|an)\s+/, ''), def.many.replace(/^\{n\}\s+/, '')];
}

function exactItem(s: string): ItemId | null {
  for (const def of Object.values(ITEMS)) if (namesOf(def).includes(s)) return def.id;
  return null;
}

/** Words around a name that don't change what it is ("my", "two", "fresh"). */
const FILLER = /^(?:a|an|the|some|one|two|three|four|five|six|my|your|our|his|her|their|fresh|small|big|little|\d+)\s+/;

export function findItem(name: string): ItemId | null {
  let s = name.trim().toLowerCase();
  const exact = exactItem(s.replace(/^(?:a|an|the|some|one|\d+)\s+/, ''));
  if (exact) return exact;
  // People say more than the name: "bubur kosong (plain rice porridge)", "water from my pail", "my two fresh fish".
  // Only words that can't change what it is are dropped: anything else ("a cup of coffee", "fried rice") stays unknown.
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s(?:from|in|out of)\s.*$/, '').replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== s;) {
    prev = s;
    s = s.replace(FILLER, '');
  }
  return s ? exactItem(s) : null;
}

export function quantityLabel(item: ItemId, n: number): string {
  const def = ITEMS[item];
  return n === 1 ? def.one : def.many.replace('{n}', String(n));
}

/** What the morning lorry usually sells, per unit (owner's view; Pak Osman sets each day's list in src/sim/osman.ts). Money leaves town. */
export const LORRY_SELLS: Partial<Record<ItemId, Cents>> = {
  rice: 20, coffee: 50, bread: 15, kerosene: 38,
};

/** What the lorry usually buys from anyone, per unit. Money enters town. */
export const LORRY_BUYS: Partial<Record<ItemId, Cents>> = {
  fish: 15, vegetables: 10,
};

export interface Recipe {
  makes: ItemId;
  needs: Partial<Record<ItemId, number>>;
  yields: number;
  /** The cooking level it takes to know it (docs/design/skills.md); none means anyone. */
  level?: number;
}

/** Kopitiam cooking: one batch turns ingredients into servings. */
export const RECIPES: Partial<Record<ItemId, Recipe>> = {
  kopi: { makes: 'kopi', needs: { coffee: 1, water: 1 }, yields: 5 },
  'fish porridge': { makes: 'fish porridge', needs: { fish: 1, rice: 1, water: 1 }, yields: 2 },
  'vegetable rice': { makes: 'vegetable rice', needs: { vegetables: 1, rice: 1 }, yields: 2 },
  // A Skilled cook's dish: ties the kitchen to a Skilled grower's chilli.
  'sambal kangkong': { makes: 'sambal kangkong', needs: { vegetables: 1, chilli: 1 }, yields: 3, level: 3 },
  // Plain rice boiled soft: the dish that turns the lorry's rice into a meal.
  bubur: { makes: 'bubur', needs: { rice: 1, water: 1 }, yields: 3 },
  // Plain cooking anyone can do at home (docs/design/home-cooking.md): two of the raw thing, two servings that fill more.
  'grilled fish': { makes: 'grilled fish', needs: { fish: 2 }, yields: 2 },
  'boiled kangkong': { makes: 'boiled kangkong', needs: { vegetables: 2 }, yields: 2 },
};
