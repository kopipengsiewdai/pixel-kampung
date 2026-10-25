/**
 * The watch page: the pixel town, the story feed, a card for whoever the
 * owner clicks, and replay controls. Read-only: it only listens to the town.
 * Everything residents said or thought is shown as text, never as HTML.
 */
import type { Card, Economy, FeedLine, Hello, MoneyView, PlaceCard, ReplayState, TalkView, Thought, Update, Wiki } from '../types.ts';
import { startGame, type TownScene } from './scene.ts';
import { looksForeign } from '../foreign.ts';

const FEED_KEPT = 200;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) if (k !== null) e.append(k);
  return e;
}

function money(cents: number): string {
  if (Math.abs(cents) < 100) return `${cents}¢`;
  return `$${Math.floor(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}

let scene: TownScene | null = null;
let msPerMinute = 12_500; // the live town's pace (a game day every five real hours) until the server says otherwise
let latest: Update | null = null;
let selected: string | null = null;
/** The place whose card is open, if a place was clicked rather than a person. */
let selectedPlace: string | null = null;
let replay: ReplayState | null = null;
let seeking = false;
let cardTimer: ReturnType<typeof setTimeout> | null = null;
let lastCardFetch = 0;
let updates = 0;

// The headless page check reads these.
const probe = {
  get updates() { return updates; },
  get drawn() { return scene?.drawn ?? 0; },
  openCard: (id: string) => pick(id),
  /** Where to click on the page to pick a place, clear of anyone in it. */
  placePoint: (id: string) => scene?.screenPointOf(id) ?? null,
  /** What residents are idling at, and how many speech bubbles are showing. */
  liveliness: () => scene?.liveliness() ?? null,
};
(window as unknown as { __kampung: typeof probe }).__kampung = probe;

// ---------------------------------------------------------------- feed

function feedItem(l: FeedLine): HTMLLIElement {
  return el('li', l.notable ? { class: 'notable' } : {}, el('span', { class: 'stamp' }, stampOf(l.t)), said(l.text));
}

// ---------------------------------------------------------------- English

/** Lines in Malay (or anything else) shown in English, asked of the server a batch at a time. Remembered in this browser, if it lets us. */
const ENGLISH_KEY = 'kampung.english';
let english = false;
try {
  english = localStorage.getItem(ENGLISH_KEY) === 'on';
} catch {
  // Off, then.
}
/** English for a line; null when there's none to be had (already English, or not now). */
const englishOf = new Map<string, string | null>();
const asking = new Set<string>();
let askTimer: number | null = null;

/** A line as it should show: in English when that's on and it's to hand (the original on hover). */
function said(text: string, wrap: (t: string) => string = (t) => t): Node | string {
  if (!english || !looksForeign(text)) return wrap(text);
  const got = englishOf.get(text);
  if (got) return el('span', { class: 'english', title: wrap(text) }, wrap(got));
  if (got === undefined && !asking.has(text)) {
    asking.add(text);
    askSoon();
  }
  return wrap(text);
}

function askSoon(): void {
  if (askTimer !== null) return;
  askTimer = window.setTimeout(() => void ask(), 400);
}

async function ask(): Promise<void> {
  const texts = [...asking].slice(0, 60);
  let out: unknown[] = [];
  try {
    const res = await fetch('/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts }) });
    if (res.ok) out = ((await res.json()) as { english?: unknown[] }).english ?? [];
  } catch {
    // Shown as said, then.
  }
  texts.forEach((t, i) => {
    asking.delete(t);
    englishOf.set(t, typeof out[i] === 'string' ? out[i] as string : null);
  });
  askTimer = null;
  drawFeed();
  if (lastCard) renderCard(lastCard);
  if (asking.size) askSoon();
}

function setEnglish(on: boolean): void {
  english = on;
  try {
    localStorage.setItem(ENGLISH_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered, but still shown.
  }
  $('english').setAttribute('aria-pressed', String(on));
  drawFeed();
  if (lastCard) renderCard(lastCard);
}

/** The town's calendar: its 1 January, Year 0 (a Monday), from the server. */
let firstDay = 0;

/** "Mon 07:05" from a game minute, by the kampung's week (as the server's shortStamp). */
function stampOf(t: number): string {
  const day = Math.floor((t + 8 * 60) / 1440);
  const mod = ((t + 8 * 60) % 1440 + 1440) % 1440;
  const name = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(((day - firstDay) % 7) + 7) % 7];
  return `${name} ${String(Math.floor(mod / 60)).padStart(2, '0')}:${String(mod % 60).padStart(2, '0')}`;
}

/** "Monday 1 January, Year 0, 07:05" → "Mon 1 Jan, 07:05". */
function shortClock(clock: string): string {
  return clock.replace(/^(\w{3})\w* (\d+) (\w{3})\w*, Year \d+, /, '$1 $2 $3, ');
}

/** Key moments only (the default), or everything. Remembered in this browser, if it lets us. */
type FeedMode = 'key' | 'all';
const FEED_MODE_KEY = 'kampung.feed';
let feedMode: FeedMode = 'key';
try {
  if (localStorage.getItem(FEED_MODE_KEY) === 'all') feedMode = 'all';
} catch {
  // Storage blocked (a private window): key moments, as by default.
}
/** Every line in hand, oldest first: the latest, and key moments from before them (as the server keeps them). */
let feedLines: FeedLine[] = [];

const shows = (l: FeedLine) => feedMode === 'all' || l.key;

function keep(lines: FeedLine[]): FeedLine[] {
  const out: FeedLine[] = [];
  let keys = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    const recent = lines.length - i <= FEED_KEPT;
    if (recent || (l.key && keys < FEED_KEPT)) out.push(l);
    if (l.key) keys++;
    if (!recent && keys >= FEED_KEPT) break;
  }
  return out.reverse();
}

function drawFeed(): void {
  $('feed').replaceChildren(...feedLines.filter(shows).slice(-FEED_KEPT).reverse().map(feedItem));
  $('feed-key').setAttribute('aria-pressed', String(feedMode === 'key'));
  $('feed-all').setAttribute('aria-pressed', String(feedMode === 'all'));
}

function setFeed(lines: FeedLine[]): void {
  feedLines = keep(lines);
  drawFeed();
}

function addFeed(lines: FeedLine[]): void {
  if (!lines.length) return;
  feedLines = keep([...feedLines, ...lines]);
  const feed = $('feed');
  for (const l of lines) if (shows(l)) feed.prepend(feedItem(l));
  while (feed.children.length > FEED_KEPT) feed.lastElementChild!.remove();
}

function setFeedMode(mode: FeedMode): void {
  feedMode = mode;
  try {
    localStorage.setItem(FEED_MODE_KEY, mode);
  } catch {
    // Not remembered, but still shown.
  }
  drawFeed();
}

function wireFeed(): void {
  $('feed-key').addEventListener('click', () => setFeedMode('key'));
  $('feed-all').addEventListener('click', () => setFeedMode('all'));
  $('english').addEventListener('click', () => setEnglish(!english));
  $('english').setAttribute('aria-pressed', String(english));
  drawFeed();
}

// ---------------------------------------------------------------- roster

function renderRoster(u: Update): void {
  const roster = $('roster');
  const buttons = u.frame.residents.map((r) => {
    const status = r.activity === 'sleeping' ? 'asleep' : r.activity === 'working' ? 'working' : '';
    const b = el('button', { type: 'button', 'aria-pressed': String(r.id === selected), title: `${r.name}: ${r.doing}`, 'data-id': r.id },
      el('span', { class: `dot ${status}` }), r.name);
    b.addEventListener('click', () => pick(r.id));
    return b;
  });
  roster.replaceChildren(...buttons);
}

// ---------------------------------------------------------------- card

/** A need as a small chip: its icon, its word, and a colour for how pressing it is. */
function need(icon: string, word: string, label: string, bad: boolean, worse: boolean): HTMLElement {
  return el('span', { class: `chip need${worse ? ' worse' : bad ? ' bad' : ''}`, title: `${label}: ${word}`, 'aria-label': `${label}: ${word}` }, icon);
}

/** At most `n` items, then a "more" button that shows the rest. */
function some<T>(items: T[], n: number, key: string, show: (x: T) => Node): Node[] {
  const open = expanded.has(key);
  const shown = open ? items : items.slice(0, n);
  const out: Node[] = [el('ul', {}, ...shown.map(show))];
  if (items.length > n) {
    const more = el('button', { type: 'button', class: 'more' }, open ? 'fewer' : `${items.length - n} more`);
    more.addEventListener('click', () => {
      if (open) expanded.delete(key);
      else expanded.add(key);
      if (lastCard) renderCard(lastCard);
    });
    out.push(more);
  }
  return out;
}

function thoughtItem(t: Thought, quote: boolean): HTMLLIElement {
  return el('li', {}, el('span', { class: 'stamp' }, t.stamp), quote ? el('span', { class: 'quote' }, said(t.text, (x) => `“${x}”`)) : said(t.text),
    t.times ? el('span', { class: 'times' }, ` ×${t.times}`) : null);
}

type CardTab = 'plan' | 'thoughts' | 'talk' | 'money';
/** Which tab of a resident's card is open, what it fetched, and which lists are opened out. */
let cardTab: CardTab = 'plan';
let talk: { id: string; view: TalkView | null } | null = null;
let moneyView: { id: string; view: MoneyView | null } | null = null;
let lastCard: Card | null = null;
const expanded = new Set<string>();

async function loadTalk(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/talk/${encodeURIComponent(id)}`);
    const view = res.ok ? await res.json() as TalkView : null;
    if (selected !== id) return;
    talk = { id, view };
  } catch {
    if (selected !== id) return;
    talk = { id, view: null };
  }
  if (lastCard && lastCard.id === id) renderCard(lastCard);
}

