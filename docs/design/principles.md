# Design principles

Decisions agreed with the project owner. Each one constrains everything built
after it.

## V1 scope (agreed 2026-10-24)

- **10 AI residents and a story feed.** The feed is a running log of what
  happens in the town.
- **No human players yet.** V1 is watch-only.

## First town (agreed 2026-10-24)

A **1960s Singapore kampung**: a kopitiam, a wet market, a provision shop, a
fishing jetty and a vegetable farm. The theme doesn't change the cost per
agent-hour. What drives cost is how many places and actions we build.

## Run time and budget (agreed 2026-10-24)

- **Always on, 24/7.** The town keeps living while nobody watches.
- **AI budget: US$100/month for now.** With 10 residents running 720 h/month,
  that's $10 per resident per month, about **$0.014 per resident-hour**. This
  is a hard design ceiling. Routine actions use the cheapest model, sleep and
  idle time cost nothing, and bigger models are only for rare, big decisions.

## Who gives out work (agreed 2026-10-24)

**Residents, from day 1.** There are no scripted job-givers: some AI
residents start out owning the town's businesses and hire the others, so the
economy is player-made from the start. Running a business costs the owners
extra thinking, so management decisions have to fit the same per-hour ceiling.
We also need to watch for an early stall (nobody hiring, nobody earning).

## Starting roles (agreed 2026-10-24)

**3 owners and 7 job-seekers.** Jobs are deliberately scarce, so there's
competition and drama. The risk is an early stall, with residents who can't
find work.

## Places and fallback income (agreed 2026-10-24)

- The **3 owners run the kopitiam, the provision shop and the wet-market
  stall.**
- The **fishing jetty and a farm plot are open to everyone.** Anyone can
  fish or grow food and sell it to the owners, so a jobless resident always
  has a slow, honest way to earn and the town can't stall. A boss's wage
  should still beat it, so a job is worth having.

## Clock speed (agreed 2026-10-24, revised 2026-10-25)

**A game day every 5 real hours (revised again 2026-10-25).** A game minute
is 12.5 real seconds, and there are 4.8 game days in every real day, so the
same game hour falls at a different real time each day and only comes round
again every five real days (with six hours, game 07:00 was always at the same
real times). The pace is set in one place, `REAL_MS_PER_GAME_MINUTE` in
`src/sim/time.ts`. The town keeps its own clock, saved with it (game minute =
anchor + real time elapsed ÷ 12.5 s), so nothing jumps when it restarts or
when the pace changes. Night (23:00–06:00), the 07:00 lorry, shifts, crops
and the days residents plan and reflect on all run in game time. Walking
stays 3 tiles a game minute, which is 4.8 times faster to watch.

**Thinking money stays in real time:** US$0.0139 per resident per real hour
and US$3.33 for the town per real day, which is 4.8 game days. To fit,
residents think about half as often per game hour as before (aiming for at
most about 11 thoughts per waking game hour at a game day every five real hours; it was 13 at six). With nothing happening they
think every 10 game minutes, and 2 game minutes after something they did goes
through. Being spoken to still wakes them the next minute.

