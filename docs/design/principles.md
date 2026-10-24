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
