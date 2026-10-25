import type { Cents } from './money.ts';

export type ItemId =
  | 'fish' | 'vegetables' | 'rice' | 'coffee' | 'bread'
  | 'kopi' | 'fish porridge' | 'vegetable rice' | 'water'
  | 'red snapper' | 'chilli' | 'papaya' | 'sambal kangkong' | 'kerosene' | 'bubur';

export interface ItemDef {
  id: ItemId;
  /** "a fish" / "3 fish": unit words for quantities. */
  one: string;
  many: string;
  aliases: string[];
  /** How much hunger a serving takes away (needs run 0–1000), and energy it gives. */
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
    inedible: "You can't eat raw rice. It needs cooking.",
  },
  coffee: {
    id: 'coffee', one: 'a tin of coffee powder', many: '{n} tins of coffee powder',
    aliases: ['coffee powder', 'kopi powder'], inedible: 'Dry coffee powder? It needs brewing first.',
  },
  bread: { id: 'bread', one: 'a loaf of bread', many: '{n} loaves of bread', aliases: ['loaf', 'loaves'], food: { hunger: 250 } },
  water: {
    id: 'water', one: 'a pail of water', many: '{n} pails of water', aliases: ['pail', 'pails', 'pail of water', 'pails of water'],
    inedible: "You'd want to boil it first.",
  },
  'red snapper': { id: 'red snapper', one: 'a red snapper', many: '{n} red snappers', aliases: ['snapper', 'snappers', 'red snappers', 'ikan merah'], food: { hunger: 250 } },
  chilli: {
    id: 'chilli', one: 'a handful of chillies', many: '{n} handfuls of chillies', aliases: ['chillies', 'chili', 'chilies', 'cili'],
    inedible: 'Chillies on their own? They would burn your mouth.',
  },
  papaya: { id: 'papaya', one: 'a papaya', many: '{n} papayas', aliases: ['papayas', 'betik'], food: { hunger: 150 } },
  'sambal kangkong': {
    id: 'sambal kangkong', one: 'a plate of sambal kangkong', many: '{n} plates of sambal kangkong',
    aliases: ['sambal', 'kangkong belacan'], food: { hunger: 300 },
  },
  bubur: {
    id: 'bubur', one: 'a bowl of bubur', many: '{n} bowls of bubur',
    aliases: ['plain rice', 'rice porridge', 'plain porridge', 'congee', 'boiled rice', 'cooked rice', 'nasi', 'bowl of rice', 'rice bowl'], food: { hunger: 300 },
  },
  kerosene: {
    id: 'kerosene', one: 'a tin of kerosene', many: '{n} tins of kerosene', aliases: ['minyak tanah', 'lamp oil', 'paraffin'],
    inedible: "Kerosene? That's for the lamp, not for drinking.",
  },
  kopi: { id: 'kopi', one: 'a cup of kopi', many: '{n} cups of kopi', aliases: [], food: { hunger: 50, energy: 120 } },
  'fish porridge': {
    id: 'fish porridge', one: 'a bowl of fish porridge', many: '{n} bowls of fish porridge',
    aliases: ['porridge', 'fish congee'], food: { hunger: 450 },
  },
  'vegetable rice': {
    id: 'vegetable rice', one: 'a plate of vegetable rice', many: '{n} plates of vegetable rice',
    aliases: ['veg rice', 'vegetables rice'], food: { hunger: 400 },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function findItem(name: string): ItemId | null {
  // Also the game's own labels ("a cup of kopi", "2 loaves of bread"), so residents can name what they see.
  const s = name.trim().toLowerCase().replace(/^(?:a|an|the|some|one|\d+)\s+/, '');
  for (const def of Object.values(ITEMS)) {
    if (def.id === s || def.aliases.includes(s)) return def.id;
    const one = def.one.replace(/^(?:a|an)\s+/, '');
    const many = def.many.replace(/^\{n\}\s+/, '');
    if (s === one || s === many) return def.id;
  }
  return null;
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
};