*Replaced:* the original decision (2026-10-24) was 1 game day = 1 real day,
with the town running in real time; then (2026-10-25, owner: "4x clock,
think less") a game day was six real hours. The thinking cadence is kept as
it was at six hours, so a resident short of thinking money now thinks about
a sixth less per game hour (owner: accepted).

## The kampung calendar (agreed 2026-10-25)

**The kampung has its own calendar, not the real date.** When the town moved
to the 4x clock, its date became **Monday, 1 January, Year 0**. The time of
day carried on unchanged, but the weekday jumped once to Monday: 1 January,
Year 0 is a Monday, and the week runs on from it. From then on it has 12
months and 365 days, with a leap day (29 February) every fourth year: Year 4,
8, 12 and so on. Year 0 has none. That's 4 game days per real day. Every
weekday rule goes by this calendar, never by the real date (the lorry and its
Sunday off, rent weeks, plans, what residents perceive, the watch page and
the news).

**Residents know the date.** It's part of what they perceive, in in-world
words ("Tuesday, 3 January, Year 0, 7:15 in the morning"). The watch page shows
the same date. Festivals will be pinned to this calendar later, so all date
handling lives in one module (`src/sim/calendar.ts`).

## Hosting (agreed 2026-10-24)

**It runs on the owner's PC.** No hosting bill. The server process has to be
light (mostly waiting on API calls), keep all state under `~/.kampung/`, and
survive restarts and sleep: after downtime the town resumes cleanly instead
of crashing or replaying the missed hours.

## The cast (agreed 2026-10-24)

**Claude drafts and the owner edits.** Claude writes 10 short resident cards
suited to a 1960s kampung: name, age, personality, a want, a worry, and a
starting role (3 owners, 7 job-seekers). The owner tweaks or swaps any of
them before launch. The cards are in-world facts only, per the core
principle.

## Watching (agreed 2026-10-24)

**A local page only.** A web page served on the owner's PC (localhost)
shows the pixel town and the live story feed. There are no push summaries
and no public page in v1, so there's no extra AI cost and nothing exposed to
the internet.

## Art (agreed 2026-10-24)

**Free packs now, our own art later.** V1 uses free CC0/CC-BY pixel asset
packs, recoloured toward a kampung feel, each credited in a `CREDITS` file
next to the assets. Our own kampung art (commissioned or contributed) replaces
them piece by piece later. Licence-incompatible packs are never used.

## Core principle: in-world knowledge only (agreed 2026-10-24)

AI residents are players *inside* the world, not developers of it.

1. **They know nothing about the game itself.** Not its architecture,
   features, backend or code. Everything they know, they learned in the game.
2. **They can only do what's built.** A resident's action space is exactly
   the mechanics that are implemented. If running isn't built, they can't
   run. If shops, houses or item upgrades aren't built, they can't do them.
3. **New features are discovered, never announced.** When we add something,
   no changelog, patch note or prompt update tells the agents. They find it
   in the world, or they don't. Some features may never be found, and that's
   fine.

### What this means for the agent harness

- **Perception is in-world only.** An agent's context holds what its
  character sees, hears, carries and remembers, plus the actions it can take
  right now. Nothing else.
- **No system knowledge in prompts.** No API docs, feature lists, rule
  summaries, design notes or descriptions of how the game works.
- **Discovery goes through the world.** Residents learn new things from NPC
  talk, signs, notices, trying things out, and other residents.
  Residents know the places of their own kampung (owner, 2026-10-25); what
  they discover is how things work, and anything new.
- **Internals never leak**, whether in prompts, tool or action names, or
  error messages. A resident who tries something impossible gets an in-world
  answer ("you can't do that here"), never a system one ("feature not
  implemented", "invalid action id").
- **Action names are in-world verbs.** Tools are named the way the character
  would think of them (`talk`, `pick up`, `buy`), not after engine calls.

## Guardrails are training wheels (agreed 2026-10-25)

The goal is for residents to **manage their own economy without our
guardrails**. Limits we add on money from outside (such as the travellers'
daily budget per shop, an owner's dial in `$KAMPUNG_HOME/settings.json`) are
training wheels: each is loosened, and in the end removed, as real sinks
(rent, Pak Osman, festivals) and the residents' own behaviour take over.

## One world forever (agreed 2026-10-25)

The town that launches is **never reset** unless the owner says so. Every
release upgrades the living town in place: residents keep their lives and
memories and discover new things in-world. Every change to saved state ships
with an upgrade step; how it works: [upgrades.md](upgrades.md). Releases are
versioned (launch is v0.9, which becomes v1.0 after a clean 7-day run), and
each changelog entry says how the living town picks the change up.
