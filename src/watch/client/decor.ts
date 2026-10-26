/**
 * Where the town's buildings, props and plants stand, in tiles, fitted to the
 * one v1 map (src/sim/map.ts). Purely for looks: nothing here changes where
 * anyone can walk. Plants keep off the lines residents usually walk.
 */
export interface Prop {
  /** 'k': our kampung atlas; 'p': the CC0 pack atlas. */
  atlas: 'k' | 'p';
  frame: string;
  /** Top-left corner, in tiles (may be fractional). */
  x: number;
  y: number;
}

/** Shop fronts and fixtures, drawn with their top-left on these tiles. */
export const BUILDINGS: readonly Prop[] = [
  { atlas: 'k', frame: 'kopitiam', x: 2, y: 6 },
  { atlas: 'k', frame: 'provision-shop', x: 14, y: 6 },
  { atlas: 'k', frame: 'market-stall', x: 25, y: 6 },
  { atlas: 'k', frame: 'well', x: 22, y: 6 },
  { atlas: 'k', frame: 'notice-board', x: 11, y: 5 },
  { atlas: 'k', frame: 'lorry-sign', x: 34, y: 5.5 },
];

export const PROPS: readonly Prop[] = [
  // Kopitiam tables and stools out front.
  { atlas: 'p', frame: 'stool', x: 2, y: 10 }, { atlas: 'p', frame: 'table', x: 3, y: 10 }, { atlas: 'p', frame: 'stool', x: 4, y: 10 },
  { atlas: 'p', frame: 'stool', x: 7, y: 10 }, { atlas: 'p', frame: 'table', x: 8, y: 10 }, { atlas: 'p', frame: 'stool', x: 9, y: 10 },
  { atlas: 'p', frame: 'pot', x: 2, y: 11 }, { atlas: 'p', frame: 'barrel', x: 9, y: 11 },
  // Provision shop: crates and sacks.
  { atlas: 'p', frame: 'crate', x: 14, y: 9 }, { atlas: 'p', frame: 'sack', x: 15, y: 9 }, { atlas: 'p', frame: 'crate', x: 20, y: 9 },
  { atlas: 'p', frame: 'barrel', x: 20, y: 10 }, { atlas: 'p', frame: 'sack', x: 14, y: 10 },
  // Wet-market stall: crates of produce.
  { atlas: 'p', frame: 'crate', x: 25, y: 9 }, { atlas: 'p', frame: 'crate', x: 30, y: 9 }, { atlas: 'p', frame: 'pot', x: 26, y: 9 },
  // By the jetty.
  { atlas: 'p', frame: 'barrel', x: 30, y: 21 }, { atlas: 'p', frame: 'crate', x: 33, y: 21 },
];

export const PLANTS: readonly Prop[] = [
  // Coconut palms along the beach.
  { atlas: 'k', frame: 'palm-0', x: 0, y: 19 }, { atlas: 'k', frame: 'palm-1', x: 4.5, y: 19.5 }, { atlas: 'k', frame: 'palm-0', x: 9, y: 19 },
  { atlas: 'k', frame: 'palm-1', x: 15, y: 19.5 }, { atlas: 'k', frame: 'palm-0', x: 21, y: 19 }, { atlas: 'k', frame: 'palm-1', x: 24.5, y: 19.5 },
  { atlas: 'k', frame: 'palm-0', x: 35, y: 19.5 }, { atlas: 'k', frame: 'palm-1', x: 38, y: 19 },
  // Shade trees and bushes in the open ground.
  { atlas: 'p', frame: 'tree', x: 16, y: 12 }, { atlas: 'p', frame: 'big-tree', x: 21, y: 12.5 }, { atlas: 'p', frame: 'tree', x: 27, y: 12 },
  { atlas: 'p', frame: 'tree', x: 35, y: 11 }, { atlas: 'p', frame: 'big-tree', x: 37, y: 14 }, { atlas: 'p', frame: 'tree', x: 34, y: 16 },
  { atlas: 'p', frame: 'bush', x: 18, y: 15 }, { atlas: 'p', frame: 'bush', x: 25, y: 15 }, { atlas: 'p', frame: 'bush', x: 1, y: 12 },
  { atlas: 'p', frame: 'tree', x: 10, y: 12 },
  // Banana plants and ferns by the houses and the farm.
  { atlas: 'k', frame: 'banana', x: 0, y: 2 }, { atlas: 'k', frame: 'banana', x: 39, y: 2 }, { atlas: 'k', frame: 'banana', x: 13.8, y: 19 },
  { atlas: 'p', frame: 'fern-0', x: 1, y: 14 }, { atlas: 'p', frame: 'fern-1', x: 12, y: 14 }, { atlas: 'p', frame: 'fern-0', x: 30, y: 16 },
  { atlas: 'p', frame: 'fern-1', x: 33, y: 13 },
  // Flowers and tufts.
  { atlas: 'p', frame: 'flower', x: 19, y: 13 }, { atlas: 'p', frame: 'flowers', x: 24, y: 17 }, { atlas: 'p', frame: 'flower', x: 29, y: 13 },
  { atlas: 'p', frame: 'flowers', x: 36, y: 18 }, { atlas: 'p', frame: 'tuft', x: 17, y: 18 },
  { atlas: 'p', frame: 'tuft', x: 3, y: 13 }, { atlas: 'p', frame: 'rock', x: 38, y: 11 }, { atlas: 'p', frame: 'flowers', x: 33, y: 10 },
];

/** Which pack character each of the default cast wears (people.png columns, in cast order), then Mr Lim. */
export const PEOPLE_ORDER = ['ah-huat', 'mdm-tan', 'rahim', 'mei-ling', 'ah-kow', 'siti', 'muthu', 'ah-seng', 'fatimah', 'raju', 'mak-esah', 'aminah', 'hassan', 'mr-lim', 'miss-de-souza'];

/** Farm bed n (1–8): its top-left tile. Beds are 2×2, four across and two down the plot. */
export function bedTile(n: number): { x: number; y: number } {
  const i = n - 1;
  return { x: 2 + (i % 4) * 3, y: 15 + Math.floor(i / 4) * 3 };
}
