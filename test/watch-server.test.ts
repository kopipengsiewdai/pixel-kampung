import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Town } from '../src/town.ts';
import { ReplayReader, ReplayRecorder, recordTown } from '../src/watch/replay.ts';
import { startWatchServer, streamWrite, trialCatalog, type WatchServer } from '../src/watch/server.ts';
import { LiveSource, ReplaySource } from '../src/watch/source.ts';
import { sgt } from './helpers.ts';

const START = sgt(6, 0) - 1;
const CLIENT = { html: '<!doctype html><title>Pixel Kampung</title><script src="/app.js"></script>', js: 'console.log(1)', css: 'body{}' };
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'kampung-server-'));
  cleanups.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

async function liveServer(): Promise<{ server: WatchServer; town: Town; live: LiveSource; assets: string }> {
  const assets = tmp();
  mkdirSync(join(assets, 'art'), { recursive: true });
  writeFileSync(join(assets, 'art', 'tiles.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(assets, 'secret.db'), 'nope');
  const live = new LiveSource({ label: 'Live town', msPerMinute: 1000, everyMs: 0 });
  const town = Town.create(42, START, live.hooks());
  const server = await startWatchServer({ source: live, client: CLIENT, assetsDir: assets, port: 0 });
  cleanups.push(() => server.close());
  return { server, town, live, assets };
}

/** A raw GET, so the Host header can be anything. */
function rawGet(port: number, path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Reads server-sent events until `count` have arrived. */
async function readEvents(url: string, count: number): Promise<{ event: string; data: unknown }[]> {
  const ac = new AbortController();
  const res = await fetch(url, { signal: ac.signal });
  const reader = res.body!.getReader();
  const out: { event: string; data: unknown }[] = [];
  let buf = '';
  const dec = new TextDecoder();
  while (out.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) out.push({ event, data: JSON.parse(data) });
    }
  }
  ac.abort();
  return out;
}

describe('the watch server', () => {
  it('listens on 127.0.0.1 only', async () => {
    const { server } = await liveServer();
    expect(server.host).toBe('127.0.0.1');
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
  });

  it('serves the page with a strict same-origin content policy', async () => {
    const { server } = await liveServer();
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/connect-src 'self'/);
    expect(await res.text()).toContain('Pixel Kampung');
    const js = await fetch(new URL('/app.js', server.url));
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(await js.text()).toBe('console.log(1)');
  });

  it('serves art but nothing outside the assets folder, and only art files', async () => {
    const { server } = await liveServer();
    expect((await fetch(new URL('/assets/art/tiles.png', server.url))).status).toBe(200);
    expect((await fetch(new URL('/assets/secret.db', server.url))).status).toBe(404);
    expect((await rawGet(server.port, '/assets/../package.json', `127.0.0.1:${server.port}`)).status).toBe(404);
    expect((await rawGet(server.port, '/assets/%2e%2e/package.json', `127.0.0.1:${server.port}`)).status).toBe(404);
    expect((await fetch(new URL('/nope', server.url))).status).toBe(404);
  });

  it('refuses requests addressed to another host name (DNS rebinding)', async () => {
    const { server } = await liveServer();
    expect((await rawGet(server.port, '/api/layout', 'evil.example:80')).status).toBe(403);
    expect((await rawGet(server.port, '/api/layout', `localhost:${server.port}`)).status).toBe(200);
  });

  it('gives the layout, a resident card and its own memory use', async () => {
    const { server } = await liveServer();
    const layout = await (await fetch(new URL('/api/layout', server.url))).json() as { w: number };
    expect(layout.w).toBe(40);
    const card = await (await fetch(new URL('/api/resident/siti', server.url))).json() as { name: string };
    expect(card.name).toBe('Siti');
    expect((await fetch(new URL('/api/resident/nobody', server.url))).status).toBe(404);
    const health = await (await fetch(new URL('/api/health', server.url))).json() as { rss: number; mode: string };
    expect(health.mode).toBe('live');
    expect(health.rss).toBeGreaterThan(0);
  });

  it('streams a hello and then updates as the town moves', async () => {
    const { server, town } = await liveServer();
    const events = readEvents(new URL('/api/stream', server.url).href, 3);
    await new Promise((r) => setTimeout(r, 100));
    await town.runUntil(START + 2);
    const got = await events;
    expect(got.map((e) => e.event)).toEqual(['hello', 'update', 'update']);
    expect((got[0]!.data as { mode: string }).mode).toBe('live');
    expect((got[2]!.data as { frame: { t: number } }).frame.t).toBe(START + 2);
  });

  it('has no replay controls in live mode', async () => {
    const { server } = await liveServer();
    const res = await fetch(new URL('/api/replay', server.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"paused":true}' });
    expect(res.status).toBe(404);
  });
});

async function trial(dir: string, name: string, minutes: number): Promise<string> {
  const path = join(dir, name);
  const rec = new ReplayRecorder(path, { seed: 42, label: name });
  const town = Town.create(42, START, recordTown(rec));
  await town.runUntil(START + minutes);
  rec.close();
  return path;
}

describe('the watch server in replay mode', () => {
  it('takes play, pause, seek and speed from the page', async () => {
    const dir = tmp();
    const src = new ReplaySource(new ReplayReader(await trial(dir, 'trial-a.db', 60)), { everyMs: 0 });
    const server = await startWatchServer({ source: src, client: CLIENT, assetsDir: tmp(), port: 0, catalog: trialCatalog(dir) });
    cleanups.push(() => server.close());
    cleanups.push(() => server.source().close()); // runs first: Windows can't delete an open trial file
    const post = (body: unknown) => fetch(new URL('/api/replay', server.url), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const res = await post({ paused: true, t: START + 30, speed: 300 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paused: true, t: START + 30, speed: 300 });
    expect((await post({ speed: 'fast' })).status).toBe(400);
    expect((await post({ speed: 0 })).status).toBe(400);
    const notJson = await fetch(new URL('/api/replay', server.url), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    expect(notJson.status).toBe(415);
  });

  it('lists the trials it can play and switches to one by name, never by path', async () => {
    const dir = tmp();
    await trial(dir, 'trial-a.db', 30);
    await trial(dir, 'trial-b.db', 30);
    writeFileSync(join(dir, 'notes.txt'), 'x');
    const src = new ReplaySource(new ReplayReader(join(dir, 'trial-a.db')), { everyMs: 0 });
    const server = await startWatchServer({ source: src, client: CLIENT, assetsDir: tmp(), port: 0, catalog: trialCatalog(dir) });
    cleanups.push(() => server.close());
    cleanups.push(() => server.source().close()); // runs first: Windows can't delete an open trial file
    const list = await (await fetch(new URL('/api/replay', server.url))).json() as { trials: { name: string }[]; state: { file: string } };
    expect(list.trials.map((t) => t.name).sort()).toEqual(['trial-a.db', 'trial-b.db']);
    expect(list.state.file).toBe('trial-a.db');
    const open = (name: string) => fetch(new URL('/api/replay/open', server.url), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    expect((await open('../trial-a.db')).status).toBe(404);
    expect((await open('notes.txt')).status).toBe(404);
    expect((await open('trial-b.db')).status).toBe(200);
    const after = await (await fetch(new URL('/api/replay', server.url))).json() as { state: { file: string } };
    expect(after.state.file).toBe('trial-b.db');
  });
});

describe('odd requests', () => {
  it('answers a broken escape with 400 and a HEAD of the stream without hanging', async () => {
    const { server } = await liveServer();
    expect((await rawGet(server.port, '/api/resident/%E0%A4%A', `127.0.0.1:${server.port}`)).status).toBe(400);
    const head = await fetch(new URL('/api/stream', server.url), { method: 'HEAD' });
    expect(head.status).toBe(404);
  });
});

describe('a tab that stops reading', () => {
  it('is dropped once its unsent backlog passes the limit, instead of growing without end', () => {
    const fake = (backlog: number) => {
      const r = { writableLength: backlog, written: [] as string[], destroyed: false,
        write(c: string) { this.written.push(c); return true; }, destroy() { this.destroyed = true; } };
      return r;
    };
    const ok = fake(10);
    expect(streamWrite(ok as never, 'x', 100)).toBe(true);
    expect(ok.written).toEqual(['x']);
    const stuck = fake(101);
    expect(streamWrite(stuck as never, 'x', 100)).toBe(false);
    expect(stuck.written).toEqual([]);
    expect(stuck.destroyed).toBe(true);
  });
});

describe('home Wi-Fi mode', () => {
  it("answers this PC's own home-network address, and still refuses other host names", async () => {
    const live = new LiveSource({ label: 'Live town', msPerMinute: 1000, everyMs: 0 });
    const town = Town.create(42, START, live.hooks());
    const server = await startWatchServer({ source: live, client: CLIENT, assetsDir: tmp(), port: 0, lan: true, lanAddresses: ['192.168.1.50'] });
    cleanups.push(() => server.close());
    expect(server.lanUrls).toEqual([`http://192.168.1.50:${server.port}/`]);
    expect((await rawGet(server.port, '/api/layout', `192.168.1.50:${server.port}`)).status).toBe(200);
    expect((await rawGet(server.port, '/api/layout', `127.0.0.1:${server.port}`)).status).toBe(200);
    expect((await rawGet(server.port, '/api/layout', `evil.example:${server.port}`)).status).toBe(403);
    expect((await rawGet(server.port, '/api/layout', `10.9.9.9:${server.port}`)).status).toBe(403);
    void town;
  });

  it('stays on this PC only unless asked', async () => {
    const live = new LiveSource({ label: 'Live town', msPerMinute: 1000, everyMs: 0 });
    Town.create(42, START, live.hooks());
    const server = await startWatchServer({ source: live, client: CLIENT, assetsDir: tmp(), port: 0, lanAddresses: ['192.168.1.50'] });
    cleanups.push(() => server.close());
    expect(server.lanUrls).toEqual([]);
    expect((await rawGet(server.port, '/api/layout', `192.168.1.50:${server.port}`)).status).toBe(403);
  });
});
