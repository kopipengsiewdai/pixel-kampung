import type { Goods } from '../sim/state.ts';
import type { ItemId } from '../sim/items.ts';
import type { Cents } from '../sim/money.ts';

/**
 * Placeholder residents for the demo world. The real cast cards (name, age,
 * personality, a want, a worry) are drafted in milestone 4 and edited by the
 * owner; these only fix the roles: 3 owners and 7 job-seekers.
 */
export interface CastMember {
  name: string;
  role: 'owner' | 'seeker';
  business?: 'kopitiam' | 'provision-shop' | 'market-stall';
}

export const CAST: readonly CastMember[] = [
  { name: 'Ah Huat', role: 'owner', business: 'kopitiam' },
  { name: 'Mdm Tan', role: 'owner', business: 'provision-shop' },
  { name: 'Rahim', role: 'owner', business: 'market-stall' },
  { name: 'Mei Ling', role: 'seeker' },
  { name: 'Ah Kow', role: 'seeker' },
  { name: 'Siti', role: 'seeker' },
  { name: 'Muthu', role: 'seeker' },
  { name: 'Ah Seng', role: 'seeker' },
  { name: 'Fatimah', role: 'seeker' },
  { name: 'Raju', role: 'seeker' },
];

export interface ShopSeed {
  stock: Goods;
  sellPrices: Partial<Record<ItemId, Cents>>;
  buyPrices: Partial<Record<ItemId, Cents>>;
}

/** Owners start with stock and their opening prices. */
export const SHOP_SEEDS: Record<'kopitiam' | 'provision-shop' | 'market-stall', ShopSeed> = {
  kopitiam: {
    stock: { coffee: 3, rice: 4, fish: 2, vegetables: 2, kopi: 10, 'fish porridge': 4, 'vegetable rice': 4 },
    sellPrices: { kopi: 10, 'fish porridge': 35, 'vegetable rice': 30 },
    buyPrices: { fish: 25, vegetables: 15 },
  },
  'provision-shop': {
    stock: { rice: 20, coffee: 6, bread: 10 },
    sellPrices: { rice: 30, coffee: 70, bread: 20 },
    buyPrices: {},
  },
  'market-stall': {
    stock: { fish: 6, vegetables: 6 },
    sellPrices: { fish: 30, vegetables: 20 },
    buyPrices: { fish: 20, vegetables: 12 },
  },
};

/** Starting purses (spec §2): $5–$20 for job-seekers, $60–$100 for owners. */
export const START_MONEY: Record<'owner' | 'seeker', [Cents, Cents]> = {
  owner: [6000, 10000],
  seeker: [500, 2000],
};