async function loadMoney(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/money/${encodeURIComponent(id)}`);
    const view = res.ok ? await res.json() as MoneyView : null;
    if (selected !== id) return;
    moneyView = { id, view };
  } catch {
    if (selected !== id) return;
    moneyView = { id, view: null };
  }
  if (lastCard && lastCard.id === id) renderCard(lastCard);
}

function showTab(tab: CardTab): void {
  cardTab = tab;
  if (tab === 'talk' && selected) {
    talk = null;
    void loadTalk(selected);
  }
  if (tab === 'money' && selected) {
    moneyView = null;
    void loadMoney(selected);
  }
  if (lastCard) renderCard(lastCard);
}

function talkSection(): (Node | null)[] {
  if (!talk || !selected || talk.id !== selected) return [el('p', { class: 'note' }, 'Listening back…')];
  if (!talk.view) return [el('p', { class: 'note' }, "Couldn't fetch their talk just now. Open the tab again to retry.")];
  if (!talk.view.talks.length) return [el('p', { class: 'note' }, 'Nothing said yet.')];
  return talk.view.talks.flatMap((g) => [
    el('h4', {}, `With ${g.with}`),
    el('ul', { class: 'talk' }, ...g.lines.map((l) => el('li', l.mine ? { class: 'mine' } : {},
      el('span', { class: 'stamp' }, l.stamp),
      el('span', { class: 'who' }, `${l.speaker}${l.to ? ` to ${l.to}` : ''}:`),
      el('span', { class: 'quote' }, said(l.text, (x) => `“${x}”`))))),
  ]);
}

/** Money in and out by kind (today and the week), then the entries: shared by the card and the wiki. */
function moneyBlock(m: MoneyView, key: string): Node[] {
  if (!m.kinds.length) return [el('p', { class: 'note' }, 'No money has changed hands this week.')];
  const signed = (c: number) => (c ? money(c) : '');
  const table = el('table', { class: 'money' },
    el('thead', {}, el('tr', {}, ...['', 'Today in', 'Today out', 'Week in', 'Week out'].map((h) => el('th', {}, h)))),
    el('tbody', {}, ...m.kinds.map((k) => el('tr', {},
      el('td', {}, k.label), el('td', {}, signed(k.todayIn)), el('td', {}, signed(k.todayOut)), el('td', {}, signed(k.weekIn)), el('td', {}, signed(k.weekOut))))));
  return [
    el('div', { class: 'scroll' }, table),
    el('h4', {}, 'Every entry'),
    ...some(m.entries, 5, key, (e) => el('li', {}, el('span', { class: 'stamp' }, e.stamp),
      `${e.kind}: ${e.what}, ${e.cents > 0 ? 'from' : 'to'} ${e.with} `,
      el('span', { class: e.cents > 0 ? 'in' : 'out' }, `${e.cents > 0 ? '+' : '−'}${money(Math.abs(e.cents))}`))),
  ];
}

function moneySection(): Node[] {
  if (!moneyView || !selected || moneyView.id !== selected) return [el('p', { class: 'note' }, 'Counting…')];
  if (!moneyView.view) return [el('p', { class: 'note' }, "Couldn't fetch their money just now. Open the tab again to retry.")];
  return moneyBlock(moneyView.view, `money:${selected}`);
}

/** "walking to the jetty, very hungry, rested", with where they are when that isn't already said. */
function nowLine(c: Card): string {
  const where = c.place && !c.doing.includes(c.place) ? ` at ${c.place}` : '';
  return `${c.doing}${where}, ${c.hungerWord}, ${c.energyWord}`;
}

function renderCard(c: Card): void {
  lastCard = c;
  const close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', () => pick(null));
  const tab = (name: CardTab, label: string) => {
    const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(cardTab === name), 'data-tab': name }, label);
    b.addEventListener('click', () => showTab(name));
    return b;
  };
  const parts: (Node | null)[] = [
    el('header', {},
      el('h3', {}, c.name),
      el('span', { class: 'role' }, c.role === 'owner' ? 'shop owner' : c.role === 'family' ? 'lives with family' : 'looking for work'),
      el('span', { class: 'needs' },
        need('🍚', c.hungerWord, 'Hunger', c.hunger >= 450, c.hunger >= 700),
        need('⚡', c.energyWord, 'Energy', c.energy <= 350, c.energy <= 150)),
      el('span', { class: 'cash', title: 'Money in hand' }, money(c.money)),
      close),
    el('p', { class: 'now' }, el('b', {}, 'Now: '), nowLine(c)),
    el('p', { class: 'job' }, el('b', {}, 'Work: '), c.job ?? 'none yet'),
    c.wages.length ? el('p', { class: 'job' }, el('b', {}, 'Wages: '), c.wages.join('; ')) : null,
    c.carrying.length ? el('div', { class: 'chips' }, ...c.carrying.map((x) => el('span', { class: 'chip' }, x.label))) : null,
  ];
  if (c.shop) {
    const key = `shop:${c.id}`;
    const details = el('details', expanded.has(key) ? { class: 'shop', open: '' } : { class: 'shop' },
      el('summary', {}, `${c.shop.name}: ${c.minding ?? 'nobody minding it'}`),
      el('dl', {},
        el('dt', {}, 'Stock'), el('dd', {}, c.shop.stock.map((x) => x.label).join(', ') || 'empty'),
        el('dt', {}, 'Sells'), el('dd', {}, c.shop.sells.join(', ') || 'no prices yet'),
        el('dt', {}, 'Buying'), el('dd', {}, c.shop.buys.join(', ') || 'not buying anything right now')));
    // The card is redrawn every second: it stays open or shut as the owner left it.
    details.addEventListener('toggle', () => { if (details.open) expanded.add(key); else expanded.delete(key); });
    parts.push(details);
  }
  parts.push(el('nav', { class: 'tabs', role: 'tablist' }, tab('plan', 'Plan'), tab('thoughts', 'Thoughts'), tab('talk', 'Talk'), tab('money', 'Money')));
  if (cardTab === 'plan') {
    parts.push(c.plan ? el('p', { class: 'quote' }, said(c.plan.text, (x) => `“${x}”`)) : el('p', { class: 'note' }, c.mindNote ?? 'No plan for today.'));
  } else if (cardTab === 'thoughts') {
    const thoughts = c.thoughts.slice().reverse();
    if (thoughts.length) parts.push(...some(thoughts, 3, `thoughts:${c.id}`, (t) => thoughtItem(t, true)));
    else parts.push(el('p', { class: 'note' }, c.mindNote ?? 'Nothing yet.'));
    if (c.noticed.length) parts.push(el('h4', {}, 'Lately noticed'), ...some(c.noticed.slice().reverse(), 3, `noticed:${c.id}`, (t) => thoughtItem(t, false)));
  } else if (cardTab === 'talk') {
    parts.push(...talkSection());
  } else {
    parts.push(...moneySection());
  }
  showCard(parts);
}

/** Shows the card (on a phone, a full-screen sheet over the page). */
function showCard(parts: (Node | null)[]): void {
  const card = $('card');
  card.replaceChildren(...parts.filter((p): p is Node => p !== null));
  card.hidden = false;
  document.body.classList.add('sheet');
}

function placeCardView(c: PlaceCard): void {
  const close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', () => pickPlace(null));
  const list = (items: string[], none: string) => (items.length ? items.join(', ') : none);
  const parts: (Node | null)[] = [
    el('header', {}, el('h3', {}, c.name), close),
    el('dl', {}, el('dt', {}, 'Here now'), el('dd', {}, list(c.here, 'nobody'))),
  ];
  if (c.home) parts.push(el('dl', {}, el('dt', {}, 'Home of'), el('dd', {}, c.home.of ?? 'nobody')));
  if (c.shop) {
    parts.push(el('dl', {},
      el('dt', {}, 'Owner'), el('dd', {}, c.shop.owner),
      el('dt', {}, 'Minding the shop'), el('dd', {}, c.shop.serving ?? 'nobody right now'),
      el('dt', {}, 'Workers'), el('dd', {}, list(c.shop.workers, 'none')),
      el('dt', {}, 'Stock'), el('dd', {}, list(c.shop.stock.map((x) => x.label), 'empty')),
      el('dt', {}, 'Sells'), el('dd', {}, list(c.shop.sells, 'no prices yet')),
      el('dt', {}, 'Buying from others'), el('dd', {}, list(c.shop.buys, 'not buying anything right now')),
    ));
  }
  if (c.notes) {
    parts.push(el('h4', {}, 'Notes pinned'));
    parts.push(c.notes.length
      ? el('ul', {}, ...c.notes.map((n) => el('li', {}, el('span', { class: 'stamp' }, n.stamp), `${n.author}: `, el('span', { class: 'quote' }, `“${n.text}”`))))
      : el('p', { class: 'note' }, 'The board is bare.'));
  }
  if (c.beds) {
    parts.push(el('h4', {}, 'Beds'));
    parts.push(el('ul', {}, ...c.beds.map((b) => el('li', {}, `Bed ${b.n}: `, b.who ? `${b.who}'s ${b.growing}, ${b.status}` : b.status))));
  }
  if (c.fishing) parts.push(el('dl', {}, el('dt', {}, 'Fishing'), el('dd', {}, list(c.fishing, 'nobody'))));
  if (c.lorry) {
    parts.push(el('dl', {},
      el('dt', {}, 'The lorry'), el('dd', {}, c.lorry.next),
      el('dt', {}, 'It sells'), el('dd', {}, list(c.lorry.sells, 'nothing')),
      el('dt', {}, 'It buys'), el('dd', {}, list(c.lorry.buys, 'nothing')),
    ));
  }
  parts.push(el('footer', {}, "Owner's view. Nothing on this card ever reaches a resident."));
  showCard(parts);
}

