# M2 real brains: implementation plan (fake model first)

Builds the free parts of milestone 2 ([v1-spec](../design/v1-spec.md) §4–5,
[m2-decisions](../design/m2-decisions.md)) and tests them against a fake
model client at $0. The paid trials run later on the owner's PC once the API
key exists. Each step is test-first.

## Shape

One think = one model call. The resident's card and a single action tool are
the stable prefix (prompt-cached). The changing part is the user message:
what they perceive, a few retrieved memories, today's plan, and the things
they could do right now. The model answers with one `do` tool call (or plain
text, kept as an inner thought), which the harness turns into an `Intent` for
`act()`. The reply comes back in the next perception, so no tool-result
history is carried and every call stays small.

Only the actions available right now are listed, and only in the changing
part, so the cached prefix never reveals actions the resident can't take
(and residents who know nothing don't learn about the lorry from a tool list).

## Steps

1. **Discovery (sim).** `knownPlaces` and `knownPeople` per resident. They
   start with home (and their own shop, for owners). A place is learned by
   seeing it (within a sight radius) or hearing it named; a person by being
   near them. `walk_to` takes only known places and people, plus directions
   (north, south, east, west) so a resident can explore. Fake brain explores.
2. **Model client.** `ModelClient` over `Anthropic.MessageCreateParams` →
   `Anthropic.Message`. `FakeModel` answers from the fake-brain policy with
   plausible token counts. `AnthropicModel` uses `@anthropic-ai/sdk`; it is
   tested with a stub `fetch` (request shape, no sampling params, caching).
3. **Pricing and cost log.** Per-model prices (incl. cache reads and writes)
   → dollars per call. A daily JSONL file in `$KAMPUNG_HOME/costs/`.
4. **Throttle.** A per-resident bucket filling at $0.0139 per game hour with
   a cap. A town daily cap of $3.33. With no budget, the resident gets needs
   only (eat carried food; night is already automatic).
5. **Memory.** A SQLite table under `KAMPUNG_HOME`. Rule-based importance;
   retrieval by recency, importance and keyword relevance; trivial memories
   fade after 14 days.
6. **Prompts.** The system prompt from the resident's card (throwaway M2
   test cards). The user message from perception, memories and plan.
   In-world words only, guarded by a test.
7. **Tiers.** Haiku for routine thinks and talk. Sonnet for the morning
   plan, the evening reflection and owners' business moments (at most 3 a
   day).
8. **Talk.** Line by line. After about 8 lines between a pair, listeners are
   no longer woken to reply at once.
9. **Mind brain + town wiring.** `MindBrain` implements `Brain`; the town
   runs morning plans and evening reflections; a trial CLI
   (`npm run trial -- --fake` free, or real with a spend cap).
10. **Integration test.** A 2-day fake-model town: no exceptions, caps
    respected, the cost log written, memories faded and retrieved, and the
    in-world guard holds on every prompt sent.
