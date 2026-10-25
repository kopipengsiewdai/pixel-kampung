/// <reference lib="dom" />
/**
 * Headless check of the watch page, in a real browser: `npm run test:page`.
 * Starts the real CLI (fake town on a fast clock, then a replay of a free fake
 * trial), loads the page in Chromium, and checks that it draws the town,
 * opens a resident's card, asks nothing of any server but its own, and that
 * the server stays well inside 500 MB. Set PAGE_SHOT=<dir> to save screenshots.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const home = mkdtempSync(join(tmpdir(), 'kampung-page-'));
const env = { ...process.env, KAMPUNG_HOME: home };
const shots = process.env.PAGE_SHOT;
let browser: Browser;
const children: ChildProcess[] = [];

function freePort(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });
}

/** Runs `npm run watch -- ...` and resolves with the page URL it prints. */
async function watch(...args: string[]): Promise<string> {
  const port = await freePort();
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli/watch.ts', ...args, '--port', String(port)], { env });
  children.push(child);
  return new Promise((ok, fail) => {
    let out = '';
    const timer = setTimeout(() => fail(new Error(`watch didn't start:\n${out}`)), 60_000);
    const read = (b: Buffer) => {
      out += b.toString();
      const m = /Watch the kampung at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out);
      if (m) {
        clearTimeout(timer);
        ok(m[1]!);
      }
    };
    child.stdout!.on('data', read);
    child.stderr!.on('data', read);
    child.on('exit', (code) => fail(new Error(`watch exited (${code}):\n${out}`)));
  });
}

interface Visit { page: Page; foreign: string[]; errors: string[] }

/** A phone held upright, as the owner watches at home (390×844, touch). */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

async function visit(url: string, device: Parameters<Browser['newPage']>[0] = { viewport: { width: 1440, height: 900 } }): Promise<Visit> {
  const page = await browser.newPage(device);
  const origin = new URL(url).origin;
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(`${origin}/`) && !u.startsWith(`blob:${origin}/`) && !u.startsWith('data:')) foreign.push(u);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  // The town has drawn a few dozen frames and heard from the server.
  await page.waitForFunction(() => {
    const k = (window as unknown as { __kampung?: { drawn: number; updates: number } }).__kampung;
    return !!k && k.drawn > 30 && k.updates > 1;
  }, undefined, { timeout: 60_000 });
  return { page, foreign, errors };
}

/** How many different colours the map canvas shows: a blank or failed canvas has one or two. */
async function colours(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('#map canvas') as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    return seen.size;
  });
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  for (const c of children) c.kill();
  rmSync(home, { recursive: true, force: true });
});

