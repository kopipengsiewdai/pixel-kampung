import type { Goods } from '../sim/state.ts';
import type { Cents } from '../sim/money.ts';

/**
 * The ten residents (owner-approved, 2026-10-25; see docs/design/cast.md):
 * 3 owners and 7 job-seekers. Their cards (cards.ts) say who they are; this
 * fixes their roles, businesses and the people they already know on day one.
 */
export interface CastMember {
  name: string;
  role: 'owner' | 'seeker';
  business?: 'kopitiam' | 'provision-shop' | 'market-stall';
  /** People they already know when the town starts (family and old friends). */
  knows: readonly string[];
}

export const CAST: readonly CastMember[] = [
  { name: 'Ah Huat', role: 'owner', business: 'kopitiam', knows: ['Ah Seng', 'Rahim'] },
  { name: 'Mdm Tan', role: 'owner', business: 'provision-shop', knows: ['Mei Ling'] },
  { name: 'Rahim', role: 'owner', business: 'market-stall', knows: ['Fatimah', 'Ah Huat'] },
  { name: 'Mei Ling', role: 'seeker', knows: ['Mdm Tan'] },
  { name: 'Ah Kow', role: 'seeker', knows: [] },
  { name: 'Siti', role: 'seeker', knows: ['Fatimah'] },
  { name: 'Muthu', role: 'seeker', knows: ['Raju'] },
  { name: 'Ah Seng', role: 'seeker', knows: ['Ah Huat'] },
  { name: 'Fatimah', role: 'seeker', knows: ['Rahim', 'Siti'] },
  { name: 'Raju', role: 'seeker', knows: ['Muthu'] },
];

/**
 * Owners start with stock but no prices: every selling and buying price is
 * the owner's own decision, made in play (owner decision, 2026-10-24).
 */
export const SHOP_STOCK: Record<'kopitiam' | 'provision-shop' | 'market-stall', Goods> = {
  kopitiam: { coffee: 3, rice: 4, fish: 2, vegetables: 2, kopi: 10, 'fish porridge': 4, 'vegetable rice': 4 },
  'provision-shop': { rice: 20, coffee: 6, bread: 10 },
  'market-stall': { fish: 6, vegetables: 6 },
};

/** Starting purses (spec §2): $5–$20 for job-seekers, $60–$100 for owners. */
export const START_MONEY: Record<'owner' | 'seeker', [Cents, Cents]> = {
  owner: [6000, 10000],
  seeker: [500, 2000],
};
