import { describe, expect, it } from 'vitest';
import { FakeBrain } from '../src/brain/fake-brain.ts';
import { feedLine } from '../src/feed/feed.ts';
import { importanceOf } from '../src/mind/memory.ts';
import { auditLedger } from '../src/sim/audit.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { describe as describePerception, perceive, type Perception } from '../src/sim/perception.ts';
import { OPENING_ID, talkKey, type World } from '../src/sim/state.ts';
import { advance } from '../src/sim/tick.ts';
import { dealKind, settledBy } from '../src/sim/talk.ts';
import { SqliteStore } from '../src/store/sqlite-store.ts';
import { Town } from '../src/town.ts';
import { accepted, act, expectInWorld, newWorld, put, refused, sgt, who } from './helpers.ts';

const offered = (p: Perception, verb: string) => p.actions.some((a) => a.verb === verb);
const seen = (w: World, name: string) => describePerception(perceive(w, who(w, name)));
const feed = (w: World, e: GameEvent) => feedLine(e, (id) => w.resident(id).name)!.text;

/** Mdm Tan and Rahim at the well, with money of their own. */
function pair(tan = 1000, rahim = 0) {
  const w = newWorld(9);
  const t = put(w, 'Mdm Tan', 'well');
  const r = put(w, 'Rahim', 'well');
  t.money = tan;
  r.money = rahim;
  return { w, tan: t, rahim: r };
}

