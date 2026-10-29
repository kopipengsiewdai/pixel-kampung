/**
 * The shapes of Kampung News as saved and served (docs/design/news.md): kept
 * free of imports so the watch page can share them.
 */
export type Mark = 'meals' | 'hunger' | 'refusals' | 'circles';

export interface BoxRow {
  day: number;
  meals: number;
  perResident: number;
  /** "Name n", for each who ate fewer than 2 times. */
  under2: string[];
  /** null: not known for this day. */
  hunger1000: string[] | null;
  fellIll: string[];
  gotWell: string[];
  refusals: { who: string; text: string; n: number }[];
  circles: number;
  noMoney: string[] | null;
  fund: number | null;
  edgeIn: number;
  edgeOut: number;
  warn: Mark[];
}

export interface Issue {
  n: number;
  publishedMs: number;
  dateline: string;
  fromDay: number;
  toDay: number;
  /** The town was down for part of the stretch. */
  gap: boolean;
  headline: string;
  lead: string;
  reports: { headline: string; text: string }[];
  box: {
    rows: (BoxRow & { date: string })[];
    spend: { day: string; usd: number; cap: number; over: boolean }[];
    ledgerCheck: string | null;
  };
}

export interface IssueSummary { n: number; dateline: string; headline: string; fromDay: number; toDay: number }