let cardAsked = 0;

async function refreshCard(): Promise<void> {
  if (selectedPlace) {
    const id = selectedPlace;
    const ask = ++cardAsked;
    lastCardFetch = Date.now();
    try {
      const res = await fetch(`/api/place/${encodeURIComponent(id)}`);
      const card = res.ok ? await res.json() as PlaceCard : null;
      if (card && ask === cardAsked && selectedPlace === id) placeCardView(card);
    } catch {
      // As for a resident's card: the next update asks again.
    }
    return;
  }
  if (!selected) return;
  const id = selected;
  const ask = ++cardAsked;
  lastCardFetch = Date.now();
  try {
    const res = await fetch(`/api/resident/${encodeURIComponent(id)}`);
    const card = res.ok ? await res.json() as Card : null;
    // Only the newest answer counts, and only while that resident is still picked.
    if (card && ask === cardAsked && selected === id) renderCard(card);
  } catch {
    // The stream's own error notice covers a lost server; the next update asks again.
  }
}

/** Card refreshes at most once a second while the town moves. */
function scheduleCard(): void {
  if ((!selected && !selectedPlace) || cardTimer) return;
  const wait = Math.max(0, 1000 - (Date.now() - lastCardFetch));
  cardTimer = setTimeout(() => {
    cardTimer = null;
    void refreshCard();
  }, wait);
}

