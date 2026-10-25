import type { Cents } from './money.ts';

export type ItemId =
  | 'fish' | 'vegetables' | 'rice' | 'coffee' | 'bread'
  | 'kopi' | 'fish porridge' | 'vegetable rice';

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

/** What the morning lorry sells to owners, per unit. Money leaves town. */
export const LORRY_SELLS: Partial<Record<ItemId, Cents>> = {
  rice: 20, coffee: 50, bread: 15, fish: 40, vegetables: 25,
};

/** What the lorry buys from anyone, per unit, at low fixed prices. Money enters town. */
export const LORRY_BUYS: Partial<Record<ItemId, Cents>> = {
  fish: 15, vegetables: 10,
};

export interface Recipe {
  makes: ItemId;
  needs: Partial<Record<ItemId, number>>;
  yields: number;
}

/** Kopitiam cooking: one batch turns ingredients into servings. */
export const RECIPES: Partial<Record<ItemId, Recipe>> = {
  kopi: { makes: 'kopi', needs: { coffee: 1 }, yields: 5 },
  'fish porridge': { makes: 'fish porridge', needs: { fish: 1, rice: 1 }, yields: 2 },
  'vegetable rice': { makes: 'vegetable rice', needs: { vegetables: 1, rice: 1 }, yields: 2 },
};
