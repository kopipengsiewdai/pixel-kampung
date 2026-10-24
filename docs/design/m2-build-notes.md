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
  - 5: words said to you
  - 3: overheard talk, and failed tries
  - 2: everyday doings
  - 8: reflections
- Recall scores recency (0.99 per game hour), importance and word overlap with
  the moment, and keeps 8.
- Memories already shown under "Lately" are left out.
- Trivial memories (importance 3 or less) fade after 14 days.

## Discovery

- Residents see places within 6 tiles and learn people by being near them.
- A place is learned when someone names it in talk or in a note. A one-word
  name only counts with "the", so "the well" counts but "well" doesn't.
- To explore, a resident can walk north, south, east or west (8 tiles).
- An owner knows their own shop from the start.

## Talk

- After 8 lines between two people within 30 minutes, the listener still
  hears what's said but isn't woken to answer at once. That applies to
  everything said to the listener, whether or not they were named.

## Trials

- `npm run trial` runs on the owner's PC.
- Trial data goes under `$KAMPUNG_HOME/trials/`.
- All trials together stop at US$10.
- Each trial keeps its own cost log, so one trial never throttles the next.
- One owner is always among the model-driven residents, so business calls get
  measured.
