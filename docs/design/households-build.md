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
- `offer_for_place` (replaced `buy_place`, `rent_to_own` and `rent_house` with the housing market, 0.32.0): offer Mr Lim a rent a week or a price to buy, for a house standing free or the place you hold. See "Housing market" below. A rent-to-own already running finishes on its terms.
- `agree_to_rent` (0.33.0): tell Mr Lim you'll pay the new rent he's given you notice of.
- `offer_place` (0.34.0, replacing the planned `sell_place`): to another resident, wherever they're both standing, offer to sell, buy, let or rent a house one of you owns. They `agree` or `refuse`, like a trade.
- `change_rent` (0.34.0): a landlord gives their tenant, in person, a week's notice of a new rent. The tenant agrees (`agree`) or leaves when it starts.
  - The buyer pays the seller through the ledger.
  - The place passes to the buyer, and so does the household if it was the buyer's home.

**Eviction.**
- If a place has rent owing for more than seven days after the Monday it was missed, the holder's whole household is evicted on the next rent round. A stall's keeper loses the stall: its stock goes home with them (the goods were theirs; the next keeper doesn't get them free), and Mr Lim lets it again (part d, 0.35.0).
- The evicted lose that house as home (`homeId` becomes `rough`) and sleep rough at the jetty, where energy comes back at half speed. They keep what they carry.
- An owned place can never be taken.

**Renting a free house.** By offer at the village head's house (see "Housing market"): any resident sleeping rough, or living in a shared house, can offer for a free house. Once Mr Lim takes the offer it becomes their home, the first week paid then and rent from the next Monday's round.

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

## Housing market (agreed with the owner, 2026-10-26, Q1–Q4)

PR A's fixed prices (a year's rent to buy, 44 weeks rent-to-own) were a
placeholder. The market replaces them:
1. **A free market with no floor** (Q1 and Q2): "let's this be free market, see
   what happens." Prices come from what residents offer and Mr Lim accepts. There's
   no minimum and no formula.
2. **Mr Lim decides** (Q3).
   - A free house or stall goes up on the board.
   - Residents make offers at his door, either a rent a week or a price to buy.
   - His thinking head accepts, counters or waits for better.
3. **A sitting tenant's rent** (Q4) can change freely, with a week's notice.
   - The tenant must agree to the new rent at his door, or give notice and leave.
   - Proper contracts come later, once there's a legal system.
4. **Between residents**, a place can be sold or let at whatever price both agree, offered and accepted like a trade.
5. **Existing deals are honoured** (one world forever): a rent-to-own already running finishes on its terms, and a place already bought stays bought.

This ships with Mr Lim's head (PR B), because he is the one who decides.

