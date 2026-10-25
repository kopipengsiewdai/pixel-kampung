# Households, the village head and the village fund

Status: **draft for the owner, revision 2.** It follows the owner's decisions
of 2026-10-25, including the later ones on village characters, Mr Lim's
powers, the village fund and the economy knobs. Where those differ from the
first draft, they win. It lands after `claude/clock-4x` (save v3) and
`claude/answer-waiting` (save v4). All times are game time: a game day is 6
real hours, and a game week is 42 real hours. Every weekday rule goes through
`weekdayAt(world, t)`, and every date rule goes through `dateAt(world, t)`
(`src/sim/calendar.ts`). In code, comments and the changelog, Mr Lim is only
ever "the village head". None of this text goes into anyone's prompt.

## 1. The split: four PRs, four save versions

Each PR is a release with its own version, git tag, upgrade step, frozen
fixture and CHANGELOG "Living town" line. The save numbers below assume the
PRs land in this order. Whichever lands first takes the next number.

| PR | What it ships | Saved-state changes | Upgrade step |
|---|---|---|---|
| **9a Homes** (v5) | Households, take in / move in / tell to leave, sleeping rough, marriage. No village head yet. | `Resident.homeId: string \| null`, `spouseId`. World: `houses[{id, holderId}]`, `proposals`, `homeOffers`, `bonds`, `news`. | v4→v5: build `houses` from the old `homeId`s. Ah Seng moves into Ah Huat's house and Mei Ling into Mdm Tan's (ids frozen, a pair is skipped if either person is missing). Their two old houses get `holderId: null` and stand shut up. `news` tells only the four people involved. Nobody's position, purse or activity changes. |
| **9b The village head (body)** | Map widened to 44 columns. His house, two stalls by the wet market, the village fund, letting houses and stalls, the Monday rent round, eviction after a grace week, his notices, choosing a stall tenant by a simple rule. | World: `villagers['village-head'] = {pos, indoors, duty, path}`, `leases[]`, `rents{placeId: Cents}`, `fund{cents, depositsHeld}`, `villageNotices[]`, `stallCalls[]`. | v5→v6: add the fields. He's indoors at home. Fund $0, no leases, default rents. **Everyone already knows his house and him** (he's been there forever), so the step adds `village-head-house` to every `knownPlaces` and `village-head` to every `knownPeople`. No news: the stalls are found by sight, and his to-let notice goes up at his next 10:00 visit to the board. |
| **9c The village head (head)** | The bounded AI: answers at his door, the monthly rent review, paid odd jobs, hardship help, choosing between stall applicants, development. | `villagers[id].head{day, door, perPerson, big, routine, budget}`, `doorLog[]`, `oddJobs[]`, `loans[]`, `graces[]`, `reviewedMonth`, `builds{underway, built[]}`. | v6→v7: empty lists, zero counts, a full allowance bucket. No news. Odd jobs and help are found in-world, on his notices and at his door. |
| **9d Economy check** | The daily $0 check, the bounded nudges, the owner's dials, health readings in the owner's wiki. | World: `economy{day, nudges}`. Readings go to `$KAMPUNG_HOME/economy/*.jsonl` (private). The dials file isn't saved state. | v7→v8: `economy = {day: null, nudges: NORMAL}`. The first check runs at the next 00:10. |

9a is split off from the village head because it's a full review on its own,
and it gives him nothing to do. Its two freed houses simply stand empty until
9b lets them.

## 2. Village characters: one framework (`src/village/`)

There are two kinds of character. **Residents** (the 10) have needs, sleep,
memories, a brain and a budget. **Village characters** (the village head now,
and Pak Osman the lorry later) have a scripted body and, optionally, a
bounded AI head. They aren't `Resident`s and have no needs, sleep, memory
stream or home life.

- **Definition (code, not saved):** `{ id, name, homeId, routine(w, t): Duty | null,
  head?: HeadSpec }`. The routine is a pure function of the clock and the
  records ("Monday 06:15 → rent round"), so it survives restarts with no
  extra state.
