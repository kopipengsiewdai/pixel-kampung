/**
 * What the watch page sees. This is the owner's view of the town, with real
 * numbers and ids; none of it ever goes into a resident's prompt. Shared by
 * the server and the browser client, so it holds types only.
 */
import type { FeedLine } from '../feed/feed.ts';
import type { PlaceKind, Point, Rect, Tile } from '../sim/map.ts';

export type { FeedLine };

export interface LayoutPlace {
  id: string;
  kind: PlaceKind;
  /** "the kopitiam", "Siti's house". */
  name: string;
  rect: Rect;
  spot: Point;
}

/** The map, which never changes while the page is open. */
export interface Layout {
  w: number;
  h: number;
  /** tiles[y][x] */
  tiles: Tile[][];
  places: LayoutPlace[];
}

export interface Carried { item: string; qty: number; label: string }

export interface ResidentView {
  id: string;
  name: string;
  role: 'owner' | 'seeker';
  homeId: string;
  x: number;
  y: number;
  /** Tiles stepped through since the last frame, ending at (x, y). Just [(x, y)] when standing still. */
  route: Point[];
  activity: 'walking' | 'fishing' | 'working' | 'sleeping' | null;
  /** Why they're asleep, when they are. */
  sleep: 'night' | 'nap' | 'collapse' | null;
  /** "walking to the jetty", "on shift at the kopitiam". */
  doing: string;
  /** The place they're in, or null out on the footpaths. */
  place: string | null;
  money: number;
  /** 0 is full, 1000 starving. */
  hunger: number;
  /** 1000 is fully rested. */
  energy: number;
  hungerWord: string;
  energyWord: string;
  /** "Works at the kopitiam for Ah Huat, 7am to 11am, $1.20 a shift"; "Runs the kopitiam"; null. */
  job: string | null;
  carrying: Carried[];
}

export interface ShopView {
  id: string;
  name: string;
  ownerId: string;
  stock: Carried[];
  /** "kopi 10¢" */
  sells: string[];
  /** "fish 20¢ (up to 5 more)" */
  buys: string[];
  staffed: boolean;
}

export interface BedView { n: number; planted: boolean; ready: boolean; wateredToday: boolean }

export interface Frame {
  t: number;
  /** "Mon 07:05" */
  stamp: string;
  /** "Monday 2 November, 7:05 in the morning" */
  clock: string;
  minuteOfDay: number;
  lorryHere: boolean;
  residents: ResidentView[];
  shops: ShopView[];
  /** Wages owed, worker by employer. */
  owed: { employerId: string; workerId: string; cents: number }[];
  beds: BedView[];
}

export interface Thought { t: number; stamp: string; kind: string; text: string }

/** Everything the card shows when the owner clicks a resident. */
export interface Card extends ResidentView {
  shop: ShopView | null;
  /** "Owes Siti $1.20", "Owed $1.20 by Ah Huat". */
  wages: string[];
  /** Their plan for today, if their mind made one. */
  plan: Thought | null;
  /** Newest last: thoughts and evening reflections. */
  thoughts: Thought[];
  /** Newest last: what they saw and heard lately. */
  noticed: Thought[];
  /** Set when there's nothing to show, e.g. "Runs on the free fake brain, so has no thoughts to show." */
  mindNote: string | null;
}

/** One push to the page: the latest frame and the feed lines since the last push. */
export interface Update {
  frame: Frame;
  feed: FeedLine[];
  /** Jump straight there (a seek or a new replay) instead of walking. */
  snap?: boolean;
  /** Replace the feed with these lines instead of adding them (after a seek). */
  resetFeed?: boolean;
  /** Real milliseconds a game minute now takes, when it changed. */
  msPerMinute?: number;
  /** The replay's clock, in replay mode. */
  replay?: ReplayState;
}

export interface ReplayState {
  file: string;
  start: number;
  end: number;
  t: number;
  /** Game minutes per real minute: 1 is real time, 60 is a game hour a minute. */
  speed: number;
  paused: boolean;
  /** False for a trial recorded before movements were saved: thoughts only. */
  hasFrames: boolean;
}

export interface Hello {
  mode: 'live' | 'replay';
  /** "Live town", "Fake town at 60×", "Replay of trial-2026-...". */
  label: string;
  /** Real milliseconds one game minute takes right now. */
  msPerMinute: number;
  layout: Layout;
  frame: Frame;
  feed: FeedLine[];
  replay: ReplayState | null;
  /** Shown above the map, e.g. for a thoughts-only replay. */
  notice: string | null;
}
