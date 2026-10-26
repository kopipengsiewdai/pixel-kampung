# Relationships: trust and fondness

Agreed with the owner on 2026-10-26, as the ground marriage, lodgers and
much of village life will stand on ([households.md](households.md)). None of
this text goes into a prompt: residents only ever see what it means, in words.

## Two sides

Each resident holds a view of each person they know, made of two measures:

- **Trust:** money and keeping your word.
- **Fondness:** company and kindness.

You can like someone you don't trust. Both run from -100 to 100, are kept per
pair and one way (Siti's view of Raju is not Raju's view of Siti), and are
never shown to residents as numbers.

## Where they start

- Family, as each card says (the cast's `kin`): fondness 60, trust 50.
- Old friends their cards name (Ah Huat and Rahim): fondness 40, trust 40.
- Anyone else they already know: 0 and 0.
- Someone met for the first time starts at 0 and 0.

## What moves them: deeds, not words

| Deed (done to you) | Trust | Fondness |
|---|---|---|
| a gift of money or goods | +2 | +3 to +10 (more for a bigger gift) |
| help with your work, or an errand run for you | +2 | +5 |
| a trade or sale completed between you | +3 | 0 |
| a loan or IOU repaid | +10 | +2 |
| a loan or IOU left unpaid past its due day | −20 | −5 |
| wages paid on time (to a worker) | +5 | +1 |
| wages owed past their day | −10 | −3 |
| a deal talked of as done that nothing backed | −5 | 0 |
| a plea for help or a loan turned down | 0 | −3 |
| talk between you, a line each way | 0 | +1 (at most +3 a day) |
| a lesson given | +2 | +5 |

Words alone never move trust: only deeds do. Each kind of deed counts once a
day for each pair (a stream of 1¢ gifts buys nothing), and a gift under 10¢
doesn't count. A part repayment gives +3 trust; the full +10 comes when it's all
paid. Wages count against an employer only after a whole waking day unpaid, and
a deal talked of is held against the speaker after an hour of waking time (never
for "all paid", where the speaker may be the one owed). All of this is scripted
and costs nothing.

## What residents see

In-world words only, beside a person they know (nearby, or when they think of
them). Each measure is in one of five bands, and nothing is said in the
middle band:

- **Trust:** "you'd trust them with anything", "you trust them", (nothing),
  "you're wary of them", "you don't trust them".
- **Fondness:** "dear to you", "you're fond of them", (nothing), "you don't much
  like them", "you can't stand them".

One line a person, using their name, so no pronoun is guessed ("Rahim is dear
to you, and you trust Rahim."), for at most four awake people nearby, the
strongest feelings first. The owner's watch page shows the numbers on the
resident's card.

## What reads them

- Marriage (later): both ways, fondness at least 70 and trust at least 50, and never between family.
- Lodgers and asking to be taken in (later).
- The residents' own judgement: whom to lend to, hire or believe.

## Save

A new saved table of views per pair, seeded at upgrade as above (family,
named friends, known people). This takes the next save version.
