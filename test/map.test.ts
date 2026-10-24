import { describe, expect, it } from 'vitest';
import { MAP_W, MAP_H, PLACES, findPath, placeAt, renderMap, tileAt, isWalkable } from '../src/sim/map.ts';
import { ITEMS, findItem, quantityLabel, LORRY_SELLS, LORRY_BUYS, RECIPES } from '../src/sim/items.ts';

describe('map', () => {
  it('is about 40×30', () => {
    expect(MAP_W).toBe(40);
    expect(MAP_H).toBe(30);
    const lines = renderMap().split('\n');
    expect(lines).toHaveLength(30);
    for (const l of lines) expect(l).toHaveLength(40);
  });

  it('has every place the spec lists', () => {
    const kinds = PLACES.map((p) => p.kind);
    for (const k of ['kopitiam', 'provision_shop', 'market_stall', 'jetty', 'farm', 'well', 'notice_board', 'lorry_stop']) {
      expect(kinds).toContain(k);
    }
    expect(PLACES.filter((p) => p.kind === 'house')).toHaveLength(10);
  });

  it('every place can be walked to from every other', () => {
    const from = PLACES[0]!.spot;
    for (const p of PLACES) {
      expect(findPath(from, p.spot), p.id).not.toBeNull();
      expect(placeAt(p.spot.x, p.spot.y)?.id).toBe(p.id);
    }
  });

  it('the jetty runs out over the sea', () => {
    const jetty = PLACES.find((p) => p.kind === 'jetty')!;
    const { x, y } = jetty.spot;
    expect(tileAt(x, y)).toBe('jetty');
    expect(tileAt(x - 1, y)).toBe('sea');
    expect(isWalkable(x - 1, y)).toBe(false);
  });

  it('footpaths touch every place', () => {
    for (const p of PLACES) {
      const { x, y, w, h } = p.rect;
      let touches = false;
      for (let i = x - 1; i <= x + w; i++) {
        for (let j = y - 1; j <= y + h; j++) {
          if (tileAt(i, j) === 'path') touches = true;
        }
      }
      expect(touches, p.id).toBe(true);
    }
  });

  it('paths are made of adjacent walkable steps', () => {
    const a = PLACES.find((p) => p.kind === 'house')!.spot;
    const b = PLACES.find((p) => p.kind === 'jetty')!.spot;
    const path = findPath(a, b)!;
    let prev = a;
    for (const s of path) {
      expect(Math.abs(s.x - prev.x) + Math.abs(s.y - prev.y)).toBe(1);
      expect(isWalkable(s.x, s.y)).toBe(true);
      prev = s;
    }
    expect(prev).toEqual(b);
    expect(findPath(a, a)).toEqual([]);
  });
});

describe('items', () => {
  it('finds goods by everyday names', () => {
    expect(findItem('Fish')).toBe('fish');
    expect(findItem('veg')).toBe('vegetables');
    expect(findItem('kopi')).toBe('kopi');
    expect(findItem('cups of kopi')).toBeNull();
    expect(findItem('fish porridge')).toBe('fish porridge');
    expect(findItem('durian')).toBeNull();
  });
  it('labels quantities', () => {
    expect(quantityLabel('fish', 1)).toBe('a fish');
    expect(quantityLabel('fish', 3)).toBe('3 fish');
    expect(quantityLabel('kopi', 2)).toBe('2 cups of kopi');
    expect(quantityLabel('vegetables', 1)).toBe('a bunch of vegetables');
  });
  it('has a lorry price list and recipes made of known goods', () => {
    for (const id of Object.keys(LORRY_SELLS)) expect(ITEMS[id as keyof typeof ITEMS]).toBeDefined();
    expect(Object.keys(LORRY_BUYS).sort()).toEqual(['fish', 'vegetables']);
    for (const r of Object.values(RECIPES)) {
      for (const id of Object.keys(r.needs)) expect(ITEMS[id as keyof typeof ITEMS]).toBeDefined();
    }
  });
});
