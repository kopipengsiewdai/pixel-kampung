import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EnglishAsker, ASK_BATCH } from '../src/watch/client/english.ts';
import { startWatchServer, TRANSLATE_MAX_BODY } from '../src/watch/server.ts';
import { LiveSource } from '../src/watch/source.ts';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'kampung-en-')); cleanups.push(() => rmSync(d, { recursive: true, force: true })); return d; };
const LINE = 'Mak Esah berkata: "Siti, kau dah makan ke belum? Mak ada simpan sikit bubur untuk kau dekat dapur, pergilah ambil sebelum sejuk."';

describe('the English button: the server takes a whole batch', () => {
  it('a batch of 40 long lines goes through; only a body over the translate limit is refused, with a plain answer', async () => {
    const files = { html: '<!doctype html>', js: '', css: '' };
    const server = await startWatchServer({ source: new LiveSource({ label: 't', msPerMinute: 1 }), client: files, assetsDir: tmp(), port: 0, translate: async (t) => t.map((x) => `EN ${x}`) });
    try {
      const texts = Array.from({ length: 40 }, (_, i) => `${LINE} ${i}`);
      expect(JSON.stringify({ texts }).length).toBeGreaterThan(4096);
      const res = await fetch(`${server.url}api/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts }) });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { english: string[] }).english).toHaveLength(40);
      const huge = await fetch(`${server.url}api/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: ['x'.repeat(TRANSLATE_MAX_BODY + 10)] }) });
      expect(huge.status).toBe(413);
    } finally {
      await server.close();
    }
  });
});

/** A clock and timers the test moves by hand. */
function fakeTimers() {
  let now = 0;
  const due: { at: number; fn: () => void }[] = [];
  return {
    set: (fn: () => void, ms: number) => { due.push({ at: now + ms, fn }); },
    async run(ms: number) {
      const until = now + ms;
      for (;;) {
        due.sort((a, b) => a.at - b.at);
        const next = due[0];
        if (!next || next.at > until) break;
        due.shift();
        now = next.at;
        next.fn();
        await new Promise((r) => setTimeout(r, 0));
      }
      now = until;
    },
  };
}

describe('the English button: the page asks in small batches and tries again', () => {
  it(`asks ${ASK_BATCH} or fewer at a time`, async () => {
    const asked: string[][] = [];
    const timers = fakeTimers();
    const en = new EnglishAsker(async (texts) => { asked.push(texts); return texts.map((t) => `EN ${t}`); }, () => {}, timers.set);
    for (let i = 0; i < 45; i++) en.want(`${LINE} ${i}`);
    await timers.run(5000);
    expect(asked.length).toBe(3);
    expect(Math.max(...asked.map((a) => a.length))).toBeLessThanOrEqual(ASK_BATCH);
    expect(en.get(`${LINE} 44`)).toBe(`EN ${LINE} 44`);
  });

  it('a failed ask is not remembered as "no English": the lines are asked again, later and later', async () => {
    let fail = 2;
    const tries: number[] = [];
    const timers = fakeTimers();
    let t = 0;
    const en = new EnglishAsker(async (texts) => {
      tries.push(t);
      if (fail-- > 0) throw new Error('network');
      return texts.map((x) => `EN ${x}`);
    }, () => {}, timers.set);
    en.want(LINE);
    for (let i = 0; i < 40 && en.get(LINE) === undefined; i++) { t += 500; await timers.run(500); }
    expect(tries.length).toBe(3);
    expect(tries[2]! - tries[1]!).toBeGreaterThan(tries[1]! - tries[0]!);
    expect(en.get(LINE)).toBe(`EN ${LINE}`);
  });

  it('a line the server says has no English is remembered as none, and not asked again', async () => {
    const asked: string[][] = [];
    const timers = fakeTimers();
    const en = new EnglishAsker(async (texts) => { asked.push(texts); return texts.map(() => null); }, () => {}, timers.set);
    en.want('Hello there');
    await timers.run(2000);
    expect(en.get('Hello there')).toBeNull();
    en.want('Hello there');
    await timers.run(2000);
    expect(asked.length).toBe(1);
  });
});
