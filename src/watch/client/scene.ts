/**
 * The pixel kampung, drawn with Phaser on the Canvas renderer (no GPU
 * needed). The ground is painted once into a render texture; buildings,
 * plants and residents are images sorted by how far down the map they stand.
 * Residents walk the tiles the sim stepped them through, spread over the real
 * time those game minutes take.
 */
import * as Phaser from 'phaser';
import { lightAt } from '../light.ts';
import type { Frame, Layout, LayoutPlace, ResidentView, Update, VillagerView } from '../types.ts';
import { BUILDINGS, PEOPLE_ORDER, PLANTS, PROPS, bedTile, type Prop } from './decor.ts';
import { bubbleText, idleKindOf, idlePose, type IdleKind } from './idle.ts';

const T = 16;
const ZOOM = 2;
const PEOPLE_COLS = 4 * PEOPLE_ORDER.length; // people.png is one column of 4 directions for each, in PEOPLE_ORDER
/** Children are drawn at this size. */
const CHILD_SCALE = 0.75;
const DOWN = 0;
const UP = 1;
const LEFT = 2;
const RIGHT = 3;
/** Real milliseconds a speech bubble stays up. */
const BUBBLE_MS = 4500;
const OVERLAY_DEPTH = 9000;
/** Residents draw above every building and prop (still under the night tint), so nobody is hidden inside a shop. */
const PEOPLE_DEPTH = 5000;
/** A press that moves further than this (in map pixels) before it lifts is a drag, not a tap. */
const TAP_SLOP = 12;

interface Pt { x: number; y: number }

interface Mover {
  view: ResidentView;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  zz: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Text;
  /** The game minute of the line in the bubble, the line as said, and until when (page clock) it shows. */
  saidT: number;
  saidText: string;
  bubbleUntil: number;
  idle: IdleKind;
  look: number;
  /** How far above their feet the name sits (lower for a child). */
  lift: number;
  facing: number;
  pts: Pt[];
  start: number;
  dur: number;
}

/** A village character drawn as a resident is: standing, or walking (no talk, no sleep). */
function villagerAsResident(v: VillagerView): ResidentView {
  return {
    id: v.id, name: v.name, role: 'family', age: 60, child: false, skills: [], homeId: 'village-head', x: v.x, y: v.y,
    route: [{ x: v.x, y: v.y }], activity: /^(on his way|going round)/.test(v.doing) ? 'walking' : null, sleep: null, doing: v.doing,
    place: null, money: 0, hunger: 0, energy: 1000, hungerWord: '', energyWord: '', job: null, carrying: [], said: null,
  } as unknown as ResidentView;
}

export interface TownHooks {
  onPick(id: string): void;
  /** A click on a place (not on anyone in it). */
  onPickPlace(id: string): void;
  /** A line as the page shows it (in English, when that's on and to hand). */
  shown?(text: string): string;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

function tileCentre(p: Pt): Pt {
  return { x: p.x * T + T / 2, y: p.y * T + T - 1 };
}

export class TownScene extends Phaser.Scene {
  private layout: Layout;
  private hooks: TownHooks;
  private movers = new Map<string, Mover>();
  /** Village characters indoors just now: not drawn. */
  private offstage = new Set<string>();
  private ready = false;
  private pending: { u: Update; msPerMinute: number } | null = null;
  private frame: Frame | null = null;
  private overlay!: Phaser.GameObjects.Rectangle;
  private ring!: Phaser.GameObjects.Ellipse;
  private placeRing!: Phaser.GameObjects.Rectangle;
  private lorry!: Phaser.GameObjects.Image;
  private lorryHere = false;
  private beds: { tiles: Phaser.GameObjects.Image[]; crops: Phaser.GameObjects.Image[] }[] = [];
  private glows: { img: Phaser.GameObjects.Image; lit: (f: Frame) => boolean }[] = [];
  private homes = new Map<string, LayoutPlace>();
  private selected: string | null = null;
  private lastT = 0;
  /** Frames drawn since the town arrived (read by the headless page check). */
  drawn = 0;

  constructor(layout: Layout, hooks: TownHooks) {
    super('town');
    this.layout = layout;
    this.hooks = hooks;
  }