function pick(id: string | null): void {
  if (id !== selected) {
    cardTab = 'plan';
    talk = null;
    moneyView = null;
    lastCard = null;
    expanded.clear();
  }
  selected = id;
  selectedPlace = null;
  scene?.selectPlace(null);
  scene?.select(id);
  for (const b of $('roster').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  if (!id) {
    $('card').hidden = true;
    document.body.classList.remove('sheet');
    return;
  }
  void refreshCard();
}

/** Opens a place's card (and closes any resident's). */
function pickPlace(id: string | null): void {
  pick(null);
  selectedPlace = id;
  scene?.selectPlace(id);
  if (!id) return;
  void refreshCard();
}

/** A finger moving further than this (CSS pixels) is panning the map, not tapping it. */
const DRAG_PX = 10;
/** The press now ending was a pan: it picks nothing. */
let dragged = false;

/** On a phone: the map at twice the size inside its own box, to pan with a finger; and back. */
function wireZoom(): void {
  const zoom = $('zoom');
  zoom.addEventListener('click', () => {
    const map = $('map');
    const on = map.classList.toggle('zoomed');
    zoom.setAttribute('aria-pressed', String(on));
    zoom.textContent = on ? '−' : '+';
    scene?.refit();
    if (on) {
      map.scrollLeft = (map.scrollWidth - map.clientWidth) / 2;
      map.scrollTop = (map.scrollHeight - map.clientHeight) / 2;
    }
    scene?.moved();
  });
  // Taps land where they look, however the page or the zoomed map has scrolled: the map measures where
  // the canvas is as each press starts and ends (before the town hears of it), and on every scroll.
  const map = $('map');
  for (const type of ['touchstart', 'touchend', 'mousedown', 'mouseup']) map.addEventListener(type, () => scene?.moved(), { capture: true, passive: true });
  // A finger that moves (or whose touch the browser takes over to scroll) is panning, not picking.
  let from: { x: number; y: number } | null = null;
  map.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    from = t ? { x: t.clientX, y: t.clientY } : null;
    dragged = false;
  }, { capture: true, passive: true });
  map.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (from && t && Math.hypot(t.clientX - from.x, t.clientY - from.y) > DRAG_PX) dragged = true;
  }, { capture: true, passive: true });
  map.addEventListener('touchcancel', () => { dragged = true; }, { capture: true, passive: true });
  map.addEventListener('mousedown', () => { dragged = false; }, { capture: true, passive: true });
  map.addEventListener('scroll', () => scene?.moved(), { passive: true });
  window.addEventListener('scroll', () => scene?.moved(), { passive: true });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (wikiOpen) showWiki(false);
  else pick(null);
});

