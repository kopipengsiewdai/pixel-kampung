/**
 * The watch page's server: plain Node http, bound to 127.0.0.1 so nothing
 * off this PC can reach it. Read-only towards the town. Requests addressed to
 * any other host name are refused (no DNS rebinding), and the page's content
 * policy lets it load and fetch only from this server.
 */
import { networkInterfaces } from 'node:os';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { ReplayReader } from './replay.ts';
import { ReplaySource, type ReplayCommand, type WatchSource } from './source.ts';
import type { Update } from './types.ts';
import type { Issue, IssueSummary } from '../news/types.ts';

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 8160;

export interface ClientFiles { html: string; js: string; css: string }

export interface TrialEntry { name: string; bytes: number; modified: string }

/** The trials a replay can switch to, by file name only. */
export interface Catalog {
  list(): TrialEntry[];
  /** The trial's path, or null if there's no such trial. */
  find(name: string): string | null;
}

/** The `.db` files directly inside a trials folder. */
export function trialCatalog(dir: string): Catalog {
  const list = (): TrialEntry[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.db'))
      .map((e) => {
        const st = statSync(join(dir, e.name));
        return { name: e.name, bytes: st.size, modified: st.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
  };
  return { list, find: (name) => (list().some((t) => t.name === name) ? join(dir, name) : null) };
}

export interface WatchServerOptions {
  source: WatchSource;
  client: ClientFiles;
  assetsDir: string;
  port: number;
  /** Replay mode: the trials the page may switch between. */
  catalog?: Catalog;
  /** Speed for replays opened from the page. */
  replaySpeed?: number;
  /** Home Wi-Fi mode: also answer on this PC's home-network addresses (read-only page, for the owner's phone). */
  lan?: boolean;
  /** This PC's home-network IPv4 addresses (default: found from its network cards). */
  lanAddresses?: string[];
  /** English for lines residents said or thought (a thinking town only). */
  translate?: (texts: string[]) => Promise<(string | null)[]>;
  /** Kampung News, the owner's daily paper (a thinking town only). */
  news?: { list(): IssueSummary[]; get(n: number): Issue | null };
}

/** Private (home-network) IPv4 addresses of this PC: 10.x, 172.16-31.x and 192.168.x. */
export function homeAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [x, y] = a.address.split('.').map(Number);
      if (x === 10 || (x === 172 && y! >= 16 && y! <= 31) || (x === 192 && y === 168)) out.push(a.address);
    }
  }
  return out;
}

export interface WatchServer {
  host: string;
  port: number;
  url: string;
  /** Addresses to open on a phone on the same Wi-Fi (empty unless `lan`). */
  lanUrls: string[];
  source(): WatchSource;
  close(): Promise<void>;
}

const CSP = [
  "default-src 'self'", "img-src 'self' data: blob:", "style-src 'self'", "script-src 'self'",
  "connect-src 'self'", "font-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'",
].join('; ');
const ASSET_TYPES: Record<string, string> = { '.png': 'image/png', '.json': 'application/json' };
const MAX_BODY = 4096;
/** The English button sends a batch of feed lines at once: a bigger body, for that alone. */
export const TRANSLATE_MAX_BODY = 64 * 1024;

class TooBig extends Error {}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', ...extra });
  res.end(body);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
}

/** The request's JSON body; a body over `max` is read to its end and dropped (TooBig), so it can still be answered. */
function readJson(req: IncomingMessage, max = MAX_BODY): Promise<unknown> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= max) chunks.push(c);
    });
    req.on('end', () => {
      if (size > max) {
        fail(new TooBig());
        return;
      }
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        fail(err);
      }
    });
    req.on('error', fail);
  });
}

function replayCommand(body: unknown): ReplayCommand | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const cmd: ReplayCommand = {};
  if (b.speed !== undefined) {
    if (typeof b.speed !== 'number') return null;
    cmd.speed = b.speed;
  }
  if (b.t !== undefined) {
    if (typeof b.t !== 'number' || !Number.isFinite(b.t)) return null;
    cmd.t = b.t;
  }
  if (b.paused !== undefined) {
    if (typeof b.paused !== 'boolean') return null;
    cmd.paused = b.paused;
  }
  return cmd;
}

/** Unsent bytes a page may fall behind by before it is dropped (it reconnects by itself). */
const STREAM_BACKLOG_LIMIT = 1_000_000;