  preload(): void {
    this.load.atlas('k', '/assets/art/kampung/kampung.png', '/assets/art/kampung/kampung.json');
    this.load.atlas('p', '/assets/art/ninja-adventure/tiles.png', '/assets/art/ninja-adventure/tiles.json');
    // The column count in the URL: a sheet cached from before a new column can't be drawn with the wrong frames.
    this.load.spritesheet('people', `/assets/art/ninja-adventure/people.png?cols=${PEOPLE_ORDER.length}`, { frameWidth: 16, frameHeight: 16 });
  }

  create(): void {
    const { w, h } = this.layout;
    this.cameras.main.setZoom(ZOOM).centerOn((w * T) / 2, (h * T) / 2).setBackgroundColor('#3a8cc4');
    for (const p of this.layout.places) if (p.kind === 'house') this.homes.set(p.id, p);
    this.paintGround();
    this.placeBuildings();
    this.placeBeds();
    this.placeLorryAndBoat();
    this.overlay = this.add.rectangle(0, 0, w * T, h * T, 0x000000, 0).setOrigin(0, 0).setDepth(OVERLAY_DEPTH);
    this.ring = this.add.ellipse(0, 0, 14, 6).setStrokeStyle(1, 0xf2c14e).setVisible(false);
    this.placeZones();
    this.ready = true;
    if (this.pending) {
      this.apply(this.pending.u, this.pending.msPerMinute);
      this.pending = null;
    }
  }

  private paintGround(): void {
    const { w, h, tiles } = this.layout;
    const rt = this.add.renderTexture(0, 0, w * T, h * T).setOrigin(0, 0).setDepth(-10);
    const floorOf = new Map<string, string>();
    for (const p of this.layout.places) {
      for (let y = p.rect.y; y < p.rect.y + p.rect.h; y++) {
        for (let x = p.rect.x; x < p.rect.x + p.rect.w; x++) floorOf.set(`${x},${y}`, p.kind);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[y]![x]!;
        const r = hash(x, y);
        const px = x * T;
        const py = y * T;
        let atlas: 'k' | 'p' = 'p';
        let frame = r % 5 === 0 ? 'grass-1' : 'grass-0';
        if (t === 'path') frame = 'path';
        else if (t === 'field') frame = 'field';
        else if (t === 'sand') { atlas = 'k'; frame = r % 17 === 0 ? 'sand-2' : `sand-${r % 2}`; }
        else if (t === 'sea') { atlas = 'k'; frame = tiles[y - 1]?.[x] === 'sand' ? 'shore' : `sea-${r % 3}`; }
        else if (t === 'jetty') { atlas = 'k'; frame = tiles[y + 1]?.[x] === 'jetty' ? 'jetty' : 'jetty-end'; }
        else if (t === 'floor') {
          const kind = floorOf.get(`${x},${y}`);
          if (kind === 'lorry_stop') { atlas = 'k'; frame = 'road'; }
          else if (kind !== 'house' && kind !== 'village_head') frame = 'paving';
        }
        // Water under the jetty and the shore, so the planks sit on the sea.
        if (t === 'jetty' && y >= 24) rt.drawFrame('k', `sea-${r % 3}`, px, py);
        rt.drawFrame(atlas, frame, px, py);
      }
    }
  }

  private image(p: Prop): Phaser.GameObjects.Image {
    const img = this.add.image(p.x * T, p.y * T, p.atlas, p.frame).setOrigin(0, 0);
    return img.setDepth(img.y + img.height);
  }

