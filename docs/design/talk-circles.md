# Talk that goes round in circles

Status: **agreed** (owner, 2026-10-25: all five questions as proposed), built in PR 13. It
builds on the Talk rules in [m2-build-notes.md](m2-build-notes.md). Nothing
here goes into a resident's prompt except the lines quoted as what they
perceive, and those are in-world words.

## What the living town showed

157 game minutes: 106 lines said, 4 purchases, 0 hires. Rahim and Mdm Tan
swapped 17 lines "settling his account" with no `give`. Ah Seng "hired" Raju
"at your stall", with no stall. Mdm Tan said Ah Seng must decide about her
shop. After 8 lines all they see is "You've been talking with X for a while."
One cause: a job-seeker's fixed card still says "You don't have work at the
moment." after a hire, and nothing in the notes says who runs what.

## a) Knowing what you have and what you are

One line every moment, next to the money and job lines (about 12 tokens):

| Who | Line |
|---|---|
| Owner | `You run the provision shop. It's yours alone.` (starts the shop lines) |
| Worker | after the job line: `You don't run a stall or shop.` |
| No job, no shop | `You have no work just now, and you don't run a stall or shop.` |

It's derived from the world each moment, so it follows hires, firings and
quits (and ownership, if that ever changes).

**Prompt change:** drop the job-seeker's card line "You don't have work at
the moment." (it goes stale once they're hired; their notes now say it). The
owner's "You own the provision shop." stays, since it can't go stale today.
That changes each job-seeker's cached prefix once. No other prompt change.

## b) Words don't move money or goods

**When a line counts as a deal in words.** Only lines said *to* someone
(`say` with a person) count, and only for that person. A line is checked
once, as it's said, against short patterns in a new `src/sim/talk.ts`.
Lowercase it, turn `’` into `'`, split it into sentences on `.`, `!`, `?` and
`…`, and skip any sentence that ends in `?`.

| Kind | Matches when |
|---|---|
| paying | a hand-over phrase **and** money anywhere in the line; or a settled phrase |
| a deal | a hand-over phrase and a thing anyone carries; or a deal word and an amount or a thing |
| a job | a hiring phrase |

```
hand-over:  \b(i|i'll|i will|let me)\s+(now\s+)?(pay|give|hand|put|pass|count|settle)\b
            | \bhere('s| is)\b | \bon the counter\b | \btake (it|this)\b
money:      \$\s?\d | \b\d+\s?(¢|c|cents?)\b | \b(one|two|…|ten|\d+) (dollars?|cents?)\b
            | \b(money|cash|payment|wages?|change|account|debt|bill|duit)\b
settled:    \b(paid in full|all paid|we('re| are) square|i('ve| have) (paid|settled)
            | (account|debt|bill) (is )?(settled|cleared)|count(ing)? (it|the money|your money))\b
thing:      the item names and plurals from items.ts, plus "kangkong"
deal word:  \b(deal|it's a deal|agreed|sold)\b
hiring:     \b(you('re| are) hired|i('ll| will)? hire you|take you on|come (and )?work for me
            | you (can )?start (work|today|tomorrow|at)|i('ll| will)? (take|accept) (the|your) (job|offer)
            | i('ll| will)? work for you|i start (at|today|tomorrow))\b
```

