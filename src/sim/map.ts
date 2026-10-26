/**
 * The kampung: one 40×30 tile map. Houses along the top, the shops below
 * them, the farm plot to the south-west, the beach and sea at the bottom, and
 * the jetty running out over the water.
 */
export const MAP_W = 40;
export const MAP_H = 30;

export type Tile = 'grass' | 'path' | 'sand' | 'sea' | 'jetty' | 'floor' | 'field';

export type PlaceKind =
  | 'house' | 'kopitiam' | 'provision_shop' | 'market_stall'
  | 'jetty' | 'farm' | 'well' | 'notice_board' | 'lorry_stop' | 'village_head' | 'village_kitchen' | 'school';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface Place {
  id: string;
  kind: PlaceKind;
  /** In-world name; houses are named after whoever lives there. */
  name: string;
  rect: Rect;
  /** Where you stand when you go there. */
  spot: Point;
}

function place(id: string, kind: PlaceKind, name: string, rect: Rect, spot?: Point): Place {
  return {
    id, kind, name, rect,
    spot: spot ?? { x: rect.x + Math.floor(rect.w / 2), y: rect.y + Math.floor(rect.h / 2) },
  };
}

const HOUSES: Place[] = Array.from({ length: 10 }, (_, i) =>
  place(`house-${i + 1}`, 'house', `attap house ${i + 1}`, { x: 1 + 4 * i, y: 1, w: 3, h: 2 }));

export const PLACES: readonly Place[] = [
  ...HOUSES,
  place('kopitiam', 'kopitiam', 'the kopitiam', { x: 2, y: 6, w: 8, h: 6 }),
  place('notice-board', 'notice_board', 'the notice board', { x: 11, y: 6, w: 2, h: 1 }, { x: 11, y: 6 }),
  place('provision-shop', 'provision_shop', 'the provision shop', { x: 14, y: 6, w: 7, h: 5 }),
  place('well', 'well', 'the well', { x: 22, y: 6, w: 2, h: 2 }, { x: 22, y: 6 }),
  place('market-stall', 'market_stall', 'the wet-market stall', { x: 25, y: 6, w: 6, h: 4 }),
  place('lorry-stop', 'lorry_stop', 'the lorry stop', { x: 34, y: 6, w: 5, h: 4 }),
  place('farm', 'farm', 'the farm plot', { x: 2, y: 15, w: 11, h: 6 }),
  place('jetty', 'jetty', 'the jetty', { x: 31, y: 22, w: 2, h: 7 }, { x: 31, y: 27 }),
  // Mr Lim's house (households-build.md): the top row is all homes, so it stands in the open ground below.
  place('village-head', 'village_head', "the village head's house", { x: 22, y: 15, w: 3, h: 2 }),
  // The shared village kitchen (subsistence.md "Where cooking happens"), below Mr Lim's path: built through his odd jobs.
  place('village-kitchen', 'village_kitchen', 'the village kitchen', { x: 26, y: 17, w: 3, h: 3 }),
  // The schoolhouse (school.md): open ground by the footpath, near the village head's house.
  place('schoolhouse', 'school', 'the schoolhouse', { x: 14, y: 12, w: 4, h: 3 }),
];

export const PLACE_BY_ID: ReadonlyMap<string, Place> = new Map(PLACES.map((p) => [p.id, p]));

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

const GRID: Tile[][] = buildGrid();

