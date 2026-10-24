/**
 * Day and night on the watch page: a tint laid over the map, by Singapore
 * minute of the day. Shared by the server's tests and the browser client.
 */
export interface Light {
  /** 0xRRGGBB */
  color: number;
  /** 0 is plain daylight. */
  alpha: number;
}

const NIGHT = 0x0b1a3a;
/** [minute of day, colour, alpha], in order, wrapping at midnight. */
const KEYS: readonly [number, number, number][] = [
  [0, NIGHT, 0.55],
  [5 * 60, NIGHT, 0.55],
  [6 * 60, 0x3a2a5a, 0.35],
  [6 * 60 + 45, 0xff9a50, 0.15],
  [7 * 60 + 30, 0xffd8a0, 0],
  [17 * 60 + 30, 0xffd8a0, 0],
  [18 * 60 + 45, 0xff8040, 0.18],
  [19 * 60 + 30, 0x40306a, 0.35],
  [20 * 60 + 30, NIGHT, 0.55],
  [24 * 60, NIGHT, 0.55],
];

function mix(a: number, b: number, f: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * f) << shift;
  }
  return out;
}

export function lightAt(minuteOfDay: number): Light {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  for (let i = 1; i < KEYS.length; i++) {
    const [m1, c1, a1] = KEYS[i]!;
    if (m > m1) continue;
    const [m0, c0, a0] = KEYS[i - 1]!;
    const f = m1 === m0 ? 0 : (m - m0) / (m1 - m0);
    return { color: mix(c0, c1, f), alpha: Math.round((a0 + (a1 - a0) * f) * 1000) / 1000 };
  }
  return { color: NIGHT, alpha: 0.55 };
}