describe('lending and borrowing need the other one to agree', () => {
  it('a loan offered moves nothing until it is agreed, then the money moves and the debt is written down', () => {
    const { w, tan, rahim } = pair();
    expect(offered(perceive(w, tan), 'lend')).toBe(true);
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$2.00' }));
    expect(rahim.money).toBe(0);
    expect(w.state.debts).toEqual([]);
    expect(rahim.recent.at(-1)!.text).toBe('Mdm Tan offers to lend you $2.00.');
    expect(seen(w, 'Rahim')).toContain('Mdm Tan offers to lend you $2.00.');
    expect(offered(perceive(w, rahim), 'agree')).toBe(true);
    w.takeEvents();
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(rahim.money).toBe(200);
    expect(tan.money).toBe(800);
    expect(w.state.debts).toMatchObject([{ debtor: rahim.id, creditor: tan.id, cents: 200, kind: 'loan' }]);
    expect(w.state.debtOffers).toEqual([]);
    expect(w.takeLedger().at(-1)).toMatchObject({ from: tan.id, to: rahim.id, cents: 200, reason: 'loan' });
    const e = w.takeEvents().find((x) => x.type === 'debt_agreed')!;
    expect(feed(w, e)).toBe('Rahim borrows $2.00 from Mdm Tan.');
    expect(tan.recent.at(-1)!.text).toBe('Rahim agrees to borrow $2.00 from you.');
  });

  it('asking to borrow works the same way, agreed by the one who lends', () => {
    const { w, tan, rahim } = pair();
    accepted(act(w, rahim.id, { verb: 'borrow', to: 'Mdm Tan', money: '50¢' }));
    expect(tan.recent.at(-1)!.text).toBe('Rahim asks to borrow 50¢ from you.');
    accepted(act(w, tan.id, { verb: 'agree', from: 'Rahim' }));
    expect(rahim.money).toBe(50);
    expect(w.state.debts).toMatchObject([{ debtor: rahim.id, creditor: tan.id, cents: 50, kind: 'loan' }]);
  });

  it('turning it down settles it with nothing moved', () => {
    const { w, tan, rahim } = pair();
    accepted(act(w, rahim.id, { verb: 'borrow', to: 'Mdm Tan', money: '$5.00' }));
    w.takeEvents();
    accepted(act(w, tan.id, { verb: 'refuse', from: 'Rahim' }));
    expect(w.state.debtOffers).toEqual([]);
    expect(w.state.debts).toEqual([]);
    expect(rahim.recent.at(-1)!.text).toBe("Mdm Tan won't lend you $5.00.");
    expect(feed(w, w.takeEvents().find((x) => x.type === 'debt_refused')!)).toBe("Mdm Tan won't lend to Rahim.");
    refused(act(w, tan.id, { verb: 'agree', from: 'Rahim' }), /hasn't asked you about any money/);
    expect(offered(perceive(w, tan), 'agree')).toBe(false);
  });

  it('an offer lapses after half an hour', () => {
    const { w, tan, rahim } = pair();
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$2.00' }));
    for (let i = 0; i < 30; i++) advance(w);
    expect(w.state.debtOffers).toEqual([]);
    refused(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }), /hasn't/);
  });

  it('agreeing checks the money then: a lender who has spent it in the meantime can not lend it', () => {
    const { w, tan, rahim } = pair(300);
    accepted(act(w, rahim.id, { verb: 'borrow', to: 'Mdm Tan', money: '$2.00' }));
    tan.money = 100;
    refused(act(w, tan.id, { verb: 'agree', from: 'Rahim' }), /You don't have \$2\.00/);
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$1.00' }));
    tan.money = 50;
    refused(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }), /Mdm Tan doesn't have \$1\.00/);
    expect(w.state.debts).toEqual([]);
  });

  it('refuses in plain words: no money, too much, nobody nearby, nobody known', () => {
    const { w, tan, rahim } = pair(100);
    refused(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$5.00' }), /You don't have \$5\.00/);
    refused(act(w, tan.id, { verb: 'lend', to: 'Rahim' }), /how much/i);
    refused(act(w, tan.id, { verb: 'lend', to: 'Nobody', money: '10¢' }), /don't know/);
    put(w, 'Rahim', 'jetty');
    refused(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '10¢' }), /isn't nearby/);
    refused(act(w, rahim.id, { verb: 'borrow', to: 'Rahim', money: '10¢' }), /That's you/);
  });
});

describe('an IOU', () => {
  it('records a debt, with its words, once the one it is written to agrees; no money moves', () => {
    const { w, tan, rahim } = pair(1000, 100);
    expect(offered(perceive(w, rahim), 'write iou')).toBe(true);
    accepted(act(w, rahim.id, { verb: 'write_iou', to: 'Mdm Tan', money: '$5.00', text: 'for the fish' }));
    expect(tan.recent.at(-1)!.text).toBe('Rahim writes you an IOU for $5.00 (for the fish).');
    accepted(act(w, tan.id, { verb: 'agree', from: 'Rahim' }));
    expect(rahim.money).toBe(100);
    expect(tan.money).toBe(1000);
    expect(w.state.debts).toMatchObject([{ debtor: rahim.id, creditor: tan.id, cents: 500, kind: 'iou', what: 'for the fish' }]);
    expect(seen(w, 'Rahim')).toContain('You owe Mdm Tan $5.00 (for the fish).');
    expect(seen(w, 'Mdm Tan')).toContain('Rahim owes you $5.00 (for the fish).');
  });

  it('can only say you owe them: nobody writes a debt owed to themselves', () => {
    // The one who writes it is always the one who owes; there's no way to name someone else.
    const { w, tan } = pair();
    accepted(act(w, tan.id, { verb: 'write_iou', to: 'Rahim', money: '$5.00' }));
    accepted(act(w, who(w, 'Rahim').id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(w.state.debts).toMatchObject([{ debtor: tan.id, cents: 500 }]);
  });
});

describe('paying back and letting off', () => {
  function owing() {
    const { w, tan, rahim } = pair(1000, 0);
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$2.00' }));
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }));
    w.state.t += 5;
    accepted(act(w, rahim.id, { verb: 'write_iou', to: 'Mdm Tan', money: '$1.00', text: 'for the rice' }));
    accepted(act(w, tan.id, { verb: 'agree', from: 'Rahim' }));
    return { w, tan, rahim };
  }

  it('a second debt of the same kind adds to the first, keeping when it began', () => {
    const { w, tan, rahim } = owing();
    const since = w.state.debts.find((d) => d.kind === 'loan')!.since;
    w.state.t += 5;
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '50¢' }));
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }));
    const loans = w.state.debts.filter((d) => d.kind === 'loan');
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ cents: 250, since });
    expect(seen(w, 'Rahim')).toContain('You owe Mdm Tan $3.50 (for the rice).');
  });

  it('repay pays the oldest debt first, and can be part', () => {
    const { w, tan, rahim } = owing();
    expect(offered(perceive(w, rahim), 'repay')).toBe(true);
    expect(offered(perceive(w, tan), 'repay')).toBe(false);
    rahim.money = 250;
    w.takeEvents();
    accepted(act(w, rahim.id, { verb: 'repay', to: 'Mdm Tan', money: '$2.50' }));
    expect(w.state.debts).toMatchObject([{ kind: 'iou', cents: 50 }]);
    expect(rahim.money).toBe(0);
    expect(tan.money).toBe(1050);
    expect(w.takeLedger().at(-1)).toMatchObject({ from: rahim.id, to: tan.id, cents: 250, reason: 'repaid' });
    expect(feed(w, w.takeEvents().find((x) => x.type === 'repaid')!)).toBe('Rahim pays Mdm Tan back $2.50.');
    expect(tan.recent.at(-1)!.text).toBe('Rahim pays you back $2.50. Rahim still owes you 50¢.');
  });

  it('repaying all of it, by default, clears the debt; it refuses when short', () => {
    const { w, rahim } = owing();
    rahim.money = 100;
    refused(act(w, rahim.id, { verb: 'repay', to: 'Mdm Tan' }), /You only have \$1\.00/);
    rahim.money = 500;
    accepted(act(w, rahim.id, { verb: 'repay', to: 'Mdm Tan' }));
    expect(w.state.debts).toEqual([]);
    expect(rahim.money).toBe(200);
    expect(seen(w, 'Rahim')).toContain('Nobody owes you anything, and you owe nobody.');
    refused(act(w, rahim.id, { verb: 'repay', to: 'Mdm Tan' }), /You don't owe Mdm Tan anything/);
  });

  it('paying more than is owed pays only what is owed', () => {
    const { w, rahim } = owing();
    rahim.money = 1000;
    accepted(act(w, rahim.id, { verb: 'repay', to: 'Mdm Tan', money: '$9.00' }));
    expect(rahim.money).toBe(700);
    expect(w.state.debts).toEqual([]);
  });

  it('the one owed can let them off, all or part', () => {
    const { w, tan, rahim } = owing();
    expect(offered(perceive(w, tan), 'let off')).toBe(true);
    w.takeEvents();
    accepted(act(w, tan.id, { verb: 'let_off', to: 'Rahim', money: '$1.00' }));
    expect(w.state.debts).toMatchObject([{ kind: 'loan', cents: 200 }]);
    expect(rahim.recent.at(-1)!.text).toBe('Mdm Tan lets you off $1.00. You still owe Mdm Tan $2.00.');
    expect(feed(w, w.takeEvents().find((x) => x.type === 'let_off')!)).toBe('Mdm Tan lets Rahim off $1.00.');
    accepted(act(w, tan.id, { verb: 'let_off', to: 'Rahim' }));
    expect(w.state.debts).toEqual([]);
    refused(act(w, tan.id, { verb: 'let_off', to: 'Rahim' }), /Rahim doesn't owe you anything/);
  });
});

