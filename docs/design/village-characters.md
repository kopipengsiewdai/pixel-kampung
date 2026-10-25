# Village characters: the village head and the lorry trader

Agreed with the owner on 2026-10-25. This is the spec the builds work from.
Everything a resident meets here is in-world: none of this text goes into a
prompt.

## Two kinds of characters

- **Residents** (the 10 in [cast.md](cast.md)) have full lives: needs, a home,
  sleep, memories, plans and reflections.
- **Village characters** have a **scripted body and a bounded AI head**. They
  follow a fixed routine and have no needs, sleep, memory stream or home life
  like residents. AI is used only for specific decisions and short
  conversations, capped per day and counted in the town's daily cap and cost
  log. When the AI is unavailable or the budget is spent, a scripted fallback
  takes over.

## The village head, Mr Lim

- **Who:** the kampung's village head. Private and rarely seen. He lives in the
  village head's house at the top of the kampung (there "since forever"),
  coming out for duties: collecting rent on Mondays, pinning notices,
  overseeing building. Residents can knock on his door, and a few times a day
  (capped) his AI voice answers.
- **His powers, all bounded:**
  1. Set house and stall rents, reviewed monthly, at most ±20% each time.
  2. Evict non-payers after a grace week, from rented houses and stalls
     only, never family homes.
  3. Post village notices (rooms to let, a free stall, village news,
     festivals), never rules or how things work.
  4. Settle disputes in words only, never enforced.
  5. Run the **village fund**: rent is paid into it, and it is shown in the
     wiki.
  6. Post **paid odd jobs** (mend the jetty, clear the path, carry stores),
     one or two open at a time, paid on completion. He is the kampung's first
     quest-giver.
  7. Choose stall tenants when several apply.
  8. Give **hardship help**: small loans or a week's grace, capped, repaid to
     the fund.
  9. **Develop the village**: build or buy new stalls, houses and services.
     This is the in-world reason new things appear. He makes things appear,
     never rules: new mechanics are still found only by trying.
- **Never:** touch residents' money or shops directly, change shop prices,
  hire or fire for others, create goods from nothing, or force marriages or
  family evictions.
- **His wealth is hidden.** No resident knows how rich he is. His private
  purse (effectively unlimited) and the village fund are separate ledger
  accounts, so money conservation stays checkable.

## The lorry trader, Pak Osman

- **Who:** a lorry driver in his 50s working for a wholesaler at the town
  market. Widowed, he saves every spare cent for his daughter's schooling in
  town. A hard but fair haggler, soft on regulars, who never forgets a debt
  and brings the kampung its gossip from town.
- **Schedule:** arrives at about 06:30 every day except Sunday (the kampung
  calendar's weekday), parks at the lorry stop, stays about 90 game minutes,
  then drives away. On festival days he may not come.
- **A limited lorry.** He is **not an unlimited resource**. One fixed load
  space each day is shared between the produce he buys and the goods he
  brings. When it's full, he's full.
- **Buys:** fish and vegetables, up to what his lorry can take that day.
- **Sells:** rice, coffee powder, bread and kerosene, plus new goods as the
  village develops. What he brings varies with "town supply" (random within
  bounds), so a shelf can run short.
- **Prices (AI, once per visit):** today's buy and sell list, from recent
  supply, his load and town reference prices. Bounds: buying at 40–80% of the
  town price, selling at 110–160%, never at a loss.
- **Haggling (AI, capped):** a resident may offer a price, and he accepts,
  counters or refuses within the same bounds. After about 10 haggles a visit
  it's "take it or leave it" (scripted).
- **Orders:** anyone may ask him to bring something next time (a shop's
  stock, a resident's kerosene). He may take a deposit. **Nothing is
  promised:** quantity depends on town supply and his load, and he may turn
  up with part of the order or none, refunding the deposit for what he didn't
  bring.
- **Credit:** regulars only. The cap is **relative to the size of the
  economy**, not a fixed number (e.g. a fraction of a typical resident's
  weekly income, worked out by the economy check). Debts last a week. An
  unpaid debt marks the resident: no more credit, and higher prices.
- **Ledger, not memory:** for each resident he keeps what they owe, how much
  of a regular they are, and a "cheated me" flag. Regulars get slightly better
  prices; anyone flagged pays more.
- **Gossip:** one short line of town news a visit (AI, in-world, never about
  how the game works). It sometimes hints at prices.
- **Cost:** about one pricing call plus up to 10 short replies a visit. A few
  cents a day (*estimate*).

## The economy knobs

- **A hidden economy check** (scripted, $0) runs once a game day. It measures
  money in circulation, how many residents have no work, prices against town
  reference prices, and who is hoarding or broke.
- **It nudges the two characters, within their bounds.** When money is tight
  or work is scarce: more odd jobs and hardship help from Mr Lim, and Pak
  Osman buys more. When money piles up: rents creep up (within the cap) and
  Pak Osman's prices firm up. The nudges reach their AI as context in their
  own terms ("trade has been slow in the kampung"), so what happens reads as
  their own choices.
- **Owner dials** (for example generosity, tightness and a target money
  supply) live in a private settings file under `$KAMPUNG_HOME`, never in the
  repo, with defaults documented in code. The wiki shows the current health
  readings to the owner.
- **Residents never see the machinery,** only a generous or strict village
  head and a lorry man who pays well or poorly.