function buildGrid(): Tile[][] {
  const g: Tile[][] = Array.from({ length: MAP_H }, (_, y) =>
    Array.from({ length: MAP_W }, (): Tile => (y >= 24 ? 'sea' : y >= 21 ? 'sand' : 'grass')));
  const set = (x: number, y: number, t: Tile) => { g[y]![x] = t; };
  const hLine = (y: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) set(x, y, 'path'); };
  const vLine = (x: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) set(x, y, 'path'); };

  // Main footpath past the houses, with a stub to each door.
  hLine(4, 1, 38);
  for (const h of HOUSES) set(h.rect.x + 1, 3, 'path');
  // Stubs down to the shops, the well, the notice board and the lorry stop.
  for (const x of [5, 11, 17, 22, 27, 36]) set(x, 5, 'path');
  // South to the farm plot, and down to the beach and the jetty.
  vLine(13, 5, 18);
  vLine(32, 5, 21);
  // Up to the village head's house.
  hLine(16, 25, 31);

  for (const p of PLACES) {
    const t: Tile = p.kind === 'jetty' ? 'jetty' : p.kind === 'farm' ? 'field' : 'floor';
    for (let y = p.rect.y; y < p.rect.y + p.rect.h; y++) {
      for (let x = p.rect.x; x < p.rect.x + p.rect.w; x++) set(x, y, t);
    }
  }
  return g;
}

export function tileAt(x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return GRID[y]![x]!;
}

export function isWalkable(x: number, y: number): boolean {
  const t = tileAt(x, y);
  return t !== null && t !== 'sea';
}

export function placeAt(x: number, y: number): Place | null {
  for (const p of PLACES) if (inRect(p.rect, x, y)) return p;
  return null;
}

export function inPlace(p: Place, pt: Point): boolean {
  return inRect(p.rect, pt.x, pt.y);
}

/** Chebyshev distance in tiles. */
export function distance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

const STEPS: readonly Point[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

/**
 * Shortest walk from a to b, excluding a. Footpaths cost 1 and open ground 2,
 * so people keep to the paths. Dial's algorithm; deterministic tie-breaks.
 * Null if b can't be reached.
 */
export function findPath(a: Point, b: Point): Point[] | null {
  if (!isWalkable(b.x, b.y)) return null;
  if (a.x === b.x && a.y === b.y) return [];
  const idx = (x: number, y: number) => y * MAP_W + x;
  const dist = new Array<number>(MAP_W * MAP_H).fill(Infinity);
  const prev = new Array<number>(MAP_W * MAP_H).fill(-1);
  const buckets: number[][] = [[idx(a.x, a.y)]];
  dist[idx(a.x, a.y)] = 0;
  const goal = idx(b.x, b.y);
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let k = 0; k < bucket.length; k++) {
      const cur = bucket[k]!;
      if (dist[cur] !== d) continue;
      if (cur === goal) {
        const out: Point[] = [];
        for (let c = goal; c !== idx(a.x, a.y); c = prev[c]!) out.push({ x: c % MAP_W, y: Math.floor(c / MAP_W) });
        return out.reverse();
      }
      const cx = cur % MAP_W;
      const cy = Math.floor(cur / MAP_W);
      for (const s of STEPS) {
        const nx = cx + s.x;
        const ny = cy + s.y;
        if (!isWalkable(nx, ny)) continue;
        const t = tileAt(nx, ny);
        const nd = d + (t === 'path' || t === 'jetty' || t === 'floor' ? 1 : 2);
        const ni = idx(nx, ny);
        if (nd < dist[ni]!) {
          dist[ni] = nd;
          prev[ni] = cur;
          (buckets[nd] ??= []).push(ni);
        }
      }
    }
  }
  return null;
}

const GLYPH: Record<Tile, string> = { grass: '.', path: '=', sand: ':', sea: '~', jetty: '#', floor: ' ', field: ',' };
const PLACE_GLYPH: Record<PlaceKind, string> = {
  house: 'H', kopitiam: 'K', provision_shop: 'P', market_stall: 'M', jetty: 'J',
  farm: 'F', well: 'W', notice_board: 'N', lorry_stop: 'L', village_head: 'V', village_kitchen: 'C', school: 'S',
};

/** ASCII view of the map, one character per tile. */
export function renderMap(): string {
  const rows = GRID.map((row) => row.map((t) => GLYPH[t]));
  for (const p of PLACES) rows[p.rect.y]![p.rect.x] = PLACE_GLYPH[p.kind];
  return rows.map((r) => r.join('')).join('\n');
}