describe('what everyone sees, every moment', () => {
  it('nobody owing anybody is said plainly', () => {
    const { w } = pair();
    const line = 'Nobody owes you anything, and you owe nobody.';
    expect(seen(w, 'Rahim')).toContain(line);
    expectInWorld(line);
  });

  it('wages owed to a worker are seen by the worker, not just the boss', () => {
    const { w, tan, rahim } = pair();
    w.state.owed.push({ employerId: tan.id, workerId: rahim.id, cents: 120 });
    const s = seen(w, 'Rahim');
    expect(s).toContain('Mdm Tan owes you $1.20 in wages.');
    expect(s).not.toContain('Nobody owes you');
    expect(seen(w, 'Mdm Tan')).not.toContain('Nobody owes you');
  });

  it('debts are summed per person, both ways, and every line reads in-world', () => {
    const { w, tan, rahim } = pair(1000, 1000);
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$2.00' }));
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }));
    const siti = put(w, 'Siti', 'well');
    accepted(act(w, rahim.id, { verb: 'lend', to: 'Siti', money: '$1.00' }));
    accepted(act(w, siti.id, { verb: 'agree', from: 'Rahim' }));
    const s = seen(w, 'Rahim');
    expect(s).toContain('You owe Mdm Tan $2.00.');
    expect(s).toContain('Siti owes you $1.00.');
    for (const l of s.split('\n').filter((x) => /owe/.test(x))) expectInWorld(l);
  });

  it('offers of money stay in front of them until settled, and are remembered as mattering', () => {
    const lines = ['Mdm Tan offers to lend you $2.00.', 'Rahim asks to borrow $2.00 from you.', 'Rahim writes you an IOU for $5.00 (for the fish).'];
    for (const l of lines) expect(importanceOf('noticed', l), l).toBe(7);
  });
});

