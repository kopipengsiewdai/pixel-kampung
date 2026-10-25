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

- Each resident's bucket fills at $0.0139 a game hour up to $0.06 (about 4
  hours' worth). A call is checked against a high estimate first ($0.0015
  routine, $0.04 big).
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
  on both talk only at the quiet pace (every 5 minutes) until the chat has
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