// ---------------------------------------------------------------- the wiki

type WikiTab = 'people' | 'places' | 'how' | 'economy' | 'news';
let wikiTab: WikiTab = 'people';
let wikiOpen = false;

/** Changelog text with its **bold** and `code` shown as such, and links as their words; never as HTML. */
function richText(text: string): (Node | string)[] {
  const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  return plain.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => {
    if (part.startsWith('**') && part.endsWith('**')) return el('strong', {}, part.slice(2, -2));
    if (part.startsWith('`') && part.endsWith('`')) return el('code', {}, part.slice(1, -1));
    return part;
  });
}

function bars(rows: { name: string; cents: number }[], none: string): HTMLElement {
  if (!rows.length) return el('p', { class: 'note' }, none);
  const top = Math.max(1, ...rows.map((r) => r.cents));
  return el('ul', { class: 'bars' }, ...rows.map((r) => {
    const fill = el('i');
    fill.style.width = `${Math.round((100 * r.cents) / top)}%`;
    return el('li', {}, el('span', {}, r.name), el('span', { class: 'bar' }, fill), el('span', { class: 'v' }, money(r.cents)));
  }));
}

function economyView(e: Economy): Node[] {
  const table = el('table', {},
    el('thead', {}, el('tr', {}, ...['Day', 'GDP', 'Value traded', 'Sales', 'Money in town', 'Money in', 'Money out'].map((h) => el('th', {}, h)))),
    el('tbody', {}, ...e.days.slice().reverse().map((d) => el('tr', {},
      el('td', {}, d.label), el('td', {}, d.gdp < 0 ? `−${money(-d.gdp)}` : money(d.gdp)), el('td', {}, money(d.traded)), el('td', {}, String(d.sales)),
      el('td', {}, money(d.moneyEnd)), el('td', {}, money(d.moneyIn)), el('td', {}, money(d.moneyOut))))));
  const spend = e.spend
    ? `${money(Math.round(e.spend.usd * 100))} of the ${money(Math.round(e.spend.cap * 100))} daily cap (US dollars, by the real day).`
    : 'No thinking for real in this town (free fake brains): nothing spent.';
  return [
    el('p', { class: 'note' }, 'From the saved events. GDP is what the town made: sales in town and to the lorry, less what it ordered in off the lorry. Value traded counts every sale. Money in and out is across the edge of town: the lorry pays in, orders off it go out.'),
    el('h4', {}, 'Day by day'),
    el('div', { class: 'scroll' }, table),
    el('h4', {}, 'Earned today'), bars(e.income, 'Nobody has earned anything yet today.'),
    el('h4', {}, 'Money in hand'), bars(e.wealth, 'Nobody here.'),
    el('h4', {}, 'Jobs'),
    e.jobs.length ? el('ul', {}, ...e.jobs.map((j) => el('li', {}, `${j.name}: ${j.job}`))) : el('p', { class: 'note' }, 'Nobody works for anybody yet.'),
    el('h4', {}, 'Debts'),
    e.debts
      ? el('div', {}, el('p', {}, `${money(e.debts.total)} owed in all.`), el('ul', {}, ...e.debts.list.map((d) => el('li', {}, `${d.debtor} owes ${d.creditor} ${money(d.cents)}`))))
      : el('p', { class: 'note' }, 'Nobody owes anybody.'),
    el('h4', {}, 'Money by shop and by resident'),
    el('p', { class: 'note' }, 'Open one to see its money by kind, today and this week, and every entry.'),
    ...e.accounts.map((a) => {
      const body = el('div', {}, el('p', { class: 'note' }, 'Counting…'));
      const d = el('details', { class: 'account', 'data-account': a.id }, el('summary', {}, a.name), body);
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        void fetch(`/api/money/${encodeURIComponent(a.id)}`)
          .then((r) => (r.ok ? r.json() as Promise<MoneyView> : null))
          .then((m) => body.replaceChildren(...(m ? moneyBlock(m, `wiki:${a.id}`) : [el('p', { class: 'note' }, 'Nothing to show.')])))
          .catch(() => body.replaceChildren(el('p', { class: 'note' }, "Couldn't reach the town just now.")));
      });
      return d;
    }),
    el('h4', {}, 'Ledger check'), el('p', {}, e.audit ?? 'Not checked yet.'),
    el('h4', {}, 'Thinking spend today'), el('p', {}, spend),
  ];
}