describe('debts and talk', () => {
  it('money offered, agreed, refused, paid back or let off settles talk of paying between the two', () => {
    const ev = (body: Record<string, unknown>) => ({ t: 1, seq: 1, ...body }) as unknown as GameEvent;
    expect(settledBy(ev({ type: 'debt_offered', who: 'a', to: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'debt_agreed', who: 'b', from: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'money' });
    expect(settledBy(ev({ type: 'debt_refused', who: 'b', from: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'money' });
    expect(settledBy(ev({ type: 'repaid', who: 'a', to: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'let_off', who: 'b', debtor: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'money' });
  });

  it('a real repayment backs "settling my account" talk', () => {
    const { w, tan, rahim } = pair(1000, 500);
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$2.00' }));
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }));
    const text = "I've settled my account with you.";
    expect(dealKind(text)).toBe('paying');
    accepted(act(w, rahim.id, { verb: 'say', to: 'Mdm Tan', text }));
    expect(w.state.talk[talkKey(rahim.id, tan.id)]!.word).not.toBeNull();
    accepted(act(w, rahim.id, { verb: 'repay', to: 'Mdm Tan' }));
    expect(w.state.talk[talkKey(rahim.id, tan.id)]!.word).toBeNull();
  });
});

describe('the money ledger reconciles from nothing', () => {
  it("a new town writes down everyone's starting money, so replaying the ledger gives every purse", () => {
    const store = new SqliteStore(':memory:');
    const town = Town.create(1, 0, { store });
    const opening = store.ledger().filter((l) => l.from === OPENING_ID);
    expect(opening.length).toBe(town.world.state.residents.filter((r) => r.money > 0).length);
    expect(auditLedger(store.ledger(), town.world.state.residents)).toEqual({ ok: true, line: 'ledger OK' });
    store.close();
  });

  it('after a day of trading, lending and paying back, the ledger still adds up', async () => {
    const store = new SqliteStore(':memory:');
    const town = Town.create(42, sgt(9, 0), { store });
    const { world: w } = town;
    const tan = put(w, 'Mdm Tan', 'well');
    const rahim = put(w, 'Rahim', 'well');
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '20¢' }));
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }));
    accepted(act(w, rahim.id, { verb: 'repay', to: 'Mdm Tan', money: '10¢' }));
    await town.runUntil(town.t + 24 * 60);
    expect(store.ledger().some((l) => l.reason === 'repaid')).toBe(true);
    expect(auditLedger(store.ledger(), w.state.residents)).toEqual({ ok: true, line: 'ledger OK' });
    store.close();
  });

  it('money that moved without being written down shows up, by name', () => {
    const store = new SqliteStore(':memory:');
    const town = Town.create(1, 0, { store });
    const r = town.world.state.residents[0]!;
    r.money += 5;
    const res = auditLedger(store.ledger(), town.world.state.residents);
    expect(res.ok).toBe(false);
    expect(res.line).toMatch(new RegExp(`^ledger MISMATCH: ${r.name} has .* but the ledger says`));
    store.close();
  });

  it('an older town is checked from its opening entries, its history before them aside', () => {
    const res = auditLedger([
      { seq: 1, t: 1, from: 'lorry', to: 'a', cents: 999, reason: 'lorry_sale' },
      { seq: 2, t: 2, from: OPENING_ID, to: 'a', cents: 300, reason: 'opening' },
      { seq: 3, t: 3, from: 'a', to: 'b', cents: 100, reason: 'gift' },
    ], [{ id: 'a', name: 'A', money: 200 }, { id: 'b', name: 'B', money: 100 }]);
    expect(res).toEqual({ ok: true, line: 'ledger OK' });
  });
});

