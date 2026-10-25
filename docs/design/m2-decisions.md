# M2 real brains: decisions

Agreed with the owner on 2026-10-24, one question at a time. These add to
[v1-spec.md](v1-spec.md) §4–5, which already fixes perception-only context,
the memory stream with an evening reflection, event-driven thinking, the
model tiers, the per-resident throttle, the town's daily cap and the cost log.
None of this text goes into any resident's prompt.

## 1. Talk is line by line

Each resident decides their own reply when spoken to, one line at a time.
Every mind stays separate, so lies, misunderstandings and secrets can happen.
A soft limit of about 8 lines ends a conversation before it runs on. Each line
is one cheap-model call.

## 2. Trivial memories fade

Small things ("bought a kopi") fade after a couple of weeks. Important
memories (a firing, a debt, a quarrel) and the evening reflections are kept
for good, so grudges and loyalties last and clutter doesn't. Each call still
reads only the few most relevant memories.

## 3. Throwaway test cards for M2

Claude writes 10 rough placeholder cards, used only for M2 testing and
clearly marked as throwaway. The real cast cards (M4), which the owner edits,
replace them.

*Done in M4:* the owner-approved [cast](cast.md) replaced them
(`src/seed/cards.ts`).

## 4. Testing may spend up to US$10

Paid trials run before the town goes 24/7. They start with a few residents
for a few game hours, then go up to a few full-town game days, to measure the
real cost per resident-hour against the $0.0139 ceiling. The spend comes out
of the capped US$100/month workspace. Each run stops itself when it reaches
its share.

## 5. Paid trials run on the owner's PC

The API key stays only in `~/.kampung/.env` on the owner's PC, as the spec
says. The trials are light (mostly waiting on the API, well under 500 MB) and
last a few hours at most, and the local session runs them. Cloud sessions keep
using the free fake brain for heavy testing.

## 6. Residents start knowing nothing

On day one a resident knows only their name, their role and their home. They
don't know about the lorry, prices, farming or cooking until they find out by
trying, looking and talking.

- **Places are known; how things work is discovered** (owner, 2026-10-25,
  revising this decision). Everyone who has lived here knows every place in
  the kampung from day one, and every house by whose it is; a newcomer (Ah
  Kow) knows only home, the well and the kopitiam. What the lorry sells, how
  crops grow, prices, and anything new the village head builds are still
  found out in play. *Replaced:* at first a resident knew only home, and the
  living town showed no fishing or farming at all because nobody had found
  the jetty or the farm plot. A place a newcomer hasn't seen joins what they
  know once they see it or hear it named.
- **Early exploration costs more AI.** That's accepted; the trials measure it.

## 7. With no thinking budget, needs only

When a resident can't think (their hourly budget is spent, the town's daily
cap is hit, or the API is unreachable), they rest where they are. The only
exceptions: they eat food they're carrying when hungry, and they go home to
sleep at night. Nothing else happens on autopilot.