function wikiView(w: Wiki): Node[] {
  switch (wikiTab) {
    case 'people': return [
      ...w.people.map((p) => el('div', { class: 'entry' },
        el('h3', {}, `${p.name}${p.age !== null ? `, ${p.age}` : ''}`),
        el('dl', {},
          el('dt', {}, 'Is'), el('dd', {}, p.role),
          el('dt', {}, 'Home'), el('dd', {}, p.home ?? 'nowhere yet'),
          el('dt', {}, 'Work'), el('dd', {}, p.job ?? 'none yet'),
          el('dt', {}, 'Money'), el('dd', {}, money(p.money)),
          el('dt', {}, 'Family and old friends'), el('dd', {}, p.ties.length ? p.ties.map((t) => `${t.name} (${t.how})`).join(', ') : 'nobody here, at first'),
          el('dt', {}, 'Skills'), el('dd', {}, p.skills.length
            ? p.skills.map((s) => `${s.skill}: ${s.level}${s.toNext !== null ? ` (${s.toNext}% to the next)` : ''}${s.rusty ? ', rusty' : ''}`).join('; ')
            : 'a novice at everything, so far'),
        ),
        p.personality ? el('p', { class: 'quote' }, `${p.personality} Wants ${p.want}; worries ${p.worry}.`) : null)),
      el('p', { class: 'note' }, 'Households and marriages will show here once the kampung has them.'),
    ];
    case 'places': return w.places.map((p) => el('div', { class: 'entry' },
      el('h3', {}, p.name),
      el('p', {}, p.use),
      p.owner ? el('dl', {}, el('dt', {}, 'Owner'), el('dd', {}, p.owner), el('dt', {}, 'Workers'), el('dd', {}, p.workers.join(', ') || 'none')) : null,
      p.home !== null ? el('dl', {}, el('dt', {}, 'Home of'), el('dd', {}, p.home)) : null));
    case 'how': return w.how.flatMap((sec) => [el('h3', {}, sec.title), ...sec.paras.map((t) => el('p', {}, t))]);
    case 'economy': return economyView(w.economy);
    case 'news': return [
      el('p', {}, `Running v${w.version}.`),
      ...w.news.flatMap((n) => [el('h3', {}, n.title), el('ul', {}, ...n.lines.map((l) => el('li', {}, ...richText(l))))]),
    ];
  }
}

