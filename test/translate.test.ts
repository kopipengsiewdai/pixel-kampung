import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CostLog } from '../src/mind/cost-log.ts';
import { FakeModel } from '../src/mind/fake-model.ts';
import type { ModelClient, ThinkRequest } from '../src/mind/model.ts';
import { looksForeign } from '../src/watch/foreign.ts';
import { startWatchServer } from '../src/watch/server.ts';
import { LiveSource } from '../src/watch/source.ts';
import { Translator } from '../src/watch/translate.ts';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'kampung-tr-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** The fake model, counting calls. */
function counting() {
  const fake = new FakeModel(1);
  const calls: ThinkRequest[] = [];
  const client: ModelClient = { think: (req) => { calls.push(req); return fake.think(req); } };
  return { client, calls };
}

describe('which lines want English', () => {
  it('Malay lines and other scripts do; English with a Malay word or two does not', () => {
    expect(looksForeign('Aku pening sangat. Nasi mentah ni tak boleh makan.')).toBe(true);
    expect(looksForeign('Aiyo, belly sudah kosong. Rice ini ada dalam beg')).toBe(true);
    expect(looksForeign('我很饿')).toBe(true);
    expect(looksForeign('Morning, Mak Esah! Come makan with us lah.')).toBe(false);
    expect(looksForeign('Two minutes, he says. Ah Seng always means ten.')).toBe(false);
    expect(looksForeign('')).toBe(false);
  });
});

describe('the translator', () => {
  it('puts only foreign lines into English, in one call, and keeps them', async () => {
    const { client, calls } = counting();
    const costs = new CostLog(tmp());
    const file = join(tmp(), 'translations.json');
    const tr = new Translator({ client, costs, file });
    const lines = ['Aku pening sangat. Nasi mentah ni tak boleh makan.', 'Good morning, Siti.', 'Kak, aku tak nak pergi ke jetty.'];
    const out = await tr.english(lines);
    expect(out[0]).toBe(`(English) ${lines[0]}`);
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(`(English) ${lines[2]}`);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.kind).toBe('translate');
    expect(calls[0]!.user).not.toContain('Good morning');
    // Asked again, and after a restart: no new call.
    await tr.english(lines);
    const again = new Translator({ client, costs, file });
    expect(await again.english([lines[0]!])).toEqual([`(English) ${lines[0]}`]);
    expect(calls).toHaveLength(1);
  });

  it('counts its calls in the cost log, and stops when the town has spent its day', async () => {
    const { client, calls } = counting();
    const costs = new CostLog(tmp());
    const tr = new Translator({ client, costs, townCap: 0 });
    expect(await tr.english(['Aku pening sangat, tak boleh makan.'])).toEqual([null]);
    expect(calls).toHaveLength(0);
    const open = new Translator({ client, costs, now: () => 1_000 });
    await open.english(['Aku pening sangat, tak boleh makan.']);
    expect(costs.spentOn(costs.dayKey(1_000))).toBeGreaterThan(0);
  });

  it('a failed or malformed answer gives nothing, and no crash', async () => {
    const costs = new CostLog(tmp());
    const broken: ModelClient = { think: () => Promise.reject(new Error('down')) };
    expect(await new Translator({ client: broken, costs }).english(['Aku tak nak makan nasi ni.'])).toEqual([null]);
    const odd: ModelClient = { think: () => Promise.resolve({ model: 'm', text: '', toolCall: { name: 'answer', input: { english: 'no' } }, usage: { input_tokens: 1, output_tokens: 1 }, attempts: [], refused: false }) };
    expect(await new Translator({ client: odd, costs }).english(['Aku tak nak makan nasi ni.'])).toEqual([null]);
  });
});

describe('the page asks for English', () => {
  it('POST /api/translate answers with English, or 404 when the town has no translator', async () => {
    const { client } = counting();
    const translator = new Translator({ client, costs: new CostLog(tmp()) });
    const files = { html: '<!doctype html>', js: '', css: '' };
    const server = await startWatchServer({ source: new LiveSource({ label: 't', msPerMinute: 1 }), client: files, assetsDir: tmp(), port: 0, translate: (t) => translator.english(t) });
    try {
      const res = await fetch(`${server.url}api/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: ['Aku tak nak makan nasi ni.', 'Hello'] }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ english: ['(English) Aku tak nak makan nasi ni.', null] });
      const bad = await fetch(`${server.url}api/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: 'nope' }) });
      expect(bad.status).toBe(400);
    } finally {
      await server.close();
    }
    const none = await startWatchServer({ source: new LiveSource({ label: 't', msPerMinute: 1 }), client: files, assetsDir: tmp(), port: 0 });
    try {
      const res = await fetch(`${none.url}api/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: ['x'] }) });
      expect(res.status).toBe(404);
    } finally {
      await none.close();
    }
  });
});

describe('Hokkien and Tamil, in Roman letters', () => {
  it('want English too; English with a word or two of them does not', () => {
    expect(looksForeign('Ah Seng, lu chiak png liao boh?')).toBe(true);
    expect(looksForeign('Enna da, naan romba tired, saapadu illa.')).toBe(true);
    expect(looksForeign('Aiyo, I am so hungry today, Pa.')).toBe(false);
    expect(looksForeign('I will go to the jetty and fish.')).toBe(false);
  });
});
