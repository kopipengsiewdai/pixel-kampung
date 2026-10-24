import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { costUsd, PRICES } from '../src/mind/pricing.ts';
import { CostLog } from '../src/mind/cost-log.ts';
import { AnthropicModel, MODELS } from '../src/mind/anthropic-model.ts';
import { DO_TOOL, toIntent } from '../src/mind/tools.ts';
import { readApiKey } from '../src/config/env.ts';
import { writeFileSync } from 'node:fs';

describe('pricing', () => {
  it('prices a call from its usage, cache reads and writes included', () => {
    // Haiku 5.5: $0.10 in, $0.50 out, cache read 0.1x, 5-minute write 1.25x (per million tokens)
    const usd = costUsd('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 });
    expect(usd).toBeCloseTo(0.10 + 0.50 + 0.01 + 0.125, 10);
    expect(costUsd('claude-sonnet-5-5', { input_tokens: 1000, output_tokens: 100 })).toBeCloseTo(0.002 + 0.001, 10);
  });
  it('an unknown model is priced at the dearest rate, never as free', () => {
    const top = Math.max(...Object.values(PRICES).map((p) => p.output));
    expect(costUsd('claude-something-new', { input_tokens: 0, output_tokens: 1_000_000 })).toBe(top);
  });
});

describe('cost log', () => {
  it('appends one line per call to a daily file and keeps totals', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kampung-cost-'));
    try {
      const log = new CostLog(dir);
      const t = 29_000_000;
      log.add({ t, resident: 'siti', kind: 'act', model: 'claude-haiku-5-5', usage: { input_tokens: 2000, output_tokens: 100 } });
      log.add({ t: t + 1, resident: 'raju', kind: 'plan', model: 'claude-sonnet-5-5', usage: { input_tokens: 4000, output_tokens: 500 } });
      const day = log.dayKey(t);
      const lines = readFileSync(join(dir, `${day}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({ resident: 'siti', model: 'claude-haiku-5-5', input: 2000, output: 100 });
      expect(log.spentOn(day)).toBeCloseTo(lines[0].usd + lines[1].usd, 12);
      expect(new CostLog(dir).spentOn(day)).toBeCloseTo(log.spentOn(day), 12); // survives a restart
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the do tool', () => {
  it('maps a tool call to an action, with plain field names', () => {
    expect(toIntent({ action: 'walk to', where: 'the jetty' })).toEqual({ verb: 'walk to', where: 'the jetty' });
    expect(toIntent({ action: 'offer a job', person: 'Siti', wage: '$2.00', start: 9, hours: 4 })).toEqual(
      { verb: 'offer job', to: 'Siti', from: 'Siti', who: 'Siti', wage: '$2.00', startHour: 9, hours: 4 });
    expect(toIntent({ action: 'set price', item: 'fish', price: 20, buying: true, wanted: 5 })).toEqual(
      { verb: 'set price', item: 'fish', price: 20, side: 'buy', limit: 5 });
    expect(toIntent({ action: 'potter about' })).toBeNull();
    expect(toIntent('nonsense')).toBeNull();
  });
  it('has in-world wording only', () => {
    const text = JSON.stringify(DO_TOOL);
    expect(text).not.toMatch(/\b(api|state|system|intent|verb|feature|game|simulat|agent|json)\b/i);
  });
});

describe('the Anthropic client', () => {
  it('sends a cached, tool-using request with no sampling settings, and reads the reply', async () => {
    const sent: { url: string; body: any; headers: Headers }[] = [];
    const stub = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init!.body)), headers: new Headers(init!.headers) });
      return new Response(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'tool_use', stop_sequence: null,
        content: [
          { type: 'text', text: 'Hungry. Kopi first.' },
          { type: 'tool_use', id: 'tu_1', name: 'do', input: { action: 'buy', item: 'kopi', amount: 1 } },
        ],
        usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const model = new AnthropicModel({ apiKey: 'test-key-not-real', fetch: stub, maxRetries: 0 });
    const res = await model.think({ tier: 'routine', kind: 'act', residentId: 'siti', t: 0, system: 'You are Siti.', user: "It's morning.", tools: [DO_TOOL] });
    expect(sent).toHaveLength(1);
    const body = sent[0]!.body;
    expect(body.model).toBe(MODELS.routine);
    expect(body.tools[0].name).toBe('do');
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.tool_choice).toEqual({ type: 'auto' });
    for (const k of ['temperature', 'top_p', 'top_k']) expect(body).not.toHaveProperty(k);
    expect(res.toolCall).toEqual({ name: 'do', input: { action: 'buy', item: 'kopi', amount: 1 } });
    expect(res.text).toBe('Hungry. Kopi first.');
    expect(res.usage.cache_read_input_tokens).toBe(900);
    expect(res.model).toBe('claude-haiku-5-5');
  });
  it('a refusal or an API failure means no action, not a crash', async () => {
    const refusal = (async () => new Response(JSON.stringify({
      id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'refusal', stop_sequence: null,
      stop_details: { type: 'refusal', category: null, explanation: null },
      content: [], usage: { input_tokens: 10, output_tokens: 0 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const r1 = await new AnthropicModel({ apiKey: 'k', fetch: refusal, maxRetries: 0 })
      .think({ tier: 'big', kind: 'plan', residentId: 'siti', t: 0, system: 's', user: 'u', tools: [] });
    expect(r1.toolCall).toBeNull();
    expect(r1.refused).toBe(true);
    const down = (async () => new Response('{"type":"error","error":{"type":"overloaded_error","message":"busy"}}', { status: 529 })) as typeof fetch;
    await expect(new AnthropicModel({ apiKey: 'k', fetch: down, maxRetries: 0 })
      .think({ tier: 'routine', kind: 'act', residentId: 'siti', t: 0, system: 's', user: 'u', tools: [] })).rejects.toThrow();
  });
});

describe('the API key', () => {
  it('is read only from $KAMPUNG_HOME/.env, never from the repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kampung-env-'));
    try {
      expect(readApiKey(dir)).toBeNull();
      writeFileSync(join(dir, '.env'), '# comment\nKAMPUNG_HOME=~/.kampung\nANTHROPIC_API_KEY="abc123"\n');
      expect(readApiKey(dir)).toBe('abc123');
      writeFileSync(join(dir, '.env'), 'ANTHROPIC_API_KEY=\n');
      expect(readApiKey(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the real path end to end, against a stubbed network', () => {
  it('a town with one mind on the Anthropic client acts on its do calls and logs every call', async () => {
    const { Town, fakeBrains } = await import('../src/town.ts');
    const { Mind } = await import('../src/mind/mind.ts');
    const { MemoryStore } = await import('../src/mind/memory.ts');
    const { mindBrains } = await import('../src/mind/setup.ts');
    const { TEST_CARDS } = await import('../src/seed/test-cards.ts');
    const { SIM_START } = await import('../src/cli/start.ts');
    const bodies: any[] = [];
    let n = 0;
    const stub = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      bodies.push(body);
      n++;
      const content = body.messages[0].content.includes('What do you do now?')
        ? [{ type: 'tool_use', id: `tu_${n}`, name: 'do', input: n % 2 ? { action: 'walk to', where: 'south' } : { action: 'say', words: 'Selamat pagi!' } }]
        : [{ type: 'text', text: 'Find work. Eat something.' }];
      return new Response(JSON.stringify({
        id: `msg_${n}`, type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null, content,
        usage: { input_tokens: 400, output_tokens: 50, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const dir = mkdtempSync(join(tmpdir(), 'kampung-e2e-'));
    try {
      const mind = new Mind({ client: new AnthropicModel({ apiKey: 'k', fetch: stub, maxRetries: 0 }), memory: new MemoryStore(':memory:'), costs: new CostLog(dir), cards: TEST_CARDS });
      const events: { type: string; who?: string }[] = [];
      const town = Town.create(1, SIM_START, { brains: mindBrains(mind, fakeBrains, ['siti']), observer: mind.observe, onEvent: (e) => events.push(e) });
      await town.runUntil(SIM_START + 60);
      expect(bodies.length).toBeGreaterThan(3);
      expect(bodies[0].model).toBe('claude-sonnet-5-5'); // the morning plan
      expect(bodies.slice(1).every((b) => b.model === 'claude-haiku-5-5')).toBe(true);
      expect(events.some((e) => e.type === 'walked' && e.who === 'siti')).toBe(true);
      const logged = readFileSync(join(dir, `${mind.costs.dayKey(SIM_START + 1)}.jsonl`), 'utf8').trim().split('\n');
      expect(logged).toHaveLength(bodies.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