/** The wiki as fetched when it was opened: tabs switch over it without asking the town again. */
let wikiData: Wiki | null = null;

function drawWiki(): void {
  for (const b of $('wiki-tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String((b as HTMLElement).dataset.wiki === wikiTab));
  if (!wikiData) return;
  $('wiki-version').textContent = `v${wikiData.version}`;
  $('wiki-body').replaceChildren(...wikiView(wikiData).filter((n): n is Node => n !== null));
}

async function loadWiki(): Promise<void> {
  try {
    const res = await fetch('/api/wiki');
    if (!res.ok || !wikiOpen) return;
    const w = await res.json() as Wiki;
    if (!wikiOpen) return;
    wikiData = w;
    drawWiki();
  } catch {
    $('wiki-body').replaceChildren(el('p', { class: 'note' }, "Couldn't reach the town just now. Close the wiki and open it again to retry."));
  }
}

/** Opens the wiki (fetching it once) or closes it, moving focus in and back out. */
function showWiki(open: boolean): void {
  wikiOpen = open;
  $('wiki').hidden = !open;
  document.body.classList.toggle('sheet', open || !$('card').hidden);
  if (open) {
    wikiData = null;
    $('wiki-body').replaceChildren(el('p', { class: 'note' }, 'Opening…'));
    drawWiki();
    void loadWiki();
    $('wiki-close').focus();
  } else {
    $('wiki-open').focus();
  }
}

function wireWiki(): void {
  $('wiki-open').addEventListener('click', () => showWiki(true));
  $('wiki-close').addEventListener('click', () => showWiki(false));
  for (const b of $('wiki-tabs').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      wikiTab = (b as HTMLElement).dataset.wiki as WikiTab;
      drawWiki();
    });
  }
}

