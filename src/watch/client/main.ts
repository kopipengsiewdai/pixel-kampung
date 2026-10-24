/**
 * The watch page: the pixel town, the story feed, a card for whoever the
 * owner clicks, and replay controls. Read-only: it only listens to the town.
 * Everything residents said or thought is shown as text, never as HTML.
 */
import type { Card, FeedLine, Hello, ReplayState, Thought, Update } from '../types.ts';
import { startGame, type TownScene } from './scene.ts';

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
let msPerMinute = 60_000;
let latest: Update | null = null;
let selected: string | null = null;
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
};
(window as unknown as { __kampung: typeof probe }).__kampung = probe;

// ---------------------------------------------------------------- feed

function feedItem(l: FeedLine): HTMLLIElement {
  return el('li', l.notable ? { class: 'notable' } : {}, el('span', { class: 'stamp' }, stampOf(l.t)), l.text);
}

/** "Mon 07:05" from a game minute (Singapore time). */
function stampOf(t: number): string {
  const ms = (t + 8 * 60) * 60_000;
  const d = new Date(ms);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${day} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function setFeed(lines: FeedLine[]): void {
  const feed = $('feed');
  feed.replaceChildren(...lines.slice(-FEED_KEPT).reverse().map(feedItem));
}

function addFeed(lines: FeedLine[]): void {
  if (!lines.length) return;
  const feed = $('feed');
  for (const l of lines) feed.prepend(feedItem(l));
  while (feed.children.length > FEED_KEPT) feed.lastElementChild!.remove();
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

function bar(value: number, cls: string): HTMLElement {
  const pct = Math.max(0, Math.min(100, value / 10));
  const fill = el('i');
  fill.style.width = `${pct}%`;
  return el('span', { class: `bar ${cls}` }, fill);
}

function thoughtItem(t: Thought, quote: boolean): HTMLLIElement {
  return el('li', {}, el('span', { class: 'stamp' }, t.stamp), quote ? el('span', { class: 'quote' }, `“${t.text}”`) : t.text);
}

function renderCard(c: Card): void {
  const card = $('card');
  const close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', () => pick(null));
  const parts: (Node | null)[] = [
    el('header', {}, el('h3', {}, c.name), el('span', { class: 'role' }, c.role === 'owner' ? 'shop owner' : 'looking for work'), close),
    el('dl', {},
      el('dt', {}, 'Doing'), el('dd', {}, c.doing),
      el('dt', {}, 'Where'), el('dd', {}, c.place ?? 'on the footpath'),
      el('dt', {}, 'Money'), el('dd', {}, money(c.money)),
      el('dt', {}, 'Job'), el('dd', {}, c.job ?? 'none yet'),
      el('dt', {}, 'Hunger'), el('dd', {}, bar(c.hunger, 'hunger'), c.hungerWord),
      el('dt', {}, 'Energy'), el('dd', {}, bar(c.energy, 'energy'), c.energyWord),
      el('dt', {}, 'Carrying'), el('dd', {}, c.carrying.length ? c.carrying.map((x) => x.label).join(', ') : 'nothing'),
    ),
  ];
  if (c.shop) {
    parts.push(el('h4', {}, c.shop.name));
    parts.push(el('dl', {},
      el('dt', {}, 'Stock'), el('dd', {}, c.shop.stock.map((x) => x.label).join(', ') || 'empty'),
      el('dt', {}, 'Sells'), el('dd', {}, c.shop.sells.join(', ') || 'no prices yet'),
      el('dt', {}, 'Buys'), el('dd', {}, c.shop.buys.join(', ') || 'nothing'),
      el('dt', {}, 'Open'), el('dd', {}, c.shop.staffed ? 'someone is minding it' : 'nobody minding it'),
    ));
  }
  if (c.wages.length) parts.push(el('h4', {}, 'Wages'), el('ul', {}, ...c.wages.map((w) => el('li', {}, w))));
  if (c.plan) parts.push(el('h4', {}, 'Plan for today'), el('p', { class: 'quote' }, `“${c.plan.text}”`));
  parts.push(el('h4', {}, 'Recent thoughts'));
  if (c.thoughts.length) parts.push(el('ul', {}, ...c.thoughts.slice().reverse().map((t) => thoughtItem(t, true))));
  else parts.push(el('p', { class: 'note' }, c.mindNote ?? 'Nothing yet.'));
  if (c.noticed.length) parts.push(el('h4', {}, 'Lately noticed'), el('ul', {}, ...c.noticed.slice().reverse().map((t) => thoughtItem(t, false))));
  parts.push(el('footer', {}, "Owner's view. Nothing on this card ever reaches a resident."));
  card.replaceChildren(...parts.filter((p): p is Node => p !== null));
  card.hidden = false;
}

let cardAsked = 0;

async function refreshCard(): Promise<void> {
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
  if (!selected || cardTimer) return;
  const wait = Math.max(0, 1000 - (Date.now() - lastCardFetch));
  cardTimer = setTimeout(() => {
    cardTimer = null;
    void refreshCard();
  }, wait);
}

function pick(id: string | null): void {
  selected = id;
  scene?.select(id);
  for (const b of $('roster').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  if (!id) {
    $('card').hidden = true;
    return;
  }
  void refreshCard();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') pick(null);
});

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
  if (h.replay) {
    showReplay(h.replay);
    void loadTrials(h.replay.file);
  }
  setFeed(h.feed);
  const first: Update = { frame: h.frame, feed: [], snap: true };
  if (!scene) scene = startGame($('map'), h.layout, { onPick: (id) => pick(id) });
  onUpdate(first);
}

function onUpdate(u: Update): void {
  updates++;
  latest = u;
  if (u.msPerMinute) msPerMinute = u.msPerMinute;
  if (u.replay) showReplay(u.replay);
  $('clock').textContent = u.frame.clock;
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
connect();
