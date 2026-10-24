# Pixel Kampung v1 spec

Status: **draft for owner approval** (2026-10-24). Every owner decision this
builds on is in [principles.md](principles.md). Where this spec makes a call
the owner didn't, it says so.

## 1. What v1 is

A 1960s Singapore kampung running 24/7 on the owner's PC, in real time.
Ten AI residents live there: 3 own businesses (kopitiam, provision shop,
wet-market stall) and 7 start out looking for work. Anyone can fish at the
jetty or grow vegetables on the farm plot. The owner watches through a
local web page that shows the pixel town and a live story feed. There are no
human players and no combat.

**Done means:** the town runs unattended for 7 real days within budget, with
no crashes it can't recover from, and the feed shows at least one story nobody
scripted (a hire, a quarrel, a price war, someone saving up for something).

## 2. The world

- **One map**, about 40×30 tiles. It has the five places, an attap house for
  each resident, footpaths, a well, a notice board and the jetty over the sea.
- **Time:** 1 game minute = 1 real minute, in Singapore time. Night runs
  23:00–06:00, when residents sleep and think nothing (no AI cost).
- **Money:** dollars and cents. Each resident starts with $5–$20 and each
  owner with $60–$100 (owners also start with stock). *Claude's call.*
- **Needs:** hunger (eat at least twice a day) and energy (sleep). Needs keep
  money circulating: everyone has to buy food or catch and grow it.

### The lorry: the town's link to the outside

One scripted, non-AI lorry comes every morning at 07:00. Owners can **order
stock** from it at fixed prices (money out of town) and **sell surplus** fish
or vegetables to it at fixed, lowish prices (money into town). It gives out no
jobs or quests, so it's consistent with "residents give out work". Without it
the economy has no source or sink and would freeze or drain. *Claude's call,
for the owner to confirm.*

## 3. What residents can do (the v1 action space)

This list is the only thing they can do, per the core principle. Action names
are in-world verbs; an impossible attempt gets an in-world reply.

| Everyone | Owners also |
|---|---|
| walk to a place or person | set prices for their goods |
| look around | offer a job (wage, hours) |
| say something to someone nearby | let a worker go |
| buy, sell or offer a trade | pay wages |
| fish at the jetty (takes time; the catch varies) | order stock from the lorry |
| plant, water and harvest on the farm plot (crops take days) | cook (kopitiam: ingredients → meals) |
| eat, sleep | |
| accept or quit a job; work a shift | |
| give an item or money | |
| read the notice board / pin a note on it | |

"Start a business" is **not** an action in v1. A resident can save money and
talk about it, but opening a new stall waits for a later feature that they
will have to discover in the world.

## 4. How a resident thinks (the agent harness)

- **Perception only:** each call sees the time, the place, who and what is
  nearby, what was just said or done, the character's own needs, money and
  items, their relevant memories, and the actions available right there.
  No game docs, feature lists or system text, ever.
- **Memory:** an append-only memory stream per resident in
  `~/.kampung/` (what they saw, said, did and felt), with retrieval by
  recency, importance and relevance, plus an evening reflection that distils
  the day. (Borrowed from Smallville.)
- **When they think:** event-driven. A resident thinks when something
  happens to them (they're spoken to, a job ends, they're hungry, they arrive
  somewhere) or after about 5 quiet minutes. They never think while asleep.
- **Which model:**
  - Claude Haiku 5.5 at low effort for routine actions and talk.
  - Claude Sonnet 5.5 for the morning plan, the evening reflection, and owners'
    business decisions (pricing, hiring, ordering stock).
  - Nothing bigger in v1.
