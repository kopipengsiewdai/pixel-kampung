# Households: renting, buying, eviction and marriage

Agreed with the owner on 2026-10-26 (questions 1–7, one at a time). This goes
with the village head, Mr Lim ([village-characters.md](village-characters.md)),
who collects rent and keeps the village fund. None of this text goes into a
prompt: residents meet it all in-world.

## Build order

1. **Relationships** ([relationships.md](relationships.md)), because marriage
   and lodgers need them.
2. **Households and Mr Lim:** the moves, rent, buying and eviction.
3. **Marriage.**

## Who lives where

- Ah Seng moves in with his father Ah Huat, and Mei Ling with her aunt Mdm Tan
  (agreed 2026-10-25). That frees two houses, which go on Mr Lim's list to let.
- Everyone else stays where they are. A shared house goes by its first
  resident ("Siti's house").

## Everyone rents (for now)

- **Mr Lim owns every house and stall** in the kampung, including the
  kopitiam, the provision shop and the wet-market stall. Each household pays
  rent; a shared house pays once, from its first resident.
- **Amounts:** about half a day's earnings a week. A house starts at about 50¢
  and a stall at about $1.
- **Collection:** on Mr Lim's Monday rent round, into the village fund (a
  ledger account).
- **Reviews:** he reviews rents monthly, at most ±20% each time.
- **Start:** Mr Lim gives notice when this ships, and the **first rent is due
  four game weeks later**, so the town can recover from its hunger first.

## Buying

A resident can stop renting in either of two ways:

- **Buy outright:** at Mr Lim's price, about a year's rent (within bounds).
- **Rent-to-own:** a higher weekly rent (about one and a half times), and the
  place is theirs after enough weeks that the total comes to about a quarter
  more than the outright price.

Either way:
- **Once it's theirs:** no more rent, and it can never be taken from them.
- **Selling on:** they can sell it to another resident at any price they agree.
- **The money:** goes into the village fund, through the ledger.

## Not paying

- **Grace:** one week's grace after a missed Monday.
- **Eviction:** after that, Mr Lim evicts. **Anyone can be evicted, families
  too** (owner, 2026-10-26; this replaces the earlier "never family homes"
  rule).
- **Hardship help:** Mr Lim's power 8, a week's grace or a small loan, can
  still save a household that asks.

## Sleeping rough

- **Where:** an evicted resident or household sleeps rough on the jetty or the
  kopitiam's back bench.
- **Rest:** energy comes back at half the usual speed.
- **Belongings:** they keep only what they carry.
- **Coming back:** they can rent again once a house is free and they can pay.

## Marriage (after relationships)

- **Who:** two grown, unmarried residents, not family, who are fond of each
  other and trust each other (both ways: fondness at least 70, trust at least
  50).
- **How:** either one can propose, and the other says yes or no. A wedding is
  an event in the story feed.
- **Where:** they may move into one house, which frees the other.
- **Money:** purses stay separate.
- **Not yet:** no divorce and no children.

Details agreed by Kampung for the owner, 2026-10-28 (shipped 0.39.0, save v31):
1. **Grown** means 18 or over.
2. **Each by their own feelings:** someone may ask only if they feel fondness
   at least 70 and trust at least 50 for the other, and the other can say yes
   only if they feel the same for the asker ("You're not ready to say yes to
   that"). Nobody learns the other's feelings. The married ask nobody else
   and can't be asked.
3. **An unanswered proposal lapses** at the end of the day, and the asker
   hears there was no answer.
4. **Moving in:** once married, either can move in with the other. A house
   the mover rented goes back to its landlord, with any rent owing still
   owed; a house they own stays theirs to let or sell. Those living in a
   house the mover holds come too (Aminah and Hassan with Fatimah).
5. **News:** the wedding is a line in the story feed; kin of both remember
   it wherever they are, and so does anyone who saw it. The watch page's
   card says who someone is married to.
6. **A wedding is free:** no cost and no feast, for now.

## Save

Rent, ownership, the village fund, who sleeps rough and marriages are all saved
state, each shipped with an upgrade step at the save version current when it
merges.

## Prices: a free market (2026-10-26)

The fixed prices above (a year's rent, rent-to-own over 44 weeks, 50¢ and $1 a
week) were where PR A started. The owner chose a free market: Mr Lim takes
offers and decides, with no floor; a sitting tenant's rent changes only with a
week's notice and their agreement; residents buy, sell and let between
themselves at any price they agree. Details: [households-build.md](households-build.md#housing-market-agreed-with-the-owner-2026-10-26-q1q4).