// ---------------------------------------------------------------- replay controls

async function control(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/replay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) showReplay(await res.json() as ReplayState);
}

function showReplay(r: ReplayState): void {
  replay = r;
  $('replay').hidden = false;
  $('play').textContent = r.paused ? '▶' : '❚❚';
  const speed = $<HTMLSelectElement>('speed');
  if (![...speed.options].some((o) => Number(o.value) === r.speed)) speed.append(el('option', { value: String(r.speed) }, `${r.speed}×`));
  speed.value = String(r.speed);
  const seek = $<HTMLInputElement>('seek');
  seek.min = String(r.start);
  seek.max = String(r.end);
  if (!seeking) seek.value = String(r.t);
}

async function loadTrials(current: string): Promise<void> {
  const res = await fetch('/api/replay');
  if (!res.ok) return;
  const { trials } = await res.json() as { trials: { name: string }[] };
  const sel = $<HTMLSelectElement>('trial');
  sel.replaceChildren(...trials.map((t) => el('option', t.name === current ? { value: t.name, selected: '' } : { value: t.name }, t.name)));
  sel.hidden = trials.length < 2;
}

function wireReplay(): void {
  $('play').addEventListener('click', () => { if (replay) void control({ paused: !replay.paused }); });
  $<HTMLSelectElement>('speed').addEventListener('change', (e) => { void control({ speed: Number((e.target as HTMLSelectElement).value) }); });
  const seek = $<HTMLInputElement>('seek');
  seek.addEventListener('input', () => { seeking = true; });
  seek.addEventListener('change', () => {
    seeking = false;
    void control({ t: Number(seek.value) });
  });
  $<HTMLSelectElement>('trial').addEventListener('change', (e) => {
    void fetch('/api/replay/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: (e.target as HTMLSelectElement).value }) });
  });
}

// ---------------------------------------------------------------- the stream

function onHello(h: Hello): void {
  msPerMinute = h.msPerMinute;
  $('mode').textContent = h.label;
  document.title = `Pixel Kampung · ${h.label}`;
  const notice = $('notice');
  notice.hidden = !h.notice;
  notice.textContent = h.notice ?? '';
  firstDay = h.calendar.firstDay;
  if (h.replay) {
    showReplay(h.replay);
    void loadTrials(h.replay.file);
  }
  setFeed(h.feed);
  const first: Update = { frame: h.frame, feed: [], snap: true };
  $('version').textContent = `v${h.version}`;
  $('map').style.setProperty('--map-aspect', `${h.layout.w} / ${h.layout.h}`);
  if (!scene) scene = startGame($('stage'), h.layout, { onPick: (id) => { if (!dragged) pick(id); }, onPickPlace: (id) => { if (!dragged) pickPlace(id); } });
  onUpdate(first);
}

function onUpdate(u: Update): void {
  updates++;
  latest = u;
  if (u.msPerMinute) msPerMinute = u.msPerMinute;
  if (u.replay) showReplay(u.replay);
  // The full date, and a short one for a phone's header ("Mon 1 Jan, 07:05").
  $('clock').replaceChildren(el('span', { class: 'long' }, u.frame.clock), el('span', { class: 'short' }, shortClock(u.frame.clock)));
  if (u.resetFeed) setFeed(u.feed);
  else addFeed(u.feed);
  renderRoster(u);
  scene?.apply(u, msPerMinute);
  scheduleCard();
}

function connect(): void {
  const es = new EventSource('/api/stream');
  es.addEventListener('hello', (e) => {
    $('notice').hidden = true;
    onHello(JSON.parse((e as MessageEvent<string>).data) as Hello);
  });
  es.addEventListener('update', (e) => onUpdate(JSON.parse((e as MessageEvent<string>).data) as Update));
  es.addEventListener('reset', () => location.reload());
  es.addEventListener('error', () => {
    if (!latest) return;
    const notice = $('notice');
    notice.hidden = false;
    notice.textContent = 'Lost touch with the town. Trying again…';
  });
}

wireReplay();
wireZoom();
wireFeed();
wireWiki();
connect();