describe('the watch page in a browser', () => {
  it('draws the live fake town, opens a card, and calls nothing outside this PC', async () => {
    const url = await watch('--fake', '--speed', '600');
    const { page, foreign, errors } = await visit(url);
    expect(await colours(page)).toBeGreaterThan(40);
    // The feed shows key moments by default; "All" shows everything, and the choice is remembered.
    expect(await page.locator('#feed-key').getAttribute('aria-pressed')).toBe('true');
    await expect.poll(() => page.locator('#feed li').count(), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.locator('#feed-all').click();
    expect(await page.locator('#feed-all').getAttribute('aria-pressed')).toBe('true');
    await expect.poll(() => page.locator('#feed li').count()).toBeGreaterThan(3);
    const all = await page.locator('#feed li').count();
    await page.reload();
    await expect.poll(() => page.locator('#feed-all').getAttribute('aria-pressed')).toBe('true');
    await page.locator('#feed-key').click();
    await expect.poll(() => page.locator('#feed li').count()).toBeLessThanOrEqual(all + 50);
    expect(await page.locator('#feed-key').getAttribute('aria-pressed')).toBe('true');
    await expect.poll(() => page.locator('#clock').textContent()).toMatch(/Monday 1 January, Year 0, \d\d:\d\d/);
    expect(await page.locator('#replay').isVisible()).toBe(false);

    await page.locator('#roster button', { hasText: 'Siti' }).click();
    const card = page.locator('#card');
    await expect.poll(() => card.isVisible()).toBe(true);
    await expect.poll(() => card.textContent()).toContain('Siti');
    expect(await card.locator('header .role').textContent()).toBe('looking for work');
    // Those who live with family are labelled so, not as job-seekers.
    await page.locator('#roster button', { hasText: 'Hassan' }).click();
    await expect.poll(() => card.locator('header h3').textContent()).toBe('Hassan');
    expect(await card.locator('header .role').textContent()).toBe('lives with family');
    await page.locator('#roster button', { hasText: 'Siti' }).click();
    await expect.poll(() => card.locator('header h3').textContent()).toBe('Siti');
    // The compact card: money in the header, needs as chips, one "Now" line, work, then tabs.
    expect(await card.locator('header .cash').textContent()).toMatch(/^\$\d+\.\d\d$|^\d+¢$/);
    expect(await card.locator('.needs .chip').count()).toBe(2);
    expect(await card.textContent()).toMatch(/Now: .+, (full|not hungry|hungry|very hungry|starving), (rested|fine|tired|exhausted)/);
    expect(await card.textContent()).not.toContain('Nothing on this card ever reaches a resident');
    expect(await card.locator('[data-tab=plan]').getAttribute('aria-selected')).toBe('true');
    await card.locator('[data-tab=thoughts]').click();
    await expect.poll(() => card.locator('[data-tab=thoughts]').getAttribute('aria-selected')).toBe('true');
    await card.locator('[data-tab=money]').click();
    await expect.poll(() => card.textContent()).toMatch(/Today in|No money has changed hands/);
    if (shots) await page.screenshot({ path: join(shots, 'watch-live.png') });

    // The Talk tab: their conversations, fetched when it opens; the card comes back with its own tab.
    await card.locator('[data-tab=talk]').click();
    await expect.poll(() => card.textContent()).toMatch(/With |Nothing said yet/);
    expect(await card.locator('[data-tab=talk]').getAttribute('aria-selected')).toBe('true');
    if (shots) await page.screenshot({ path: join(shots, 'watch-talk.png') });
    await card.locator('[data-tab=plan]').click();
    await expect.poll(() => card.locator('[data-tab=plan]').getAttribute('aria-selected')).toBe('true');
    // Someone who has talked: their Talk tab shows who they talked with, and the lines.
    const ids = await page.locator('#roster button').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.id!));
    const talker = async () => {
      for (const id of ids) {
        const t = await (await fetch(new URL(`/api/talk/${id}`, url))).json() as { talks: unknown[] };
        if (t.talks.length) return id;
      }
      return null;
    };
    await expect.poll(talker, { timeout: 60_000 }).not.toBeNull();
    await page.locator(`#roster button[data-id="${(await talker())!}"]`).click();
    await card.locator('[data-tab=talk]').click();
    await expect.poll(() => card.textContent()).toMatch(/With .*“/);
    if (shots) await page.screenshot({ path: join(shots, 'watch-talk-lines.png') });

    // Click a place on the map itself, at least 2 tiles from anyone: its card opens, with what's inside.
    type Point = { x: number; y: number } | null;
    const placePoint = () => page.evaluate(() => (window as unknown as { __kampung: { placePoint(id: string): Point } }).__kampung.placePoint('lorry-stop'));
    await expect.poll(placePoint, { timeout: 20_000 }).not.toBeNull();
    // Someone walking can step onto the spot between finding it and clicking: try again until the place's card opens.
    await expect.poll(async () => {
      const at = await placePoint();
      if (at) await page.mouse.click(at.x, at.y);
      return card.textContent();
    }, { timeout: 20_000 }).toContain('the lorry stop');
    expect(await card.textContent()).toMatch(/It sellsrice/);
    expect(await card.textContent()).toContain('Nothing on this card ever reaches a resident');
    if (shots) await page.screenshot({ path: join(shots, 'watch-place.png') });

    // Idle life: people waiting between thoughts have something to be doing, and speech bubbles come up as they talk.
    type Lively = { idle: Record<string, number>; bubbles: number } | null;
    const lively = () => page.evaluate(() => (window as unknown as { __kampung: { liveliness(): Lively } }).__kampung.liveliness());
    await expect.poll(async () => Object.keys((await lively())?.idle ?? {}).some((k) => k !== 'none'), { timeout: 20_000 }).toBe(true);
    await expect.poll(async () => (await lively())?.bubbles ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    if (shots) await page.screenshot({ path: join(shots, 'watch-idle.png') });

    // The wiki: People, Places, How it works, Economy and What's new, over the town, and closed again.
    await page.locator('#wiki-open').click();
    const wiki = page.locator('#wiki');
    await expect.poll(() => wiki.isVisible()).toBe(true);
    await expect.poll(() => wiki.textContent()).toContain('Ah Huat, 54');
    expect(await wiki.textContent()).toMatch(/Family and old friends.*Ah Seng \(son\)/);
    await wiki.locator('[data-wiki=places]').click();
    await expect.poll(() => wiki.textContent()).toMatch(/the kopitiam.*Owner.*Ah Huat/);
    await wiki.locator('[data-wiki=how]').click();
    await expect.poll(() => wiki.textContent()).toMatch(/The lorry.*07:00/);
    await wiki.locator('[data-wiki=economy]').click();
    await expect.poll(() => wiki.textContent()).toMatch(/GDP.*Money in town.*Money out/);
    expect(await wiki.textContent()).toMatch(/Money in hand/);
    expect(await wiki.textContent()).toMatch(/nothing spent/);
    // A shop's money opens up, with its kinds and entries.
    await wiki.locator('details[data-account=kopitiam] summary').click();
    await expect.poll(() => wiki.locator('details[data-account=kopitiam]').textContent()).toMatch(/Today in|No money has changed hands/);
    if (shots) await page.screenshot({ path: join(shots, 'wiki-economy.png') });
    await wiki.locator('[data-wiki=news]').click();
    await expect.poll(() => wiki.textContent()).toMatch(/Running v\d+\.\d+\.\d+/);
    expect(await wiki.locator('strong').count()).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => wiki.isVisible()).toBe(false);

    // The desktop layout keeps its side column and has no phone zoom button.
    expect(await page.locator('#zoom').isVisible()).toBe(false);
    await expect.poll(() => page.locator('#version').textContent()).toMatch(/^v\d+\.\d+\.\d+/);

    const health = await (await fetch(new URL('/api/health', url))).json() as { rss: number };
    expect(health.rss).toBeLessThan(500 * 1024 * 1024);
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('fits a phone held upright: no sideways scroll, the map across the width, big tap targets, cards as a full-screen sheet', async () => {
    const url = await watch('--fake', '--speed', '600');
    const { page, foreign, errors } = await visit(url, PHONE);
    const W = PHONE.viewport.width;
    const H = PHONE.viewport.height;
    const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
    expect(await noSideways()).toBe(true);
    expect(await colours(page)).toBeGreaterThan(40);

    // The header is one compact line: date, version and mode.
    const header = (await page.locator('header.top').boundingBox())!;
    expect(header.height).toBeLessThan(56);
    await expect.poll(() => page.locator('#version').textContent()).toMatch(/^v\d/);
    await expect.poll(() => page.locator('#clock .short').innerText()).toMatch(/^Mon 1 Jan, \d\d:\d\d$/);

    // The map spans the width; the feed comes below it.
    const map = (await page.locator('#map canvas').boundingBox())!;
    expect(map.x).toBeGreaterThanOrEqual(0);
    expect(map.x + map.width).toBeLessThanOrEqual(W + 0.5);
    expect(map.width).toBeGreaterThan(W * 0.9);
    const feed = (await page.locator('#feed').boundingBox())!;
    expect(feed.y).toBeGreaterThanOrEqual(map.y + map.height - 1);

    // The wiki opens from the header as a full-screen page with big tabs, and never scrolls sideways.
    const wikiOpen = page.locator('#wiki-open');
    expect((await wikiOpen.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await wikiOpen.tap();
    const wiki = page.locator('#wiki');
    await expect.poll(() => wiki.textContent()).toContain('Ah Huat, 54');
    const wikiBox = (await wiki.boundingBox())!;
    expect(wikiBox.width).toBeGreaterThanOrEqual(W - 1);
    expect(wikiBox.height).toBeGreaterThanOrEqual(H * 0.95);
    expect((await wiki.locator('[data-wiki=economy]').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await wiki.locator('[data-wiki=economy]').tap();
    await expect.poll(() => wiki.textContent()).toMatch(/GDP/);
    expect(await noSideways()).toBe(true);
    if (shots) await page.screenshot({ path: join(shots, 'phone-wiki.png') });
    const wikiClose = page.locator('#wiki-close');
    expect((await wikiClose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await wikiClose.tap();
    await expect.poll(() => wiki.isVisible()).toBe(false);

    // The feed's toggle is big enough to tap.
    expect((await page.locator('#feed-all').boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Resident chips are big enough to tap.
    const chip = page.locator('#roster button', { hasText: 'Siti' });
    await chip.waitFor({ state: 'visible' }); // the roster fills after the first frame; reading it earlier was flaky
    // The roster is redrawn with every update, so a chip can be swapped out between finding it and measuring it.
    await expect.poll(async () => (await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    if (shots) await page.screenshot({ path: join(shots, 'phone-town.png') });

    // A card opens as a full-screen sheet with a clear close button, and closes again.
    await chip.tap();
    const card = page.locator('#card');
    await expect.poll(() => card.isVisible()).toBe(true);
    await expect.poll(() => card.textContent()).toContain('Siti');
    const sheet = (await card.boundingBox())!;
    expect(sheet.x).toBeLessThanOrEqual(0.5);
    expect(sheet.width).toBeGreaterThanOrEqual(W - 1);
    expect(sheet.height).toBeGreaterThanOrEqual(H * 0.95);
    const close = card.locator('.close');
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    if (shots) await page.screenshot({ path: join(shots, 'phone-card.png') });
    // The Talk tab works in the sheet too, with a big enough tab to tap.
    const talkTab = card.locator('[data-tab=talk]');
    expect((await talkTab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await talkTab.tap();
    await expect.poll(() => card.textContent()).toMatch(/With |Nothing said yet/);
    expect(await noSideways()).toBe(true);
    if (shots) await page.screenshot({ path: join(shots, 'phone-talk.png') });
    await close.tap();
    await expect.poll(() => card.isVisible()).toBe(false);
    expect(await noSideways()).toBe(true);

    // Tapping a place on the map opens its card; a tap inside the open sheet never reaches the map beneath it.
    type Point = { x: number; y: number } | null;
    const pointOf = (id: string) => page.evaluate((p) => (window as unknown as { __kampung: { placePoint(id: string): Point } }).__kampung.placePoint(p), id);
    const tapPlace = async (id: string) => {
      await expect.poll(() => pointOf(id), { timeout: 20_000 }).not.toBeNull();
      const at = (await pointOf(id))!;
      await page.touchscreen.tap(at.x, at.y);
    };
    await tapPlace('lorry-stop');
    await expect.poll(() => card.textContent()).toContain('the lorry stop');
    await tapPlace('provision-shop');
    await page.waitForTimeout(400);
    expect(await card.textContent()).toContain('the lorry stop');
    await card.locator('.close').tap();
    await expect.poll(() => card.isVisible()).toBe(false);

    // The zoom button doubles the map inside its own box (the page still doesn't scroll sideways), and back.
    const zoom = page.locator('#zoom');
    expect((await zoom.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await zoom.tap();
    await expect.poll(async () => (await page.locator('#map canvas').boundingBox())!.width).toBeGreaterThan(W * 1.5);
    expect(await noSideways()).toBe(true);
    if (shots) await page.screenshot({ path: join(shots, 'phone-zoomed.png') });

    // A finger drag pans the zoomed map, and opens nothing.
    const scrollLeft = () => page.evaluate(() => document.getElementById('map')!.scrollLeft);
    const before = await scrollLeft();
    const box = (await page.locator('#map').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const [sx, sy] = [box.x + box.width / 2, box.y + box.height / 2];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx - 25 * i, y: sy }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(scrollLeft).toBeGreaterThan(before + 40);
    await page.waitForTimeout(600);
    expect(await card.isVisible()).toBe(false);

    // Right after the map has moved, a tap still lands where it looks.
    await page.evaluate(() => { const m = document.getElementById('map')!; m.scrollLeft = 120; m.scrollTop = 60; });
    await tapPlace('provision-shop');
    await expect.poll(() => card.textContent()).toContain('the provision shop');
    await card.locator('.close').tap();
    await expect.poll(() => card.isVisible()).toBe(false);
    await zoom.tap();
    await expect.poll(async () => (await page.locator('#map canvas').boundingBox())!.width).toBeLessThanOrEqual(W + 0.5);

    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('replays a free fake trial with working controls', async () => {
    const trial = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli/trial.ts', '--fake', '--hours', '6'], { env, encoding: 'utf8' });
    expect(trial.status, trial.stderr).toBe(0);
    const url = await watch('--replay', '--speed', '300');
    const { page, foreign, errors } = await visit(url);
    expect(await colours(page)).toBeGreaterThan(40);
    expect(await page.locator('#replay').isVisible()).toBe(true);
    await expect.poll(() => page.locator('#mode').textContent()).toMatch(/Replay of dry run/);

    // Pause, then seek to the end (six game hours from 05:59): the clock follows.
    await page.locator('#play').click();
    await expect.poll(() => page.locator('#play').textContent()).toBe('▶');
    const seek = page.locator('#seek');
    const max = Number(await seek.getAttribute('max'));
    await seek.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      input.value = String(v);
      input.dispatchEvent(new Event('change'));
    }, max);
    await expect.poll(() => page.locator('#clock').textContent()).toMatch(/11:59/);
    if (shots) await page.screenshot({ path: join(shots, 'watch-replay.png') });
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
    await page.close();
  });
});
