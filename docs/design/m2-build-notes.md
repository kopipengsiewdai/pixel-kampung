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
  stock.
- **Models and effort.** Routine moments and talk go to Claude Haiku 5.5 at
  low effort. The morning plan, the bedtime reflection and owners' business
  moments go to Claude Sonnet 5.5 at medium effort. Sonnet calls opt into
  server-side fallbacks, so a refused plan is retried on another model, and
  the cost is logged at whichever model answered. Refusals and API failures
  mean the resident rests.
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
  hears what's said but isn't woken to answer at once.

## Trials

- `npm run trial` runs on the owner's PC.
- Trial data goes under `$KAMPUNG_HOME/trials/`.
- All trials together stop at US$10.
- One owner is always among the model-driven residents, so business calls get
  measured.