- **Rule enforcement is in code, not the prompt.** The game validates every
  action. An invalid one gets an in-world reply ("Ah Huat doesn't have
  any fish to sell"), and the resident tries again or gives up.

## 5. Cost model (estimate)

Prices: Claude Haiku 5.5 is $0.10 in / $0.50 out per million tokens, and
Claude Sonnet 5.5 is $2 / $10 (Anthropic list prices, cached 2026-10-06).
Token sizes per call are **assumptions** that milestone 2 measures.

| Per resident per day | Calls | Est. cost |
|---|---|---|
| Morning plan (Sonnet, ~8K in / 1.5K out) | 1 | $0.031 |
| Evening reflection (Sonnet, ~15K in / 2K out) | 1 | $0.050 |
| Routine actions (Haiku, ~4K in / 600 out) | ~192 (every 5 min, 16 waking hours) | $0.134 |
| Talk (Haiku, ~5K in / 300 out) | ~40 | $0.026 |
| **Worker total** | | **$0.241** |
| Owner business decisions (Sonnet, ~10K in / 1.5K out) | 3 | +$0.105 |
| **Owner total** | | **$0.346** |

Town average: **$0.273 per resident per day, or $0.0114 per resident-hour**,
against the $0.0139 ceiling. That's about **$82/month for the town**, leaving
roughly 18% headroom under $100.

**Spending limits, in three layers:**

1. **A separate API key with a hard cap.** Kampung uses its own Anthropic API
   key in its own Console workspace, which has a **US$100/month spend limit**.
   The $200/month credit is shared with ARC-1, so a runaway loop here can never
   eat into ARC's share. The key lives only in `~/.kampung/.env`, never in the
   repo or in chat.
2. **Per-resident throttle.** Each resident gets a budget of $0.0139 of AI per
   hour, which builds up while they sleep or stay idle and has a cap. A
   resident who has spent it waits (in-world, they "potter about") until it
   refills. Owners' business decisions draw from the same budget.
3. **Town daily cap.** If the whole town reaches its daily allowance
   ($3.33/day), every resident falls back to resting (no AI calls) until
   midnight, and the feed says so in-world ("the kampung is quiet this
   afternoon").

**Cost log:** a daily file in `~/.kampung/costs/` records each call's model,
tokens and real cost per resident, with day totals against the caps. It is
private and never committed.

## 6. Story feed and watch page

- **Feed:** built from game events and residents' own words, using templates
  ("Mei Ling bought 2 kopi from Ah Huat for 20¢"). Templates cost nothing; no
  narrator AI in v1. Notable events (a hire, a firing, a first sale, an
  argument, a goal reached) are highlighted.
- **Page:** served on localhost only. It shows the pixel map with residents
  walking about, the feed beside it, and a click on a resident shows their
  money, job, needs and recent thoughts. It's read-only.

## 7. How it's built (Claude's calls)

- **TypeScript** throughout. A Node server runs the simulation; the browser
  client uses **Phaser** for the pixel view.
- **SQLite** (one file under `~/.kampung/`) for world state, the economy
  ledger, memories and the event log.
- **A deterministic simulation core.** The "brains" sit behind one
  interface, with a free fake brain for tests and dry runs, so most of the
  game is built and tested with **$0 of AI spend**.
- **Crash-safe.** State is saved every tick; on restart or wake from sleep the
  town resumes from the saved state. Missed real time passes as "everyone was
  asleep or working quietly" instead of being replayed.
- Tests with Vitest; CI runs them alongside the secret scan.

## 8. Milestones

1. **Sim core:** map, clock, needs, money, places, every action with fake
   brains, and save/resume. $0 AI.
2. **Real brains:** the harness, memory, model tiers, the throttle, the daily
   cap and the cost log, and a measured cost per resident-hour (the token
   assumptions in §5 get replaced with real numbers). **One owner step first:**
   in the Anthropic Console, create a workspace "pixel-kampung", set its
   monthly spend limit to US$100, create an API key in it, and paste the key
   into `~/.kampung/.env` as `ANTHROPIC_API_KEY=` yourself.
3. **Watch page:** Phaser view with the asset packs, the feed, and resident
   cards.
4. **Cast and launch:** Claude drafts 10 resident cards → the owner edits them →
   launch, then a 7-day unattended run against the "done means" bar.

## 9. Not in v1

Combat; human players; starting a new business; houses or upgrades for sale;
public or remote viewing; push summaries; a narrator AI; more than one map.
Each can come later, and residents will have to discover it.

## 10. Owner to confirm

1. The **morning lorry** as the town's scripted import/export link (§2).
2. **No new businesses in v1**: residents can save up, but opening a stall
   arrives later as a discovery (§3).
3. **Starting money** ranges (§2), or leave them to Claude.