Skip a paying or deal sentence holding `if|maybe|perhaps|tomorrow|later|next|
one day|could|would` (a promise for later isn't owed now); a hiring sentence
only for `if|maybe|perhaps` ("you start tomorrow" still needs an offer now).
All three live examples match; "Wah, so expensive now.", "Any work going,
boss?", "Rice is 30¢ now." and "Can you pay me tomorrow?" don't.

**False positives:** talk *about* past paying ("I paid you back for the kopi
yesterday"), "count it" meaning something else, "here's the thing, $2 too
much lah". Each costs one honest line: the notice is always literally true.
**Misses:** Malay and Hokkien beyond `duit`, amounts in words above ten; a
miss only loses a nudge. Lines to everyone are left out (see questions).

**What answers it** (by event type, between the same two people, either way
round):

| Words about | Settled by |
|---|---|
| paying, a deal | `gave`, `traded`, `trade_offered`, `trade_declined`, `bought`/`sold` (with the shop's owner), `wages_paid` |
| a job | `job_offered`, `hired`, `let_go`, `quit` |

A gift doesn't settle job talk, and a job offer doesn't settle money talk.

**Where it runs.** Nothing runs on the tick, and there's no AI call.
- *On `said`:* a match is written to the pair's talk record as
  `word: { by, kind, t }`. A later match of the same kind keeps the first
  `t`, so narrating on and on doesn't keep putting the notice off. A match of
  the other kind replaces the record with a fresh `t`.
- *On the settling events:* `World.emit` passes each event to a small table
  in `state.ts` (event type → the pair and the kind it settles), which clears
  `word`. Action handlers don't change, and a future deal event needs only a
  new row.
- *In perception:* the line shows while there's a `word`, it's at least
  `WORD_MINUTES = 3` old, the other person is nearby and awake, and the chat
  hasn't been quiet for `TALK_GAP_MINUTES`. Three minutes covers the honest
  case: the line, an answer, and the speaker's `give` at their next moment
  (`t+2`).

**The lines.** Both sides see it, worded for each:

| Kind | The one spoken to | The one who said it |
|---|---|---|
| paying | `You and Rahim have talked of paying, but no money has changed hands.` | `You and Mdm Tan have talked of paying, but no money has changed hands.` |
| a deal | `You and Rahim have talked of a deal, but nothing has changed hands.` | `You and Mdm Tan have talked of a deal, but nothing has changed hands.` |
| a job | `Ah Seng talks about a job, but no job has been offered.` | `You've talked with Raju about a job, but no job has been offered.` |

Paying and deals are worded alike for both (review: the one who says "all
paid" may be the one being paid). Talk of a job isn't noted at all when the
two already have work between them, a job or an offer not yet taken up
("Thank you, boss, I start at one" is thanks, not an empty promise). A sale
across the counter settles talk with whoever served it, a worker on shift
too. Talk that switches between paying and a deal keeps its first minute,
since both are settled by money.

It goes once a settling event happens, once they're apart or one is asleep,
or after 30 quiet minutes. It goes under "The talk so far", beside the
waiting line.

## c) Going round in circles

**The counter.** Each pair's talk record gains `idle`: lines between them
since they last *did* something together. It counts exactly as `lines` does
(once per line said to the other; a line to everyone counts for each pair
that hears it). It's reset to 0 by any settling event in the table above
(either kind), and by either of them setting off on a walk (`walked`, or `went_with` when going with someone), which
covers walking away and walking off together. Like `lines`, it starts again
after 30 quiet minutes.

**The rule.** `CIRCLE_LINES = 6`, beside `TALK_SOFT_LIMIT` in `state.ts`.
- Once `idle >= 6`, both perceive `You and Rahim keep going round in
  circles.` That's in place of "You've been talking with X for a while.",
  never with it.
- From the 7th idle line, the listener hears but isn't woken (in `say`,
  `runsLong` is `lines > TALK_SOFT_LIMIT || idle > CIRCLE_LINES`), and
  nobody is shown as waiting on them. So it's the existing soft limit,
  reached two lines sooner when nothing is being done, with the quiet pace
  after it.
- It goes when they do something together (`idle` back to 0, and waking
  resumes), or after 30 quiet minutes.
- `lines` and the 8-line limit don't change. A chat with a trade in the
  middle still stops waking at line 9: a productive chat gets the old room,
  and an idle one gets less.

**Saved state.** Yes. Talk records become `{ lines, lastT, idle, word }`, so
a restarted town carries on exactly (as with `lastDone`). One upgrade step
covers (b) and (c). It takes **the next version at merge time** (v5 unless
another PR has taken it):
- `why`: "Two people talking keep count of how long it's been since they last
  did something together, and of any deal still only in words."
- `save`: every existing talk record gets `idle: 0, word: null`, unless it
  already has them. That's gentle: nobody is told they're going round in
  circles because of lines from before the change, and the 8-line limit
  still holds. Brains are unchanged.
- Fixtures by `npm run save-fixture`. The test runs it against the v4
  fixture first, and the CHANGELOG says: "Living town: at upgrade, chats
  already going start with nothing counted and no deal pending."

## What not to do

- **No rule lists in prompts** ("use give to pay", "you can't hire without a
  shop"). The world says what's true, in the moment.
- **No lies to steer them.** The matcher only decides *when* a true line is
  worth saying.
- **No AI judging talk**, no new verbs, no blocking or rewriting `say`.
- **Leave made-up objects alone** ("my account book page"): harmless colour
  unless they stand in for an action, which (b) covers.

## Tests (scripted brains, vitest)

- *Knowing yourself:* the owner, worker and job-seeker lines appear as in
  the table, change on `hired`/`let_go`, and pass `expectInWorld`. The new
  system prompt has no line about work.
- *Patterns:* a table of about 30 lines (the live ones, the fake brain's
  chatter, the false-positive cases above) against their expected kind.
- *Unbacked words:* Rahim says the account line to Mdm Tan and nothing
  follows. At `t+3` both see their line, and before `t+3` neither does. A
  version where Rahim gives at `t+2` shows nothing. Job talk that's
  followed by a gift still shows the job line. Lines to someone else, or
  overheard, show nothing. The line goes when one walks away, or after 30
  quiet minutes.
- *Circles:* the `Chatterbox` pair from `talk.test.ts`. After 6 lines both
  see the circles line, the 7th doesn't wake the listener, the waiting line
  goes, and there are at most 6 lines plus the quiet pace in an hour.
  Variants: a trade at line 4 means no circles line at line 6, but the stop
  at line 9 holds; a walk resets the count.
- *Replay of the live exchange:* scripted Rahim and Mdm Tan who only narrate.
  Lines in 30 minutes go from 17 to at most 6 plus the quiet pace, and the
  notice is up by line 4.
- *Every settling event type* clears its kind and resets `idle`.
- *Upgrade:* v4 fixture → step adds the fields and nothing else; idempotent;
  the town resumes and runs half an hour.

## Trial measures

A pure `talkMeasures(events)` in `src/sim/talk.ts`, unit-tested on a
hand-made event list. `trial.ts` already sees every event (`print`), so it
keeps them and prints a `--- talk ---` block under the cost block:

- **Chat:** a run of lines between one pair (said to each other), with no
  gap over 30 minutes.
- **Lines per chat:** the mean and the longest.
- **Talk that led to something:** chats with a settling event between the
  pair during the chat or within 5 minutes of its last line, as a share of
  chats and a share of lines.
- **Talk load:** lines said per resident per waking game hour, beside the
  counts of `bought`, `sold`, `gave`, `traded`, `trade_offered`,
  `job_offered` and `hired`.
- **Words with nothing behind them:** how many were matched, settled in time
  and shown, plus how many times pairs reached the circles line.
- The existing thoughts per resident-hour and US$ per real resident-hour.

`FakeModel` gets a `--circles` mode (like `--chatty`): it answers whoever
spoke last with narrated deals from a fixed list. Half the time it sees an
unbacked or circles line (by seed, time and resident: no saved state), it
gives 20¢ if it can, or else walks off. Otherwise it talks on.

**Before and after for the PR:** commit the measures and `--circles` first
and run them on the unchanged sim, then again with (a)–(c): `npm run trial
-- --fake --hours 24` plain, `--chatty` and `--circles`, seeds 42–44, one
table. Lines per chat and cost are mechanical; the share that leads to an
action only shows *our fake's* reaction. Haiku's is what counts: the live
town (or one paid hour, about US$0.08 of the trial allowance) will show it.

## Risks

- Haiku may answer the circles line in words ("Yes lah, round and round!"):
  one more line, and nobody is woken by it.
- Haggling before an offer is cut at 6 idle lines; any `offer_trade` resets it.
- English-only patterns miss some talk; false hits are honest.

## Questions for the owner

1. Should the one who said it also see their line ("You've talked about
   paying…")? Proposed: yes, since they're the one who can put it right.
2. Should lines said to everyone count, when only one other person hears
   them? Proposed: not yet.
3. Should the unbacked notice also become a memory ("Rahim talked about
   paying, but never did"), so there are grudges? Proposed: not yet.
4. Six idle lines, with the 8-line limit kept as it is: agreed?
5. Can we drop the stale "You don't have work at the moment." from the
   job-seekers' cards?
