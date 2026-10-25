import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/sim/events.ts';
import { dealKind, settledBy, talkMeasures } from '../src/sim/talk.ts';

describe('telling a deal done in words from the talk around it', () => {
  const cases: [string, ReturnType<typeof dealKind>][] = [
    // From the living town.
    ['I put my $64.56 on the counter. Count it in front of me.', 'paying'],
    ['I count it now in front of you, every cent.', 'paying'],
    ["You're hired, Raju. Come at 8 o'clock to my stall, $1.50.", 'job'],
    // Paying and settling.
    ["Here's your 30¢ for the kopi.", 'paying'],
    ['I will pay you two dollars now.', 'paying'],
    ["There, we're square now.", 'paying'],
    ['Your account is settled.', 'paying'],
    ['Let me give you the money for the rice.', 'paying'],
    ['Take it, the cash is yours.', 'paying'],
    // A deal in goods.
    ["Here's a fish for you.", 'deal'],
    ['Deal! 3 fish for your bread.', 'deal'],
    ['Agreed, two bags of rice.', 'deal'],
    // Jobs.
    ['I will hire you for the morning shift.', 'job'],
    ['Come and work for me at the kopitiam.', 'job'],
    ["I'll take the job, boss. I start tomorrow.", 'job'],
    ['You can start today.', 'job'],
    // Not deals.
    ['Wah, so expensive now.', null],
    ['Any work going, boss?', null],
    ['Rice is 30¢ now.', null],
    ['Can you pay me tomorrow?', null],
    ['Morning! Yes, about that deal...', null],
    ['Sorry, give me a moment... yes?', null],
    ['If you come early, maybe I hire you.', null],
    ['I could pay you later, after the lorry.', null],
    ['Good morning, Mdm Tan.', null],
    ['How much for the fish?', null],
    ['The kopi here is the best.', null],
    // Ordinary stall talk that only looks like a deal (review).
    ['I sold all my fish at the market today.', null],
    ['The fish sold out by eight.', null],
    ["I'll give you a call when the fish come in.", null],
    ['Agreed. One more thing.', null],
    ['Deal, see you at 6.', null],
    ['Take it easy, the bill can wait.', null],
    ['I give up, no money left.', null],
    ['Here is the thing, rice is $2 now.', null],
  ];
  for (const [text, kind] of cases) {
    it(`"${text}" → ${kind ?? 'nothing'}`, () => expect(dealKind(text)).toBe(kind));
  }
});

describe('what settles words between two people', () => {
  const ev = (body: Record<string, unknown>) => ({ t: 1, seq: 1, ...body }) as unknown as GameEvent;
  it('money or goods changing hands settles talk of paying and deals; a job offer settles talk of a job', () => {
    expect(settledBy(ev({ type: 'gave', who: 'a', to: 'b', item: null, qty: 0, cents: 20 }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'traded', who: 'a', with: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'trade_offered', who: 'a', to: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'trade_declined', who: 'b', from: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'money' });
    expect(settledBy(ev({ type: 'bought', who: 'a', from: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'sold', who: 'a', to: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'wages_paid', who: 'a', to: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'money' });
    expect(settledBy(ev({ type: 'job_offered', who: 'a', to: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'job' });
    expect(settledBy(ev({ type: 'hired', who: 'b', by: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'job' });
    expect(settledBy(ev({ type: 'let_go', who: 'a', worker: 'b' }))).toEqual({ a: 'a', b: 'b', kind: 'job' });
    expect(settledBy(ev({ type: 'quit', who: 'b', from: 'a' }))).toEqual({ a: 'b', b: 'a', kind: 'job' });
    expect(settledBy(ev({ type: 'said', who: 'a', to: 'b', text: 'hi' }))).toBeNull();
    expect(settledBy(ev({ type: 'bought', who: 'a', from: 'lorry' }))).toBeNull();
  });
});

describe('measuring talk in a trial', () => {
  let seq = 0;
  const say = (t: number, who: string, to: string | null) => ({ t, seq: ++seq, type: 'said', who, to, text: '...' }) as GameEvent;
  it('counts chats, their length, and the share of chats and lines that led to something', () => {
    const events: GameEvent[] = [
      // A chat of 4 lines that ends in a gift.
      say(10, 'a', 'b'), say(11, 'b', 'a'), say(12, 'a', 'b'), say(13, 'b', 'a'),
      { t: 15, seq: ++seq, type: 'gave', who: 'a', to: 'b', item: null, qty: 0, cents: 20 } as GameEvent,
      // A chat of 6 lines that leads nowhere.
      ...[20, 21, 22, 23, 24, 25].map((t, i) => say(t, i % 2 ? 'd' : 'c', i % 2 ? 'c' : 'd')),
      // The same pair again after more than 30 quiet minutes: a new chat of 2.
      say(70, 'a', 'b'), say(71, 'b', 'a'),
      // Lines to everyone aren't chats.
      say(72, 'c', null),
    ];
    const m = talkMeasures(events);
    expect(m.chats).toBe(3);
    expect(m.lines).toBe(12);
    expect(m.meanLines).toBeCloseTo(4, 5);
    expect(m.longest).toBe(6);
    expect(m.ledChats).toBe(1);
    expect(m.ledLineShare).toBeCloseTo(4 / 12, 5);
  });
});
