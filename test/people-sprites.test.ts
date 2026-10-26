import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PEOPLE_ORDER } from '../src/watch/client/decor.ts';

/** The alpha of each pixel of an 8-bit RGBA, non-interlaced PNG. */
function alphaOf(path: string): { w: number; h: number; a: (x: number, y: number) => number } {
  const data = readFileSync(path);
  let pos = 8;
  let w = 0, h = 0;
  const idat: Buffer[] = [];
  while (pos < data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.toString('latin1', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      expect([body[8], body[9], body[12]]).toEqual([8, 6, 0]);
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const rows: Uint8Array[] = [];
  let prev = new Uint8Array(stride);
  for (let y = 0, i = 0; y < h; y++, i += stride + 1) {
    const f = raw[i]!;
    const line = Uint8Array.from(raw.subarray(i + 1, i + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4]! : 0, b = prev[x]!, c = x >= 4 ? prev[x - 4]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const add = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[x] = (line[x]! + add) & 255;
    }
    rows.push(line);
    prev = line;
  }
  return { w, h, a: (x, y) => rows[y]![x * 4 + 3]! };
}

describe('the residents walk without blinking', () => {
  it('every resident has a drawn frame for each step of the walk, in each direction', () => {
    const png = alphaOf('assets/art/ninja-adventure/people.png');
    expect(png.w).toBe(64 * PEOPLE_ORDER.length);
    const empty: string[] = [];
    PEOPLE_ORDER.forEach((id, i) => {
      for (let step = 0; step < png.h / 16; step++) {
        for (let dir = 0; dir < 4; dir++) {
          let n = 0;
          for (let y = step * 16; y < step * 16 + 16; y++) for (let x = i * 64 + dir * 16; x < i * 64 + dir * 16 + 16; x++) if (png.a(x, y) > 0) n++;
          if (n < 50) empty.push(`${id} step ${step} direction ${dir}`);
        }
      }
    });
    expect(empty).toEqual([]);
  });
});
