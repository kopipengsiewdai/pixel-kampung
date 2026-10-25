# M2 build notes: calls made while building

Status: **Claude's calls, for the owner to review.** These fill in details
under the agreed [M2 decisions](m2-decisions.md) and [v1 spec](v1-spec.md)
§4–5. None of this goes into any resident's prompt.

## How a resident thinks

- **One call per moment.** The resident's card and one action tool, `do`,
  are the fixed, cached part. What they perceive, a few memories, today's plan
  and the things they could do right now are the changing part. Their last
  action's result arrives in the next moment's notes, so no back-and-forth
  history is sent.
- **Only actions possible right now are listed**, and only in the changing
  part. A resident who has never met the lorry never reads about ordering
  stock. The `do` tool itself stays generic (action, where, person, words,
  item, amount, money, details). Anything action-specific is named only in
  the hint for an action that is possible now.
- **Models and effort.** Every call goes to Claude Haiku 5.5 for now (owner,
  2026-10-24, after trial 1). Routine moments and talk run at low effort. The
  morning plan, the bedtime reflection and owners' business moments run at
  high effort instead of on a bigger model. If they're ever put back on
  Sonnet, those calls opt into server-side fallbacks again (Haiku has none),
  and every attempt is logged at its own model's price (a declined one too).
  Refusals and API failures mean the resident rests.
- **No automatic retries.** A timed-out request may still be billed. So a
  failed call is charged at its estimate and logged, and the resident tries
  again at their next moment. A trial stops early if the API rejects a
  request (4xx other than 429).
- **Owners' business moments** are opening the shop for the day and meeting
  the lorry, at most 3 a day.
- **Reflection** happens once an evening, as the resident lies down after
  20:00 or at 22:30 if they're still up.

## Budget

- Each resident's bucket fills at $0.0139 a real hour (4.8 game hours on the
  kampung clock, since 2026-10-25) up to $0.06 (about 4 real hours' worth). A call
  is checked against a high estimate first ($0.0015 routine, $0.01 big; big
  was $0.04 when it meant the bigger model). A plan, reflection or business
  call that can't be afforded yet isn't lost for the day: it's made later,
  once the money is there.
- The town's $3.33 daily cap is counted from the day's cost log, so it holds
  across restarts. A bucket restarts from its saved level.
- A cost-log line that can't be read (cut off by a power cut) counts as $0.04,
  so a damaged log can only make the town more careful.
- **Possible gap:** Haiku 5.5 only caches prefixes of 512+ tokens. Ours is
  close to that, so the paid trials should check `cacheRead`. At Haiku prices
  the difference is small either way.

## Memory

- Importance is rule-based, so it costs nothing:
  - 8: hired or fired
  - 7: wages and debts
  - 6: trades
  - 5: words said to you, and your own
  - 3: overheard talk, and failed tries
  - 2: everyday doings
  - 8: reflections
- Recall scores recency (0.99 per game hour), importance and word overlap with
  the moment, and keeps 8.
- Memories already shown in the notes (under "Lately" or "The talk so far")
  are left out; older things heard can still come back.
- Trivial memories (importance 3 or less) fade after 14 days.

## Discovery

- Residents see places within 6 tiles and learn people by being near them.
- A place is learned when someone names it in talk or in a note. A one-word
  name only counts with "the", so "the well" counts but "well" doesn't.
- To explore, a resident can walk north, south, east or west (8 tiles).
- An owner knows their own shop from the start.
- Family and old friends (each card's Knows line) are known from day one;
  everyone else is met in play.

## Talk

- **A speaker waits for an answer.** Saying something doesn't bring the
  speaker's next thought forward (any other action that works does, to the
  next minute). Being spoken to wakes them instead. So a chat goes line by
  line, one line a minute between two people, not two.
- After 8 lines between two people within 30 minutes, the listener still
  hears what's said but isn't woken to answer at once. That applies to
  everything said to the listener, whether or not they were named. From then
  on both talk only at the quiet pace (every 10 game minutes on the kampung clock) until the chat has
  been quiet for 30 minutes.
- A speaker remembers their own words (`You say to Ah Seng: "..."`). The last
  6 lines of a resident's own conversations from the last 30 minutes (said to
  them, to everyone, or by them) are shown together, oldest first, under "The
  talk so far". Talk between others is only overheard and stays under
  "Lately". (Trial 2 showed residents re-greeting each other with every line:
  a speaker never saw what they had said.)