Built in four parts:
- **(a) Offers for free houses and to buy your own** (0.32.0).
  - Each morning Mr Lim pins a note of the houses standing free.
  - At his door, a grown-up offers a rent a week, or a price to buy, for a house standing free, or a price for the place they hold. The offer has no floor, but they must have the money (the first week's rent, or the price). One offer per person: a new one replaces the last.
  - At 17:00 he answers. For houses standing free, he weighs the best offer first, a price against a year's rent. For each offer to buy a held place, he answers on its own.
  - His head accepts one offer, counters, or waits (at most three calls an evening). His own way when there's no head:
    - for a free house, accept at least half the old rent (half a year's rent to buy), or the best rent offer once it has stood free three days. He never sells below half a year's rent on his own;
    - for your own place, accept half a year's rent, or counter with that.
  - Accepted: the first week, or the price, is paid into the fund, and the household moves in (everyone turned out of the same house comes home together). Offers that weren't taken are told when the houses are gone.
  - A place already being bought week by week can't be offered for. An offer from someone owing rent by the evening isn't taken.
  - The day he last answered is saved, so a restart doesn't make him answer twice.
  - Stalls stand free only once (d) lets one go; from 0.35.0 a free stall takes offers the same way.
- **(b) A sitting tenant's rent changes with notice and agreement** (0.33.0).
  - On Monday evenings, before the evening's offers, his head looks over the houses he lets (one call a week) and may set a new rent for any: at most double, or down to half, at a time (a guard against a slip of the unit). His own way, he never changes a rent. Not before rent has started.
  - The tenant and everyone living with them hear at once, and keep seeing it: the new rent starts at his round a week on (or that round caught up after downtime). His words go only with a rise.
  - Downtime that swallows a day or more of the notice week gives the tenant that time back, in whole weeks.
  - A higher rent must be agreed at his door (`agree_to_rent`) by then, or the household leaves that morning, owing only what they already owed, and the house stands free. A lower rent needs no agreeing.
  - A notice goes with the house if it's let go for rent owing, or bought. Places being bought week by week, and owned ones, aren't looked over; nor are stalls, until (d).
  - The day he last looked is saved, so a restart doesn't make him look twice.
- **(c) Selling or letting between residents** (0.34.0, agreed with the owner via Kampung 2026-10-27).
  - Only a house you own: one rented from Mr Lim isn't yours to sell or sublet.
  - Either side offers, wherever both are standing: a price to buy, or a rent a week. The other agrees or refuses; an offer lapses after half an hour, like a trade. The money is checked when it's agreed.
  - A sale: the money goes from buyer to seller, and the house is the buyer's. The seller's household moves to another house the seller holds, or sleeps rough together. The buyer's household moves in; a house the buyer rented and leaves empty goes back to Mr Lim (or its owner).
  - A let: the first week is paid up front, the owner's household moves out and the tenant's in. The tenant pays the landlord, not the fund, at Mr Lim's Monday round. Owing over a week, the tenant is out and the house goes back to its owner, the debt owed to them.
  - A landlord changes the rent as Mr Lim does (`change_rent`): a week's notice, from his Monday round a week or more on, agreed in person, or the tenant leaves when it starts.
  - An offer stands only while the house is as it was when offered (the same owner, let or not); once a house changes hands, every other offer for it lapses.
  - When a let ends (rent owing, a new rent refused, the tenant moving on), an owner with no home of their own comes home to it, family too.
  - Someone with more than one house: a let takes one not let (rather one standing empty than their home); a sale to the tenant, the house they rent; otherwise they're asked which. When both own a house, they say whose.
  - Someone buying Mr Lim's house week by week can't move away from it. Anyone else leaving a rented house for one bought or let gives it back (to Mr Lim, or its owner), still owing what they owed.
  - A house sold while it's let keeps its sitting tenant: the buyer is their landlord, on the same rent (any notice lapses). A tenant may buy the house they rent.
  - Mr Lim stays out of it: no rent review, offer, help or pay-rent for a house let between residents.
  - Stalls too, from (d): a stall someone owns is sold or let the same way, its keeper changing to the buyer or tenant; nobody moves house for a stall, and nobody keeps two stalls.
- **(d) Letting a stall go, and stalls changing hands** (0.35.0, agreed with the owner via Kampung 2026-10-27).
  - A stall is let go on the house rule: rent owing over a week at the Monday round (Mr Lim's grace and loans still apply); what was owed stays owed, as arrears.
  - The keeper loses the stall and takes its stock home. Anyone working there is told the job is over. The shop is shut while it stands free: nobody buys, sells or works there, and no traveller stops.
  - A free stall goes on Mr Lim's to-let note, and takes offers at his door (a rent a week, or a price), answered in the evening as for houses, with the same fallback.
  - Whoever takes it keeps it: empty, with no prices yet (they set their own). Nobody keeps two stalls.
  - Stalls join (b) and (c): Mr Lim's head looks over stall rents too, and a stall someone owns can be sold or let between residents.

## PR C: marriage (after A and B)

From [households.md](households.md) and [relationships.md](relationships.md).
