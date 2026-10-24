/** Money is always integer cents. */
export type Cents = number;

export function formatMoney(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  if (abs < 100) return `${sign}${abs}¢`;
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

/** Parses "$1.20", "1.20", "20¢", "20c" or "2" (dollars). Null if it isn't money. */
export function parseMoney(text: string): Cents | null {
  const s = text.trim().toLowerCase();
  let m = /^(\d+)\s*(¢|c|cents?)$/.exec(s);
  if (m) return Number(m[1]);
  m = /^\$?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (m) return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
  return null;
}