- **Saved body:** `{ pos, indoors, duty: {kind, step, until} | null, path }`.
  Indoors means he isn't drawn or seen, and he's "at home" for his door. He
  walks with `findPath` like everyone else. Perception lists him as a person
  when he's out and nearby: "Mr Lim, the village head". `w.nameOf(id)`
  replaces `w.resident(id).name` wherever an id can be his (notes, ledger,
  feed).
- **Head (`HeadSpec`):** a fixed list of **decisions**. Each decision has a
  tier, a context builder (in-world records phrased in his terms), one tool
  schema, `apply(w, out)` and `fallback(w)`. `apply` can only call
  **effect functions** from a whitelist (§6), and each of those checks its own
  bounds. Output that's invalid or out of bounds is clamped, or else dropped
  and replaced by the fallback.
- **No memory stream.** Context is built fresh from records each time: leases,
  arrears, help given, odd jobs, this person's dealings with him in the last
  28 days (structured, not prose), and today's **door log** (who knocked and
  what was said, at most 6 lines, cleared at midnight) so that a short
  conversation hangs together.
- **Caps, per game day, counted with `dayIndex`:** the village head gets
  **6 door replies** (at most 2 per person), **1 routine** odd-jobs decision
  and **2 big** decisions (review, choosing tenants, a build). That's at most
  9 calls.
- **Allowance:** the same `Budget` class with a rate set per character: **$0.02
  a game day** ($0.08 a real day, 2.4% of the town cap), with a bucket cap of
  $0.04. Every call also goes through `Mind.townSpent`, so the town's $3.33
  real-day cap is shared, not raised. At list prices his realistic spend is
  about $0.005 a game day. The estimates in `ESTIMATE` stay as they are.
- **Cost log:** entries carry the character id (`village-head`) in the
  existing `resident` field, so old log lines still parse. New `ThinkKind`s:
  `door`, `jobs`, `review`, `choose`, `help`, `build`. Failed calls are
  charged their estimate, as residents' are.
- **Fallback, when the bucket is short, the town cap is spent, the API fails
  or a reply is refused or invalid:** every decision has a scripted default
  (§6). At the door he says a canned line: "Mr Lim calls through the door that
  he's busy with village papers; come back tomorrow." Structured business
  (paying rent, renting, reporting a job done) **never needs the AI** and
  always works while he's home.