- Measured with two residents who always answer each other: 119 lines in an
  hour before this rule, 29 after. A free trial where every resident answers
  whoever last spoke to them (`npm run trial -- --fake --chatty --hours 4`)
  went from 38.4 calls per resident-hour to 14.2.
- **Someone spoken to sees who is waiting on them** (2026-10-25; live data:
  17 of 29 lines said to someone got no reply within 3 minutes). When someone
  nearby spoke to you first and you haven't answered since, your notes say
  `Ah Kow is waiting for your answer.` It goes once you answer (to them or to
  everyone), once they've left or fallen asleep, after 15 minutes, or once the
  chat has run long. An answer to something you said doesn't keep you waited
  on, so each opener gets an answer without the pair going back and forth for
  its own sake.
- **Doing the same thing again doesn't bring the next thought on.** An action
  identical to the resident's last successful one, within the quiet pace (10 game minutes) of it,
  still goes through, but the next thought comes at the quiet pace, and the
  reply adds "You've just done that." (A live owner re-set the same price
  every minute, 37 times, and never answered the two people waiting.) What
  they last did is saved (`lastDone`), so a restarted town carries on
  exactly.
- Measured on the free fake model, 10 residents for 17 waking hours over 3
  seeds, with the fake answering anyone shown as waiting: openers left
  unanswered within 3 game minutes went from 167 of 174 to 23 of 134, for
  3.7% more thoughts (5054 to 5240). Chatty mode barely moved (7 of 44 to
  6 of 40). Haiku's response to the line is what counts; the live town will
  show it.

## Trials

- `npm run trial` runs on the owner's PC.
- Trial data goes under `$KAMPUNG_HOME/trials/`.
- All trials together stop at US$10.
- Each trial keeps its own cost log, so one trial never throttles the next.
- One owner is always among the model-driven residents, so business calls get
  measured.

### Trial log

**Trial 1 (2026-10-24):** 3 residents on the model for 4 game hours
(Monday 06:00–10:00), capped at US$1, on the `pixel-kampung` workspace key.

| Measure | Result |
|---|---|
| Calls | 441 (plan 3, act 437, business 1), about 37 per resident-hour |
| Tokens | 932K in (36% from cache), 102K out, about 2.1K in / 231 out per call |
| Spent | US$0.132 |
| Per waking resident-hour | **US$0.0110**, which is 79% of the US$0.0139 ceiling |
| Failed calls | 1 (`APIConnectionError`, a one-off network error) |
| Story | two hires by 08:19: Ah Kow at the provision shop, Ah Seng at the wet-market stall |

How this compares with the spec's guesses (§5): calls are smaller (2.1K in vs
4K) but far more frequent (about 37 per hour vs about 12). The ceiling is
averaged over 24 hours and nights are free, so a full day projects to about
US$0.24 per resident (17 waking hours × $0.0110 + about $0.05 for the evening
reflection, *estimate*). That's about **US$0.0099 per resident-hour, 71% of
the ceiling**. The trial didn't cover the evening reflection or a full day of
owners' business decisions; the next trials need to measure both.

Caching does work on Haiku (36% from cache), so the 512-token gap above is
only partial.

**Trial 2 (2026-10-25):** the whole town (10 residents, all on Haiku 5.5)
from Monday 06:00, stopped by the owner after 54 game minutes. 469 calls,
US$0.136, **US$0.0151 per waking resident-hour (109% of the ceiling)**, at 52
thoughts per resident-hour. 307 of 434 events were talk, in ping-pong pairs
(one pair swapped 101 lines). The cause: every successful action, `say`
included, pulled the speaker's next thought to the next minute. Fixed in #12.

**Trial 3 (2026-10-25), after the fix:** the whole town for one game hour
(06:00–07:00), capped at US$1. 263 calls, US$0.082, **US$0.0082 per waking
resident-hour (59% of the ceiling)**, at 26 thoughts per resident-hour. Talk
fell to 40 of 253 events, and walking and exploring doubled. Projected over a
full day (17 waking hours plus about $0.01 of reflection, *estimate*): about
US$0.15 per resident a day, **about US$45/month for the town**.
