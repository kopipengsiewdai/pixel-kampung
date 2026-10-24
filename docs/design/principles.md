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

## Clock speed (agreed 2026-10-24)

**1 game day = 1 real day.** The town runs in real time. Each resident gets
about $0.33 of AI thinking per game day ($10 ÷ 720 h × 24 h), so residents
are as deliberate as the budget allows. Stories unfold slowly: going from
worker to boss could take weeks of real time.

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
- **Internals never leak**, whether in prompts, tool or action names, or
  error messages. A resident who tries something impossible gets an in-world
  answer ("you can't do that here"), never a system one ("feature not
  implemented", "invalid action id").
- **Action names are in-world verbs.** Tools are named the way the character
  would think of them (`talk`, `pick up`, `buy`), not after engine calls.