describe('the upgrade: nobody owes anybody yet, and the ledger opens where every purse stands', () => {
  it('adds no debts or offers, and keeps the next ledger number past the opening entries', async () => {
    const { UPGRADES } = await import('../src/store/upgrades.ts');
    const step = UPGRADES.find((u) => u.from === 6)!;
    const world = { t: 100, ledgerSeq: 40, residents: [{ id: 'a', money: 300 }, { id: 'b', money: 0 }, { id: 'c', money: 5 }] };
    const up = step.save!({ world, brains: {} }).world;
    expect(up).toMatchObject({ debts: [], debtOffers: [], ledgerSeq: 42 });
  });

  it('a living town upgraded from v6 opens its ledger, and its money checks out from then on', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadSql, fixtureSql } = await import('./saves.ts');
    const dir = mkdtempSync(join(tmpdir(), 'kampung-debts-'));
    try {
      const path = join(dir, 'kampung.db');
      loadSql(fixtureSql(6), path);
      const before = new SqliteStore(path, { upgrades: (await import('../src/store/upgrades.ts')).UPGRADES.slice(0, 5) });
      const old = before.load()!.world;
      const oldLedger = before.ledger().length;
      before.close();
      const store = new SqliteStore(path);
      const town = Town.resume({ store })!;
      expect(town.world.state.debts).toEqual([]);
      const opening = store.ledger().slice(oldLedger);
      expect(opening.every((l) => l.from === OPENING_ID && l.reason === 'opening' && l.t === old.t)).toBe(true);
      expect(opening.map((l) => [l.to, l.cents])).toEqual(old.residents.filter((r) => r.money > 0).map((r) => [r.id, r.money]));
      expect(town.world.state.ledgerSeq).toBe(opening.at(-1)!.seq);
      await town.runUntil(town.t + 60);
      expect(auditLedger(store.ledger(), town.world.state.residents)).toEqual({ ok: true, line: 'ledger OK' });
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the free fake brain, with money', () => {
  const brains = Array.from({ length: 40 }, (_, i) => new FakeBrain(i + 1));

  it('a broke, hungry job-seeker asks someone nearby to lend 50¢', () => {
    const { w } = pair(1000, 5);
    put(w, 'Rahim', 'jetty');
    const siti = put(w, 'Siti', 'well');
    siti.money = 5;
    siti.hunger = 800;
    const asks = brains.map((b) => b.decide(perceive(w, siti))).filter((i) => i?.verb === 'borrow');
    expect(asks.length).toBeGreaterThan(0);
    for (const a of asks) expect(a).toEqual({ verb: 'borrow', to: 'Mdm Tan', money: '50¢' });
  });

  it('an owner with over $30 agrees about half the time; one with less turns it down', () => {
    const { w, tan, rahim } = pair(5000, 5);
    accepted(act(w, rahim.id, { verb: 'borrow', to: 'Mdm Tan', money: '50¢' }));
    const verbs = brains.map((b) => b.decide(perceive(w, tan))?.verb);
    const yes = verbs.filter((v) => v === 'agree').length;
    expect(yes + verbs.filter((v) => v === 'refuse').length).toBe(brains.length);
    expect(yes).toBeGreaterThan(10);
    expect(yes).toBeLessThan(30);
    tan.money = 2000;
    expect(new FakeBrain(1).decide(perceive(w, tan))).toEqual({ verb: 'refuse', from: 'Rahim' });
  });

  it('anyone with over $2 pays back what they owe someone nearby', () => {
    const { w, tan, rahim } = pair(5000, 0);
    accepted(act(w, tan.id, { verb: 'lend', to: 'Rahim', money: '$1.00' }));
    accepted(act(w, rahim.id, { verb: 'agree', from: 'Mdm Tan' }));
    expect(new FakeBrain(1).decide(perceive(w, rahim))?.verb).not.toBe('repay');
    rahim.money = 250;
    expect(new FakeBrain(1).decide(perceive(w, rahim))).toEqual({ verb: 'repay', to: 'Mdm Tan', money: 100 });
  });
});
