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

async function visit(url: string): Promise<Visit> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
    await expect.poll(() => page.locator('#feed li').count()).toBeGreaterThan(3);
    await expect.poll(() => page.locator('#clock').textContent()).toMatch(/Monday 1 January, Year 0, \d\d:\d\d/);
    expect(await page.locator('#replay').isVisible()).toBe(false);

    await page.locator('#roster button', { hasText: 'Siti' }).click();
    const card = page.locator('#card');
    await expect.poll(() => card.isVisible()).toBe(true);
    await expect.poll(() => card.textContent()).toContain('Siti');
    expect(await card.textContent()).toMatch(/Money\$?\d|Money\d/);
    expect(await card.textContent()).toContain('Nothing on this card ever reaches a resident');
    if (shots) await page.screenshot({ path: join(shots, 'watch-live.png') });

    const health = await (await fetch(new URL('/api/health', url))).json() as { rss: number };
    expect(health.rss).toBeLessThan(500 * 1024 * 1024);
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
