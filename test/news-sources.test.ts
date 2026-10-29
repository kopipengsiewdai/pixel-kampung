import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/mind/memory.ts';
import type { GameEvent } from '../src/sim/events.ts';
import { SqliteStore } from '../src/store/sqlite-store.ts';
import { newWorld } from './helpers.ts';

// What Kampung News reads for one kampung day: its events and the replies residents were given.
describe('a kampung day from the save', () => {
  it('events from the day\'s first minute up to, not including, the next day\'s', () => {
    const store = new SqliteStore(join(mkdtempSync(join(tmpdir(), 'kampung-news-')), 'k.db'));
    const w = newWorld(9);
    const e = (seq: number, t: number) => ({ seq, t, type: 'morning' }) as unknown as GameEvent;
    store.save({ world: w.snapshot(), brains: {} }, [e(1, 99), e(2, 100), e(3, 150), e(4, 200)], []);
    expect(store.eventsBetween(100, 200).map((x) => x.seq)).toEqual([2, 3]);
    store.close();
  });

  it('replies ("did") from every resident in that span', () => {
    const m = new MemoryStore(':memory:');
    m.add('siti', 99, 'did', 'early');
    m.add('siti', 100, 'did', 'You have no water: each batch takes a bag of rice and a pail of water.');
    m.add('raju', 150, 'thought', 'not a reply');
    m.add('raju', 199, 'did', 'You set off for the well.');
    m.add('raju', 200, 'did', 'next day');
    expect(m.didBetween(100, 200)).toEqual([
      { resident: 'siti', text: 'You have no water: each batch takes a bag of rice and a pail of water.' },
      { resident: 'raju', text: 'You set off for the well.' },
    ]);
  });
});
