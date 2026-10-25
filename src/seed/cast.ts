import type { SkillId } from '../sim/skills.ts';
import type { Goods } from '../sim/state.ts';
import type { Cents } from '../sim/money.ts';

/**
 * The thirteen residents (owner-approved, 2026-10-25; see docs/design/cast.md):
 * 3 owners, 7 job-seekers, and Mak Esah, Aminah and Hassan, who live with
 * family. Their cards (cards.ts) say who they are; this fixes their roles,
 * businesses, homes and the people they already know on day one.
 */
export interface CastMember {
  name: string;
  role: 'owner' | 'seeker' | 'family';
  business?: 'kopitiam' | 'provision-shop' | 'market-stall';
  /** People they already know when the town starts (family and old friends). */
  knows: readonly string[];
  /**
   * A newcomer knows only these places besides home. Everyone else who has
   * lived here knows every place in the kampung (owner, 2026-10-25: places are
   * known; how things work is discovered).
   */
  places?: readonly string[];
  /** Whose house they live in, if not one of their own (owner, 2026-10-25: no imaginary family). */
  livesWith?: string;
  /**
   * Their share of the hourly thinking allowance, if not a full one (owner,
   * 2026-10-25: about half for Mak Esah and the children; the town's cap is
   * unchanged). See src/mind/budget.ts.
   */
  allowance?: number;
  /** What they call someone in their family, as families do ("Mak"). */
  calls?: Readonly<Record<string, string>>;
  /** What they're already good at, by level 2–5 (owner, 2026-10-25; docs/design/skills.md). */
  skills?: Readonly<Partial<Record<SkillId, number>>>;
}

export const CAST: readonly CastMember[] = [
  { name: 'Ah Huat', role: 'owner', business: 'kopitiam', knows: ['Ah Seng', 'Rahim'], skills: { cooking: 5 } },
  { name: 'Mdm Tan', role: 'owner', business: 'provision-shop', knows: ['Mei Ling'] },
  { name: 'Rahim', role: 'owner', business: 'market-stall', knows: ['Fatimah', 'Ah Huat', 'Aminah', 'Hassan'], skills: { fishing: 5 } },
  { name: 'Mei Ling', role: 'seeker', knows: ['Mdm Tan'] },
  { name: 'Ah Kow', role: 'seeker', knows: [], places: ['well', 'kopitiam'], skills: { farming: 2 } },
  { name: 'Siti', role: 'seeker', knows: ['Fatimah', 'Mak Esah'], calls: { Mak: 'Mak Esah' } },
  { name: 'Muthu', role: 'seeker', knows: ['Raju'] },
  { name: 'Ah Seng', role: 'seeker', knows: ['Ah Huat'] },
  { name: 'Fatimah', role: 'seeker', knows: ['Rahim', 'Siti', 'Aminah', 'Hassan'], skills: { farming: 4 } },
  { name: 'Raju', role: 'seeker', knows: ['Muthu'] },
  { name: 'Mak Esah', role: 'family', knows: ['Siti'], livesWith: 'Siti', allowance: 0.5, skills: { cooking: 5 } },
  { name: 'Aminah', role: 'family', knows: ['Fatimah', 'Hassan', 'Rahim'], livesWith: 'Fatimah', allowance: 0.5, calls: { Mak: 'Fatimah' } },
  { name: 'Hassan', role: 'family', knows: ['Fatimah', 'Aminah', 'Rahim'], livesWith: 'Fatimah', allowance: 0.5, calls: { Mak: 'Fatimah' }, skills: { fishing: 2 } },
];

/**
 * Owners start with stock but no prices: every selling and buying price is
 * the owner's own decision, made in play (owner decision, 2026-10-24).
 */
export const SHOP_STOCK: Record<'kopitiam' | 'provision-shop' | 'market-stall', Goods> = {
  kopitiam: { coffee: 3, rice: 4, fish: 2, vegetables: 2, water: 4, kopi: 10, 'fish porridge': 4, 'vegetable rice': 4 },
  'provision-shop': { rice: 20, coffee: 6, bread: 10 },
  'market-stall': { fish: 6, vegetables: 6 },
};

/** Starting purses (spec §2): $5–$20 for job-seekers, $60–$100 for owners; nothing of their own for those who live with family. */
export const START_MONEY: Record<CastMember['role'], [Cents, Cents]> = {
  owner: [6000, 10000],
  seeker: [500, 2000],
  family: [0, 0],
};