- **What he says** is guarded like any resident line: at most 240 characters,
  and it passes the in-world text guard. His prompt is in-world too: his
  options are described as duties ("you may raise or lower a rent by up to a
  fifth"), never as a system.
- **Pak Osman later:** his body is the existing 07:00–07:30 lorry visit. His
  head gets one decision (how much to buy, within caps, nudged by §8). His
  ledger account stays `lorry`.

## 3. The ledger accounts and the conservation check

| Account | Inside or outside | Balance kept in | Rules (enforced in `transfer`) |
|---|---|---|---|
| each resident id | inside | `Resident.money` | can't go below 0 (as now) |
| `village-fund` | inside | `fund.cents` | can't go below 0. `depositsHeld` is never spent: only refunds or arrears take from it |
| `lorry` | outside | none (unlimited) | as now |
| `village-head` (his private purse) | outside | none (hidden, unlimited) | **pays out only**: nothing is ever transferred into it |

Each pair of accounts allows only certain reasons (a table in `money.ts`, and
anything else throws):

- resident → fund: rent, deposit, loan repayment
- fund → resident: odd-job pay, loan, deposit refund
- fund → `lorry`: building materials
- `village-head` → resident: odd-job pay, help (only within §8's weekly
  allowance from his purse)
- `village-head` → fund: covering a build's shortfall

There's no route from the fund to his purse, so he can never take from the
fund for himself.

**Identity tests:** (1) *replay*: starting from a save's balances, applying
its ledger in order reproduces every purse and `fund.cents` exactly.
(2) *closure*: Σ purses + fund at any time equals the starting total plus
Σ(outside → inside) minus Σ(inside → outside), where `lorry` and
`village-head` are the outside accounts. (3) `0 ≤ depositsHeld ≤ fund.cents`
always, and no ledger entry has `to: 'village-head'`. (4) Goods: nothing the
village head does changes the town's item totals. Only the lorry and
production (fish, harvests) do.

## 4. His house on the map, and how residents find it

The house row is full: houses run from x=1 to x=39 (x=1+4i, 3 wide, y=1..2),
so there's no free 3-wide spot at the top of a 40×30 map. **Proposal: widen
the map to 44×30** and put the village head's house at the top-right end of
the house row, "at the top of the kampung":

- Place `village-head-house` (kind `village_head_house`, "the village head's
  house"), with rect `{x:40, y:0, w:4, h:4}` (a bigger house on a rise, plus
  its porch row) and spot `(41, 3)`, the porch. **At his door** means being on
  the porch. The main footpath `hLine(4, 1, 38)` becomes `hLine(4, 1, 41)`.
- No saved coordinate moves, because the new columns are only added on the
  east. Grass, sand and sea fill them by row, as `buildGrid` already does.
  `view.ts` and `explore` already read `MAP_W`. `decor.ts` gets a new
  `village-head-house` building frame at (40, 0), a fence, and a palm at
  about (42.5, 19). The banana at (39, 2) stays as the gap marker.
- The stalls go where the first draft put them: "the stall under the tree"
  `{x:24, y:11, w:3, h:2}` and "the corner stall" `{x:29, y:11, w:3, h:2}`,
  with a footpath along y=10 from x=24 to x=32. Move the tree at (27, 12) and
  the flower at (29, 13).
- **How residents find it:**
  - They know it from the start (the 9b upgrade).
  - `PLACE_WORDS`: "village head's house", "Mr Lim's house", "the big house".
  - It's in sight (`SIGHT_TILES` 6) from houses 9 and 10 and the east end of
    the path.
  - Every notice of his is signed "Lim, village head, at the big house at the
    top of the path".
  - `walk_to Mr Lim` goes to him if he's out and they've seen him, and
    otherwise to his porch.
- If the owner would rather not widen the map, the fallback is open ground
  "up behind the lorry stop" (x=34..37, y=11..13). That isn't the top of the
  kampung (open question 1).

## 5. His routine (9b, all scripted)

| When (`weekdayAt` / time of day) | Duty |
|---|---|
| Every day, 08:00–19:00, while indoors | Answers knocks |
| **Monday 06:15** | **The rent round.** He calls at each tenant's home door (stall tenants too, at home), then at any let stall whose tenant has no home, then passes the board, and is back by about 07:45. |
| Any day, 10:00, if a notice is waiting | Walks to the board, pins it, walks home |
| Build days, 09:00–12:00 (9c) | Stands at the build site |
| Otherwise | Indoors. Unseen. |

When `skipQuietly` covers a duty during downtime, the duty just doesn't
happen. In particular, **rent is only owed for rounds he actually made**, so
downtime never leads to an eviction.

**Rent, with numbers.** House rent is **$1.50 a week**. A stall is **$3.00 a
week plus a $5.00 deposit**, so opening a stall takes about $12 with stock.
These are the starting `rents` and are reviewed monthly in 9c.

1. **Taking a lease** at his door: pay the first week (plus the deposit for a
   stall). That covers you until the first Monday at least 4 days away.
   Anyone who can pay may rent a house that's to let.
2. **Monday round:** when he calls, the tenant pays **if they're within 3
   tiles, awake and have the amount**. Rent comes first, then any loan
   instalment. The tenant pays the full amount or nothing (open question 2:
   is this hand-over at the door all right, or should rent only ever be paid
   at his house?). Paid: "Mr Lim came by for the rent; you paid him $1.50."
   Missed: "Mr Lim called for the rent and found you out. You owe him $1.50
   by next Monday." From then on, a one-line reminder shows until it's paid.
3. **The grace week:** you can pay at his door any day, 08:00–19:00. Paying
   ahead is allowed up to 4 weeks.
4. **Next Monday's round:** if last week's rent is still owed and you can't
   pay both weeks then and there, he **takes the place back on that call**.
   For a house, everyone living there goes back to a house they hold, or to
   nowhere (sleeping rough). For a stall, its stock goes into the tenant's
   hands and its workers' jobs end, but wages owed still stand. The deposit
   pays the arrears and the rest is refunded. Unpaid house arrears are written
   off: there's no debt. The place goes back on his to-let notice that
   morning.
5. **Never a family home:** `evict` needs a lease. The original houses and
   anything held without a lease can't be taken.

**Letting a stall:** when a stall frees up, he pins "A stall to let: the
corner stall, $3.00 a week, $5.00 down. Come to my house by Thursday
evening." Applications stay open **3 game days**. On the 4th day at 09:00 he
chooses, and in 9b the rule is: **the earliest applicant who doesn't already
run a business**. The chosen one is told in-world and has **2 days** to come
and pay. If they don't, he offers it to the next applicant. With one
applicant, that person gets it. With none, the notice stays up.

## 6. What's scripted, what's AI, and the hard bounds

| Power | 9b scripted | 9c AI decides | Hard bounds in code | Fallback |
|---|---|---|---|---|
| Rents | Collected on Mondays | Monthly review: first Monday of each kampung month (`dateAt(...).day ≤ 7`), after the round | ±20% of the current rent, in 5¢ steps, once a month. House rent stays between 50¢ and $6; stall rent between $1 and $12. A change takes effect the Monday after next, with a notice. | No change, or −10% if a place stood empty all month |
| Eviction | After one unpaid grace week, leases only | Never. AI can only *grant* an extra grace week. | Needs a lease and arrears from before last Monday. Never a family home. | n/a |
| Notices | To let, a free stall, odd jobs, rent changes, builds, all from templates | One short village-news notice a week at most | At most 200 characters, passes the text guard, never states a rule | Templates only |
| Disputes | n/a | Words at his door | **No effect function is reachable.** Words only. | Canned line |
| Odd jobs | The work and the pay | Once a day: whether to post one, which one, and the pay | Picked from a code catalogue (mend the jetty, clear the path, carry stores up from the lorry, weed round the well, help build). At most 2 open. Pay is 40¢ an hour, from 40¢ to $1.50, paid from what the fund can spend, or from his purse only within §8's allowance. | Post one catalogue job if the fund can pay and fewer than 1 is open |
| Stall tenant | Earliest eligible applicant | Chooses among the eligible | The choice has to be on the eligible list | The 9b rule |
| Hardship help | n/a | At his door, when asked | Grace: one week, once per tenant per 28 days. Loan: at most $3.00, one open loan per person, at most $10 open in total, from the fund. Repaid 50¢ on each Monday round. An unpaid loan only means no more help. | Grace if in arrears and eligible. Otherwise a $1 loan if they're under 50¢ and have none open. Otherwise a kind no. |
| Development | Builds a release brings (the in-world reason new things appear) | Monthly: whether to start a build from the catalogue | One build at a time, at most one a month. The fund must hold the cost plus a $10 reserve. Materials go fund → `lorry`. Built places are code slots that `builds.built` switches on. | Nothing is built |

**He can never:** touch a resident's money outside the agreed rent,
repayments and pay; change a shop's prices or stock; hire or fire for
someone else; create goods; arrange or forbid a marriage; or take a family
home. There are **no effect functions** for any of these, so nothing his AI
writes can do them. A test lists the whitelist and fails if it grows without
a review.

When a release adds something (a third stall, the ferry), its upgrade adds a
catalogue entry marked `fromRelease`. He starts it at once: he puts up the
notice, oversees the work and lets out the new place. That way the town sees
the change as his work.

## 7. In-world actions (listed only when they apply)

At his porch (`here` = at his door), only while he's home and in door hours.
Otherwise the porch shows "The door's shut and the house is quiet. Mr Lim must
be out." or, at night, "The house is dark. Better not knock at this hour."

| Verb | `says` | Shown when | PR | Refusals (in-world) |
|---|---|---|---|---|
| `knock` | knock and say something to Mr Lim (words) | always at his door | 9b: canned reply. 9c: his voice. | "Nobody answers." |
| `pay_rent` | pay Mr Lim rent (house or stall; weeks) | you rent from him | 9b | "You've paid up to Monday the 21st." / "You only have 80¢." |
| `rent_place` | rent a house or ask for a stall Mr Lim has to let (which) | something is to let | 9b | "Mr Lim says that isn't to let." / "You already have a business to run." / "Mr Lim wants $1.50 for the first week. You have 80¢." |
| `hand_back` | hand back a house or stall you rent (which) | you rent from him | 9b | "You don't rent that from Mr Lim." |
| `take_odd_job` | take on a job Mr Lim needs doing (which) | a job is open and you have none of his | 9c | "Mr Lim has given that one to Siti." |
| `report_odd_job` | tell Mr Lim his job is done | your job's hours are done | 9c | "Mr Lim says the jetty still wants another hour." |
| `ask_for_help` | ask Mr Lim for help (words) | you owe him, or you have under $1 | 9c | His reply, or the fallback |

Away from his door, the work itself is `do_odd_job` ("work on Mr Lim's job"),
shown at the job's place. It runs as a shift (`working` with an odd-job id)
and gives "That's the path cleared. Mr Lim will want to hear." Jobs lapse
after 2 game days. `say` to him when he's out on his round gets a scripted
"Mr Lim nods. 'Come by the house and we'll talk.'", with no AI involved.

His reply to a `knock` arrives as a heard line ("Mr Lim says: …"), so the
answer-waiting change brings the resident's next thought. Prompt growth: none
away from his porch, about 6 action lines and a 1-line view at it.

## 8. The economy check and the owner's dials (9d)

- **Once a game day at 00:10, scripted, $0.** It measures money in
  circulation (Σ purses, and the fund separately), the median purse, the
  number of people who are broke (under 50¢) and the share held by the top 2
  (hoarding), unemployment (seekers with no job and no earnings for 2 days),
  shop prices against town reference prices (a code table based on the
  lorry's prices), and 7-day flows from the ledger.
- It produces **bounded nudges**, saved in `world.economy`:
  - `work`: `scarce` or `normal`
  - `money`: `tight`, `normal` or `flush`
  - `purseWeekly`: 0 to $8, a hard ceiling
  - `lorry`: `buy_more` or `normal`, for Pak Osman later

  Fallbacks read the nudges too: tight money means more lenient help, scarce
  work means up to 2 odd jobs, flush means the review may rise. The AI only
  sees them as a line in his own terms: "Times are hard: several folk are out
  of work. You could put up to $4.00 of your own towards odd jobs or help this
  week." The §6 caps still apply on top.
- **Owner dials:** `$KAMPUNG_HOME/economy.json` holds `generosity` (0–1,
  default 0.5), `tightness` (0–1, default 0.5) and `targetMoneyPerResident`
  (default $20). The documented defaults live in `src/economy/dials.ts`. The
  file is re-read once a game day, and a bad value falls back to the default
  with a console warning. It's never in the repo.
- **Owner view:** the wiki shows the fund, his purse's total paid out, and
  the latest readings and nudges, read from the private JSONL. Residents
  never see any of it: nothing reaches perception, and the text guard rejects
  words like "economy", "nudge" and "money supply".

## 9. Tests

- **9a:** the v4 fixture upgrades to the expected households with no change
  to money or positions; running the step twice changes nothing; a missing
  cast member is handled; the news goes out once. Also tested: take in, move
  in and tell to leave; sleeping rough only at the rough spots, with rest at
  2 a minute capped at 750; `skip.ts` for the homeless; bonds count days, not
  lines; each marriage refusal; offers lapse.
- **9b:** the map is 44 wide; every old place, tile and path is unchanged;
  his porch is reachable from every house. The upgrade makes him known to
  all. Rent: the round goes by `weekdayAt` (a test sets the calendar so day 0
  isn't a Thursday), payment within 3 tiles, word left when the tenant is
  missed, paying at his door, paying ahead, eviction on the second Monday and
  not before, no eviction after downtime, family homes refused. Stall flow:
  the application window, the rule, the 2-day offer moving to the next
  applicant, the deposit settling arrears. Notices are pinned at 10:00 and
  never pushed off by residents' notes.
- **9c:** each decision with the fake model: an out-of-bounds answer is
  clamped or dropped (rent +50% becomes +20%, a $9 loan is refused, a third
  odd job is refused); the effect whitelist is snapshot-tested; caps per game
  day and per person; fallbacks when the bucket is empty, the town cap is
  spent or the API throws; cost-log lines carry `village-head`; the door
  reply wakes the resident; his words pass the text guard.
- **9d:** readings on hand-built worlds (broke, flush, hoarding); nudges
  within range; dials read, clamped and defaulted; nothing reaches
  perception.
- **Every PR:** all four ledger identities (§3) over a 2-game-week fake run;
  the in-world text guard over every new `says`, refusal and line; typical
  perception grows by 30 tokens or less away from his porch.

## 10. Open questions for the owner

1. **The map:** widen to 44 columns so his house can stand at the top-right
   end of the house row? (The alternative is behind the lorry stop.)
2. **Rent at the door:** on his Monday round, may the tenant hand rent over
   automatically when he calls (as a standing part of the lease), or must
   they always go and pay at his house?
3. **Numbers:** house $1.50 a week; stall $3.00 plus $5.00 down; 6 door
   replies a game day; loans up to $3.00 ($10 open in total); his purse at
   most $8 a week; his AI allowance $0.02 a game day. Are these right?
4. **The fund's start:** begin at $0 (this draft), or seed it from his purse?
5. **His door log** (today's conversations, cleared at midnight): is that
   within "no memory stream"?
6. **The owner's wiki** doesn't exist yet. Should it be an owner-only page
   served by the watch server on localhost?
7. **Carried over:** who can't marry (father/son, aunt/niece, cousins;
   in-laws Rahim and Fatimah?); can anyone take anyone in; can a head tell
   their spouse to leave; Rahim's second stall: one business each for now?

## Appendix: carried over from the first draft (9a detail)

- **Households:** `homeId` is the house someone lives in, and `null` means
  they sleep rough. A house's `holderId` is its head. A house is named after
  its holder ("Ah Huat's house"). A holder may live elsewhere, with a spouse
  for example. The houses people already live in are family homes, owned
  outright and rent-free.
- **Grown close:** `bonds` counts the game days on which both people spoke to
  each other, at most once per pair a day. Close means 5 such days.
- **Verbs:**
  - `take_in` (offer someone a home in a house you head)
  - `move_in` (accept an offer, which lapses after 2 h)
  - `tell_to_leave` (in person)
  - `propose` (to an unmarried person you're close to who's nearby)
  - `marry` and `turn_down` (a proposal lapses after 30 min)

  Close kin can't marry: Ah Huat and Ah Seng, Mdm Tan and Mei Ling, Muthu and
  Raju. `marry` moves nobody: either spouse can then `take_in` the other.
- **Sleeping rough:** `sleep` with no home works only at a rough spot: the
  jetty's landward end (31, 23), the kopitiam bench (6, 12), or under the
  eaves at (0, 3). Rest is 2 a minute instead of 3, capped at 750. Elsewhere
  the refusal is "You'd want somewhere sheltered to lie down." Waking after a
  night out: "You slept rough on the jetty, and you're stiff all over."
- **Feed** (★ = notable): ★ moved in, ★ told to leave, ★ proposed,
  ★ married, ★ first night sleeping rough. 9b adds ★ rented, rent paid,
  ★ rent missed, ★ took the place back, and ★ the village head pins a notice.
  9c adds ★ odd job done and paid, ★ helped, and ★ a build begins or opens.
- **Risks:**
  - A homelessness spiral. The mitigations are the 750 cap, cheap rent, the
    grace week, hardship help and anyone being able to take someone in.
    Watch for anyone homeless for more than 2 game weeks.
  - New stall owners each add up to 3 business moments a day. Measure it.
  - Loops: telling someone to leave and taking them back, or proposing
    again and again. `lastDone` and lapsing offers help, and a one-day
    cooldown can be added if needed.
  - `shopOf` assumes one shop per person.
  - The role line in the system prompt is rebuilt when someone takes a
    stall, which costs one cache miss.