/**
 * Writes to an event stream unless the reader has stopped reading (a frozen or
 * sleeping tab). Then it drops the stream instead of buffering without end.
 */
export function streamWrite(
  res: Pick<ServerResponse, 'writableLength' | 'write' | 'destroy'>,
  chunk: string,
  limit = STREAM_BACKLOG_LIMIT,
): boolean {
  if (res.writableLength > limit) {
    res.destroy();
    return false;
  }
  res.write(chunk);
  return true;
}

export async function startWatchServer(opts: WatchServerOptions): Promise<WatchServer> {
  let source = opts.source;
  const assetsRoot = resolve(opts.assetsDir);
  const streams = new Set<ServerResponse>();
  let unsubscribe = () => {};

  const sendEvent = (res: ServerResponse, event: string, data: unknown) => {
    if (!streamWrite(res, `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) streams.delete(res);
  };
  const follow = () => {
    unsubscribe();
    unsubscribe = source.subscribe((u: Update) => {
      for (const res of streams) sendEvent(res, 'update', u);
    });
  };
  follow();

  let tickFailed = false;
  const ticker = setInterval(() => {
    try {
      source.tick?.();
    } catch (err) {
      if (!tickFailed) console.error(`The replay couldn't read on (${err instanceof Error ? err.message : String(err)}).`);
      tickFailed = true;
    }
  }, 100);
  const keepAlive = setInterval(() => {
    for (const res of streams) if (!streamWrite(res, ': still here\n\n')) streams.delete(res);
  }, 15_000);

  const swap = (next: WatchSource) => {
    const old = source;
    source = next;
    follow();
    old.close();
    // Pages start over with the new replay.
    for (const res of streams) {
      sendEvent(res, 'reset', {});
      res.end();
    }
    streams.clear();
  };

  let port = opts.port;
  const lan = opts.lan ? (opts.lanAddresses ?? homeAddresses()) : [];
  // Only exact addresses of this PC are accepted, never a name, so DNS rebinding stays blocked.
  const allowedHosts = () => new Set([`${HOST}:${port}`, `localhost:${port}`, ...lan.map((a) => `${a}:${port}`)]);

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (!allowedHosts().has(req.headers.host ?? '')) {
      send(res, 403, 'text/plain; charset=utf-8', 'This page is only for this computer.');
      return;
    }
    const url = new URL(req.url ?? '/', `http://${HOST}:${port}`);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      send(res, 400, 'text/plain; charset=utf-8', 'Bad request.');
      return;
    }
    const method = req.method ?? 'GET';

    if (method === 'POST') {
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
        send(res, 415, 'text/plain; charset=utf-8', 'JSON only.');
        return;
      }
      if (path === '/api/translate' && opts.translate) {
        let body: unknown;
        try {
          body = await readJson(req, TRANSLATE_MAX_BODY);
        } catch (err) {
          if (err instanceof TooBig) send(res, 413, 'text/plain; charset=utf-8', 'Too much at once.');
          else send(res, 400, 'text/plain; charset=utf-8', 'Bad request.');
          return;
        }
        const texts = body && typeof body === 'object' ? (body as { texts?: unknown }).texts : undefined;
        if (!Array.isArray(texts) || !texts.every((x) => typeof x === 'string')) {
          send(res, 400, 'text/plain; charset=utf-8', 'Bad request.');
          return;
        }
        json(res, 200, { english: await opts.translate(texts) });
        return;
      }
      if (!source.control || (path !== '/api/replay' && path !== '/api/replay/open')) {
        send(res, 404, 'text/plain; charset=utf-8', 'Not here.');
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        send(res, 400, 'text/plain; charset=utf-8', 'Bad request.');
        return;
      }
      if (path === '/api/replay') {
        const cmd = replayCommand(body);
        if (!cmd) {
          send(res, 400, 'text/plain; charset=utf-8', 'Bad request.');
          return;
        }
        try {
          json(res, 200, source.control(cmd));
        } catch {
          send(res, 400, 'text/plain; charset=utf-8', 'Bad request.');
        }
        return;
      }
      const name = body && typeof body === 'object' ? (body as { name?: unknown }).name : undefined;
      const file = typeof name === 'string' ? opts.catalog?.find(name) : null;
      if (!file) {
        send(res, 404, 'text/plain; charset=utf-8', 'No such trial.');
        return;
      }
      let reader: ReplayReader | null = null;
      try {
        reader = new ReplayReader(file);
        swap(new ReplaySource(reader, { speed: opts.replaySpeed ?? 60 }));
      } catch {
        reader?.close();
        send(res, 400, 'text/plain; charset=utf-8', "That trial can't be played.");
        return;
      }
      json(res, 200, source.state!());
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      send(res, 405, 'text/plain; charset=utf-8', 'Read only.');
      return;
    }

    if (path === '/' || path === '/index.html') {
      send(res, 200, 'text/html; charset=utf-8', opts.client.html, { 'content-security-policy': CSP });
      return;
    }
    if (path === '/app.js') {
      send(res, 200, 'text/javascript; charset=utf-8', opts.client.js);
      return;
    }
    if (path === '/style.css') {
      send(res, 200, 'text/css; charset=utf-8', opts.client.css);
      return;
    }
    if (path.startsWith('/assets/')) {
      const rel = path.slice('/assets/'.length);
      const file = resolve(assetsRoot, rel);
      const type = ASSET_TYPES[extname(file).toLowerCase()];
      if (!type || !file.startsWith(assetsRoot + sep) || !existsSync(file) || !statSync(file).isFile()) {
        send(res, 404, 'text/plain; charset=utf-8', 'Not here.');
        return;
      }
      send(res, 200, type, readFileSync(file), { 'cache-control': 'max-age=3600' });
      return;
    }
    if (path === '/api/layout') {
      json(res, 200, source.hello().layout);
      return;
    }
    if (path === '/api/health') {
      const m = process.memoryUsage();
      json(res, 200, { ok: true, mode: source.mode, t: source.hello().frame.t, rss: m.rss, heapUsed: m.heapUsed });
      return;
    }
    if (path.startsWith('/api/resident/')) {
      const card = source.card(path.slice('/api/resident/'.length));
      if (card) json(res, 200, card);
      else send(res, 404, 'text/plain; charset=utf-8', 'Nobody by that name.');
      return;
    }
    if (path.startsWith('/api/money/')) {
      const money = source.money(path.slice('/api/money/'.length));
      if (money) json(res, 200, money);
      else send(res, 404, 'text/plain; charset=utf-8', 'Nobody by that name.');
      return;
    }
    if (path === '/api/news') {
      json(res, 200, opts.news ? { issues: opts.news.list() } : { issues: [], off: true });
      return;
    }
    if (path.startsWith('/api/news/')) {
      const n = /^\d{1,6}$/.test(path.slice('/api/news/'.length)) ? Number(path.slice('/api/news/'.length)) : null;
      const issue = n !== null ? opts.news?.get(n) : null;
      if (issue) json(res, 200, issue);
      else send(res, 404, 'text/plain; charset=utf-8', 'No such issue.');
      return;
    }
    if (path === '/api/wiki') {
      json(res, 200, source.wiki());
      return;
    }
    if (path.startsWith('/api/talk/')) {
      const talk = source.talk(path.slice('/api/talk/'.length));
      if (talk) json(res, 200, talk);
      else send(res, 404, 'text/plain; charset=utf-8', 'Nobody by that name.');
      return;
    }
    if (path.startsWith('/api/place/')) {
      const card = source.placeCard(path.slice('/api/place/'.length));
      if (card) json(res, 200, card);
      else send(res, 404, 'text/plain; charset=utf-8', 'No such place.');
      return;
    }
    if (path === '/api/replay' && source.state) {
      json(res, 200, { state: source.state(), trials: opts.catalog?.list() ?? [] });
      return;
    }
    if (path === '/api/stream' && method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
      sendEvent(res, 'hello', source.hello());
      streams.add(res);
      req.on('close', () => { streams.delete(res); });
      return;
    }
    send(res, 404, 'text/plain; charset=utf-8', 'Not here.');
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, 'text/plain; charset=utf-8', 'Something went wrong.');
      else res.end();
    });
  });
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(opts.port, opts.lan ? '0.0.0.0' : HOST, () => {
      server.off('error', fail);
      ok();
    });
  });
  port = (server.address() as AddressInfo).port;

  return {
    host: HOST,
    port,
    url: `http://${HOST}:${port}/`,
    lanUrls: lan.map((a) => `http://${a}:${port}/`),
    source: () => source,
    close: () => new Promise<void>((ok) => {
      clearInterval(ticker);
      clearInterval(keepAlive);
      unsubscribe();
      for (const res of streams) res.end();
      streams.clear();
      server.closeAllConnections();
      server.close(() => ok());
    }),
  };
}