  private placeBuildings(): void {
    // One attap house per home, three styles taking turns.
    let i = 0;
    for (const p of this.layout.places) {
      if (p.kind !== 'house') continue;
      const v = i++ % 3;
      const img = this.add.image(p.rect.x * T, (p.rect.y - 1) * T, 'k', `house-${v}`).setOrigin(0, 0);
      img.setDepth(img.y + img.height - 8);
      const glow = this.add.image(img.x + (v % 2 === 0 ? 9 : 31), img.y + 25, 'k', 'glow')
        .setOrigin(0, 0).setDepth(OVERLAY_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const home = p.id;
      this.glows.push({ img: glow, lit: (f) => f.residents.some((r) => r.homeId === home && this.isInside(r, home) && r.activity !== 'sleeping') });
    }
    // The village head's house: the grandest of the attap houses.
    for (const p of this.layout.places) {
      if (p.kind !== 'village_head') continue;
      const img = this.add.image(p.rect.x * T, (p.rect.y - 1) * T, 'k', 'house-1').setOrigin(0, 0);
      img.setDepth(img.y + img.height - 8);
    }
    for (const b of BUILDINGS) this.image(b);
    for (const p of PROPS) this.image(p);
    for (const p of PLANTS) this.image(p);
    // Lamps at the shops when someone is minding them.
    const shopLamp = (x: number, y: number, shop: string) => {
      const glow = this.add.image(x, y, 'k', 'glow').setOrigin(0, 0).setDepth(OVERLAY_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.glows.push({ img: glow, lit: (f) => f.shops.some((s) => s.id === shop && s.staffed) });
    };
    shopLamp(2 * T + 24, 6 * T + 25, 'kopitiam');
    shopLamp(2 * T + 104, 6 * T + 25, 'kopitiam');
    shopLamp(14 * T + 52, 6 * T + 30, 'provision-shop');
    shopLamp(25 * T + 44, 6 * T + 16, 'market-stall');
  }

  private placeBeds(): void {
    for (let n = 1; n <= 8; n++) {
      const { x, y } = bedTile(n);
      const parts = ['tl', 'tr', 'bl', 'br'];
      const tiles = parts.map((part, k) => this.add.image((x + (k % 2)) * T, (y + Math.floor(k / 2)) * T, 'k', `bed-${part}`).setOrigin(0, 0).setDepth(-5));
      const crops = parts.map((_, k) => {
        const img = this.add.image((x + (k % 2)) * T, (y + Math.floor(k / 2)) * T, 'k', 'kangkong-1').setOrigin(0, 0).setVisible(false);
        return img.setDepth(img.y + T - 4);
      });
      this.beds.push({ tiles, crops });
    }
  }

  private placeLorryAndBoat(): void {
    this.lorry = this.add.image(35 * T, 6 * T + 8, 'k', 'lorry').setOrigin(0, 0).setVisible(false);
    this.lorry.setDepth(this.lorry.y + this.lorry.height);
    const boat = this.add.image(33 * T + 2, 25 * T + 4, 'k', 'sampan').setOrigin(0, 0).setDepth(25 * T + 16);
    this.tweens.add({ targets: boat, y: boat.y + 1, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private isInside(r: ResidentView, homeId: string): boolean {
    const home = this.homes.get(homeId);
    if (!home) return false;
    return r.x >= home.rect.x && r.x < home.rect.x + home.rect.w && r.y >= home.rect.y && r.y < home.rect.y + home.rect.h;
  }

  /** Called with every update from the server. */
  apply(u: Update, msPerMinute: number): void {
    if (!this.ready) {
      this.pending = this.pending
        ? { u: { ...u, snap: this.pending.u.snap || u.snap }, msPerMinute }
        : { u, msPerMinute };
      return;
    }
    const f = u.frame;
    const minutes = Math.max(1, f.t - this.lastT);
    const snap = u.snap || this.lastT === 0 || f.t < this.lastT;
    this.lastT = f.t;
    this.frame = f;
    const now = this.time.now;
    const dur = Math.min(60_000, Math.max(150, minutes * msPerMinute * 0.95));

    // Residents standing on the same tile shuffle apart a little.
    const crowd = new Map<string, number>();
    const spread = new Map<string, Pt>();
    for (const r of f.residents) {
      if (r.activity === 'walking') continue;
      const key = `${r.x},${r.y}`;
      const k = crowd.get(key) ?? 0;
      crowd.set(key, k + 1);
      const offs = [[0, 0], [-6, 1], [6, 1], [-3, -3], [3, -3], [0, 3]][k % 6]!;
      spread.set(r.id, { x: offs[0]!, y: offs[1]! });
    }

    // Village characters (Mr Lim) walk among them, and go in when they're not out.
    this.offstage.clear();
    const villagers = (f.villagers ?? []).map((v) => {
      if (!v.out) this.offstage.add(v.id);
      return villagerAsResident(v);
    });
    for (const r of [...f.residents, ...villagers]) {
      let m = this.movers.get(r.id);
      if (!m) {
        m = this.makeMover(r);
        this.movers.set(r.id, m);
      }
      m.view = r;
      m.idle = idleKindOf(r, this.placeKindAt(r.x, r.y));
      if (r.said && r.said.t !== m.saidT) {
        m.saidT = r.said.t;
        m.saidText = r.said.text;
        m.bubble.setText(bubbleText(this.hooks.shown?.(r.said.text) ?? r.said.text));
        m.bubbleUntil = snap ? 0 : now + BUBBLE_MS;
      }
      const off = spread.get(r.id) ?? { x: 0, y: 0 };
      const end = tileCentre(r);
      end.x += off.x;
      end.y += off.y;
      const here = { x: m.sprite.x, y: m.sprite.y };
      const steps = r.route.map(tileCentre);
      steps[steps.length - 1] = end;
      const first = steps[0] ?? end;
      const far = Math.hypot(first.x - here.x, first.y - here.y) > 4 * T;
      if (snap || far) {
        m.pts = [end];
        m.sprite.setPosition(end.x, end.y);
      } else {
        m.pts = [here, ...steps];
      }
      m.start = now;
      m.dur = dur;
    }

    for (let i = 0; i < f.beds.length; i++) {
      const b = f.beds[i]!;
      const bed = this.beds[i];
      if (!bed) continue;
      bed.tiles.forEach((img, k) => img.setFrame(`bed-${['tl', 'tr', 'bl', 'br'][k]}${b.wateredToday ? '-wet' : ''}`));
      bed.crops.forEach((img) => img.setVisible(b.planted).setFrame(b.ready ? 'kangkong-2' : 'kangkong-1'));
    }

    if (f.lorryHere !== this.lorryHere) {
      this.lorryHere = f.lorryHere;
      const parked = 35 * T;
      this.tweens.killTweensOf(this.lorry);
      if (snap) this.lorry.setVisible(f.lorryHere).setX(parked);
      else if (f.lorryHere) {
        this.lorry.setVisible(true).setX(this.layout.w * T + 8);
        this.tweens.add({ targets: this.lorry, x: parked, duration: Math.min(4000, dur * 2), ease: 'Quad.easeOut' });
      } else {
        this.tweens.add({ targets: this.lorry, x: this.layout.w * T + 8, duration: Math.min(4000, dur * 2), ease: 'Quad.easeIn', onComplete: () => this.lorry.setVisible(false) });
      }
    }

    const light = lightAt(f.minuteOfDay);
    this.overlay.setFillStyle(light.color, light.alpha);
    for (const g of this.glows) g.img.setVisible(light.alpha > 0.2 && g.lit(f));
  }

  private makeMover(r: ResidentView): Mover {
    const idx = PEOPLE_ORDER.indexOf(r.id);
    const look = idx >= 0 ? idx : hash(r.id.length, r.id.charCodeAt(0)) % PEOPLE_ORDER.length;
    const p = tileCentre(r);
    const sprite = this.add.sprite(p.x, p.y, 'people', look * 4).setOrigin(0.5, 1).setScale(r.child ? CHILD_SCALE : 1);
    const lift = r.child ? Math.round(16 * CHILD_SCALE) : 16;
    sprite.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-4, -6, 24, 24), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    sprite.on('pointerup', (ptr: Phaser.Input.Pointer) => { if (this.isTap(ptr)) this.hooks.onPick(r.id); });
    const label = this.add.text(p.x, p.y - lift, r.name, {
      fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '7px', color: '#fdf6e3', stroke: '#1d1d1d', strokeThickness: 2, resolution: 4,
    }).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH + 5);
    const zz = this.add.image(p.x + 6, p.y - 18, 'k', 'zz').setDepth(OVERLAY_DEPTH + 4).setVisible(false);
    const bubble = this.add.text(p.x, p.y - 24, '', {
      fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '7px', color: '#1d1d1d', backgroundColor: '#fdf6e3',
      padding: { x: 3, y: 2 }, resolution: 4, wordWrap: { width: 110 },
    }).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH + 6).setVisible(false);
    return { view: r, sprite, label, zz, bubble, saidT: r.said?.t ?? -1, saidText: r.said?.text ?? '', bubbleUntil: 0, idle: 'none', look, lift, facing: DOWN, pts: [p], start: 0, dur: 1 };
  }

  /** Speech bubbles redrawn as the page now shows their lines (the English button, or English just arrived). */
  refreshBubbles(): void {
    for (const m of this.movers.values()) if (m.saidText) m.bubble.setText(bubbleText(this.hooks.shown?.(m.saidText) ?? m.saidText));
  }

  /** A tap or click, not the end of a finger dragging the zoomed map about. */
  private isTap(ptr: Phaser.Input.Pointer): boolean {
    return ptr.getDistance() < TAP_SLOP;
  }

  /** The canvas moved on the page (the page or the zoomed map scrolled): pointers map from where it is now. */
  moved(): void {
    this.game.scale.updateBounds();
  }

  /** Fits the canvas to its box again (after the box changed size, as for the phone zoom). */
  refit(): void {
    // refresh() reuses the box size it measured last; measure it again first.
    this.game.scale.getParentBounds();
    this.game.scale.refresh();
  }

  select(id: string | null): void {
    this.selected = id;
  }

  /** Every place can be clicked; the zones sit under everyone, so a click on a person still picks the person. */
  private placeZones(): void {
    this.placeRing = this.add.rectangle(0, 0, 1, 1).setOrigin(0, 0).setStrokeStyle(1, 0xf2c14e).setDepth(OVERLAY_DEPTH + 2).setVisible(false);
    for (const p of this.layout.places) {
      const r = this.placeRect(p);
      this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0, 0).setDepth(-5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', (ptr: Phaser.Input.Pointer) => { if (this.isTap(ptr)) this.hooks.onPickPlace(p.id); });
    }
  }

  /** A place's clickable area in world pixels (a house takes in its roof). */
  private placeRect(p: LayoutPlace): { x: number; y: number; w: number; h: number } {
    const roof = p.kind === 'house' || p.kind === 'village_head' ? T : 0;
    return { x: p.rect.x * T, y: p.rect.y * T - roof, w: p.rect.w * T, h: p.rect.h * T + roof };
  }

  selectPlace(id: string | null): void {
    const p = id ? this.layout.places.find((x) => x.id === id) : undefined;
    if (!p) {
      this.placeRing.setVisible(false);
      return;
    }
    const r = this.placeRect(p);
    this.placeRing.setPosition(r.x, r.y).setSize(r.w, r.h).setVisible(true);
  }

  /**
   * Where on the page to click to pick a place, at least `clearance` tiles
   * from anyone (people drift as they idle), or null if there's no such spot
   * right now (for the headless page check).
   */
  screenPointOf(id: string, clearance = 2): { x: number; y: number } | null {
    const p = this.layout.places.find((x) => x.id === id);
    if (!p) return null;
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = p.rect.y; y < p.rect.y + p.rect.h; y++) {
      for (let x = p.rect.x; x < p.rect.x + p.rect.w; x++) {
        const d = Math.min(99, ...[...this.movers.values()].map((m) => Math.hypot(m.sprite.x / T - x - 0.5, m.sprite.y / T - y - 0.5)));
        if (!best || d > best.d) best = { x, y, d };
      }
    }
    if (!best || best.d < clearance) return null;
    const canvas = this.game.canvas.getBoundingClientRect();
    const k = canvas.width / (this.layout.w * T);
    return { x: canvas.left + (best.x + 0.5) * T * k, y: canvas.top + (best.y + 0.5) * T * k };
  }

  /** Where on the page someone is drawn (the middle of their sprite), or null if they're not to be seen. */
  screenPointOfPerson(id: string): { x: number; y: number } | null {
    const m = this.movers.get(id);
    if (!m || !m.sprite.visible) return null;
    const canvas = this.game.canvas.getBoundingClientRect();
    const k = canvas.width / (this.layout.w * T);
    return { x: canvas.left + m.sprite.x * k, y: canvas.top + (m.sprite.y - 8) * k };
  }

  /** The kind of place a tile is in, or null out on the footpaths. */
  private placeKindAt(x: number, y: number): string | null {
    const p = this.layout.places.find((pl) => x >= pl.rect.x && x < pl.rect.x + pl.rect.w && y >= pl.rect.y && y < pl.rect.y + pl.rect.h);
    return p?.kind ?? null;
  }

  /** What everyone is idling at, and how many speech bubbles are up (for the headless page check). */
  liveliness(): { idle: Record<string, number>; bubbles: number } {
    const idle: Record<string, number> = {};
    for (const m of this.movers.values()) idle[m.idle] = (idle[m.idle] ?? 0) + 1;
    return { idle, bubbles: [...this.movers.values()].filter((m) => m.bubble.visible).length };
  }

  update(time: number): void {
    if (!this.frame) return;
    this.drawn++;
    for (const m of this.movers.values()) {
      const r = m.view;
      const f = Math.min(1, (time - m.start) / m.dur);
      const pos = along(m.pts, f);
      const moving = f < 1 && m.pts.length > 1 && pos.dx * pos.dx + pos.dy * pos.dy > 0;
      if (moving) m.facing = Math.abs(pos.dx) > Math.abs(pos.dy) ? (pos.dx > 0 ? RIGHT : LEFT) : (pos.dy > 0 ? DOWN : UP);
      else if (r.activity === 'fishing') m.facing = DOWN;
      // Waiting between thoughts: a small, purely visual bit of life, never away from where they really are.
      const idle = !moving && f >= 1 ? idlePose(m.idle, time, m.look + 1) : null;
      if (idle) {
        pos.x += idle.dx;
        pos.y += idle.dy;
        if (idle.facing !== null) m.facing = idle.facing;
      }
      const row = moving || idle?.stepping ? Math.floor(time / (moving ? 140 : 220)) % 4 : 0;
      const asleep = r.activity === 'sleeping';
      const offstage = this.offstage.has(r.id);
      const inside = offstage || (asleep && this.isInside(r, r.homeId));
      m.sprite.setPosition(pos.x, pos.y).setFrame(row * PEOPLE_COLS + m.look * 4 + m.facing);
      m.bubble.setPosition(pos.x, pos.y - 27).setVisible(!inside && time < m.bubbleUntil);
      m.sprite.setVisible(!inside).setAngle(asleep && !inside ? 90 : 0).setDepth(PEOPLE_DEPTH + pos.y);
      m.label.setPosition(pos.x, pos.y - m.lift).setVisible(!inside || (r.id === this.selected && !offstage));
      const bob = Math.sin(time / 500 + m.look) * 1.5;
      if (inside && !offstage) {
        const home = this.homes.get(r.homeId)!;
        m.zz.setPosition(home.rect.x * T + 18 + (m.look % 3) * 6, home.rect.y * T - 6 + bob);
      } else m.zz.setPosition(pos.x + 6, pos.y - 18 + bob);
      m.zz.setVisible(asleep);
      if (r.id === this.selected) {
        this.ring.setVisible(!inside).setPosition(pos.x, pos.y).setDepth(PEOPLE_DEPTH + pos.y - 1);
      }
    }
    if (!this.selected || !this.movers.has(this.selected)) this.ring.setVisible(false);
    this.unstackLabels();
  }

  /** Nudges name labels up until none overlap, nearest the bottom of the map first. */
  private unstackLabels(): void {
    const labels = [...this.movers.values()].map((m) => m.label).filter((l) => l.visible).sort((a, b) => b.y - a.y);
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const l of labels) {
      const half = l.width / 2;
      let y = l.y;
      for (let tries = 0; tries < 10; tries++) {
        const hit = placed.find((p) => l.x - half < p.x1 && l.x + half > p.x0 && y - l.height < p.y1 && y > p.y0);
        if (!hit) break;
        y = hit.y0;
      }
      l.setY(y);
      placed.push({ x0: l.x - half, x1: l.x + half, y0: y - l.height, y1: y });
    }
  }
}

/** The point a fraction f of the way along a polyline, with the direction of travel there. */
function along(pts: Pt[], f: number): { x: number; y: number; dx: number; dy: number } {
  if (pts.length === 1) return { ...pts[0]!, dx: 0, dy: 0 };
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    lens.push(l);
    total += l;
  }
  if (total === 0) return { ...pts[pts.length - 1]!, dx: 0, dy: 0 };
  let d = f * total;
  for (let i = 0; i < lens.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (d <= lens[i]! || i === lens.length - 1) {
      const k = lens[i]! === 0 ? 1 : Math.min(1, d / lens[i]!);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: b.x - a.x, dy: b.y - a.y };
    }
    d -= lens[i]!;
  }
  return { ...pts[pts.length - 1]!, dx: 0, dy: 0 };
}

export function startGame(parent: HTMLElement, layout: Layout, hooks: TownHooks): TownScene {
  const scene = new TownScene(layout, hooks);
  new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: layout.w * T * ZOOM,
    height: layout.h * T * ZOOM,
    pixelArt: true,
    backgroundColor: '#121b1b',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { target: 30, limit: 30 },
    // Touches are the page's too: only presses on the canvas itself reach the town (not taps on a card
    // sheet over it), and a finger can still scroll the page or pan the zoomed map.
    input: { windowEvents: false, touch: { capture: false } },
    audio: { noAudio: true },
    banner: false,
    scene,
  });
  return scene;
}
