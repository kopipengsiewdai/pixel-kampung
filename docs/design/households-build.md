# Households and Mr Lim: build plan

How [households.md](households.md) and Mr Lim's part of
[village-characters.md](village-characters.md) get built. Implementation
choices are recorded here; the owner's decisions are in those two specs.

## PR A: households, rent and the village fund (save v19)

**Moves.** Ah Seng moves into his father's house (`house-1`) and Mei Ling into
her aunt's (`house-2`). That frees `house-8` and `house-4`, and any kerosene left
in their stoves goes with them. A shared house goes by its first resident in
cast order ("Ah Huat's house"). A free house is "an empty house" and can be
walked to by that name.

**Mr Lim's house.** This is a new place, `village-head`, "the village head's
house". The ten homes fill the top row of the map, so it sits in the open
ground between the farm plot and the jetty, up its own path. On the watch page
it's drawn as a bigger house. Every resident who has lived here knows it.

**Places and who holds them** (`state.property`, by place id):
- Every house and the three stalls are listed, each with `{ holder, rent, owned, rentToOwn, owing, since }`:
  - `holder`: the household's first resident, or the stall's owner.
  - `rent`: cents a week.
  - `owned`: true once bought.
  - `rentToOwn`: `{ paid, of }` while buying weekly.
  - `owing`: unpaid rent.
  - `since`: the day it first went unpaid.
- Starting rents are 50¢ a week for a house and $1 a week for a stall.
- **The first rent is due on the Monday at least four game weeks after the upgrade** (`state.rentFrom`, a day).

**Money.**
- Two new outside accounts:
  - `village-fund`: rent and sale money go in, Mr Lim's help comes out.
  - `mr-lim`: his private purse, effectively unlimited and never shown to residents.
- Both are in `OUTSIDE`, so the nightly audit is unchanged.
- The fund's balance is kept in `state.fund`, so it can be checked and shown to the owner.

**The Monday rent round** (scripted, free). At 09:00 each Monday from `rentFrom`:
- For each place that isn't owned, the holder pays the week's rent (or the rent-to-own instalment) into the fund if they can.
- If they can't, it's added to `owing`.
- Paying something owed clears that much of it, oldest first.
- The holder hears about it in-world, either way ("Mr Lim comes round for the rent: 50¢ for the house.").
- Before the first round, every holder hears that rent starts on the date it does.

**Paying and buying** (new verbs, at the village head's house):
- `pay_rent`: pay what you owe, in full or in part.
- `buy_place`: buy your house or stall outright, at a year's rent. You can also buy a free house you can afford, which makes it your home.
- `rent_to_own`: switch your place to rent-to-own. Instalments are one and a half times the rent, and it's yours after 44 weeks, about a quarter more than buying outright.
- `sell_place` (to another resident, anywhere they're both standing): an offer they agree to, like a trade.
  - The buyer pays the seller through the ledger.
  - The place passes to the buyer, and so does the household if it was the buyer's home.

**Eviction.**
- If a place has rent owing for more than seven days after the Monday it was missed, the holder's whole household is evicted on the next rent round. A stall's holder loses the stall: its stock stays in the shop, and Mr Lim lets it again.
- The evicted lose that house as home (`homeId` becomes `rough`) and sleep rough at the jetty, where energy comes back at half speed. They keep what they carry.
- An owned place can never be taken.

**Renting a free house.** `rent_house` at the village head's house: any resident sleeping rough, or living in a shared house, can rent a free house. It becomes their home, from the next Monday's rent.

**Watch page.**
- The wiki shows each place: its holder, rent, what's owing, whether it's owned, and the fund's balance.
- The layout's names refresh when anyone moves.

**Moved to PR B** (they need the offer-and-agree flow or Mr Lim's judgement):
selling a place to another resident, and letting a stall go for rent owing.
Until then a stall's rent owing just builds up. The watch page's layout names
refresh only when the town restarts.

## PR B: Mr Lim's head and powers (no save change if possible)

A bounded AI head like Pak Osman's: a few calls a week, within the town's daily
cap, with scripted fallbacks.
- **Notices** on the board, as "Mr Lim": rooms to let, a free stall, rent news.
- **Monthly rent review,** ±20% at most.
- **Hardship help** when asked at his door: a week's grace or a small loan from the fund, capped and repaid.
- **Paid odd jobs,** one or two open at a time, paid from the fund on completion.
- **Choosing a tenant** when several ask for the same place.
- **Words only** on disputes.

Developing the village (power 9) waits for the fuller map.

## PR C: marriage (after A and B)

From [households.md](households.md) and [relationships.md](relationships.md).
