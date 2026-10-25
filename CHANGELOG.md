# Changelog

Newest first. One line per change, in plain English. Each release says how a
town that is already living picks it up ("Living town"), because the town is
never reset (see [docs/design/upgrades.md](docs/design/upgrades.md)).

## 0.11.3 (2026-10-25): residents know their kampung

- **Residents know their kampung:** everyone who has lived here knows every place from day one (the jetty, the farm plot, the well, the notice board, the three shops, the lorry stop, and every house by whose it is). Ah Kow, who arrived last month, knows his house, the well and the kopitiam, and finds the rest. How things work (what the lorry sells, how crops grow, prices) is still found out in play. Since launch nobody had fished or farmed: nobody had found the jetty or the farm plot.
- **Trades:** Rahim grew up fishing, Fatimah has always grown vegetables, Ah Kow worked the land on the estate, Ah Huat cooks for his kopitiam, and Muthu carried cargo at the docks; each is told it with who they are.
- **Living town:** at upgrade (save v8) everyone but Ah Kow comes to know every place, and Ah Kow the well and the kopitiam, added to what they already knew; nobody is told anything changed.

## 0.11.2 (2026-10-25): key moments and the Talk tab

- Watch page: the story feed shows **key moments** by default (sales and purchases, hires and firings, wages, gifts and trades, notes pinned, first visits to places, the lorry, price changes, and talk that claims a deal done), with a "Key moments | All" switch in its header that this browser remembers. Walking, arriving, looking around and plain chat show under All.
- Watch page: a resident's card has a **Talk** tab: their conversations, newest first, grouped by who they talked with (a new person, or 10 quiet minutes, starts a new one), each line stamped, the last 50 lines. It is read from the saved talk when the tab opens.
- Living town: watch-page changes only; nothing in the town or its save changes.

## 0.11.1 (2026-10-25): hiring and eating work

- **Hiring works:** a job offer understands wages and hours the way people say them ("$1.50 a shift", "7am", "17:00", "4 hours"), and takes the wage from any money field. Every one of Ah Huat's 35 offers since launch had been refused as "That doesn't sound like a wage."
- **Eating works:** items can be named the way the game describes them ("a cup of kopi", "2 loaves of bread", "a plate of vegetable rice"). Four residents had not eaten since launch.
- Living town: picks this up on restart; nothing in the save changes.

## 0.11.0 (2026-10-25): real debts and lending

- **Real debts and lending:** anyone can lend, ask to borrow, or write an IOU, and nobody owes anything until the other one agrees (an offer lapses after half an hour). What you owe and are owed is in front of you every moment, next to your money ("You owe Mdm Tan $2.00.", "Nobody owes you anything, and you owe nobody."); a worker sees wages owed to them too. Paying back goes oldest debt first and can be part; the one owed can let you off. Talk of settling an account now meets what's true.
- **The money ledger reconciles from nothing:** every purse's starting money is written down as an opening entry, and once a game day (and on start) the live town replays the ledger against every purse and writes `ledger OK` or `ledger MISMATCH: …` to its log.
- **Living town:** at upgrade (save v7) nobody owes anybody, which is true (a payment for a debt that never was stays a gift), and the ledger opens with every resident's money as it stands; the nightly check counts from those opening entries.

## 0.10.7 (2026-10-25)

- Watch page: shop cards say who is minding the shop ("Ah Huat (the owner)", "Siti (on shift)", or "nobody right now") instead of "someone is minding it", and "Buys" is now "Buying from others" ("not buying anything right now" when no buying prices are set).
- Living town: a watch-page change only.

## 0.10.6 (2026-10-25): going somewhere together

- **Going somewhere together:** when someone you've just been talking with sets off, you notice and think again straight away, and you can go with them to where they're heading (or after them, if they've already stopped). The feed shows it: "Rahim goes with Ah Huat to the kopitiam." Before this, someone who said yes to "come with me" stayed put while the other walked off.
- **Living town:** picks this up on restart; nothing in the save changes.

## 0.10.5 (2026-10-25): no more talking in circles

- **Going round in circles:** after six lines with nothing done between them, two people see they keep going round in circles, and the chat stops waking them; doing something together starts the count again.
- **Words don't move money:** talk of paying, a deal or a job as if done, with nothing done within a few minutes, is noticed by both, in plain words ("You and Rahim have talked of paying, but no money has changed hands.").
- **Knowing what you are:** everyone sees whether they run a stall or shop ("You run the provision shop. It's yours alone." for an owner).
- **Living town:** at upgrade (save v6) chats already going start with nothing counted and no deal pending; the stale "no work" line leaves job-seekers' thoughts at once.

## 0.10.4 (2026-10-25): a day every five hours

- Watch page: a card's name and close button stay in view while you scroll it, on any screen size.
- **A game day every five real hours** (it was six): a game minute is 12.5 real seconds and there are 4.8 game days to a real day, so the same game hour comes at a different real time each day. Thinking money stays per real hour, so residents short of it think about a sixth less per game hour.
- **Living town:** at upgrade (save v5) the clock is re-anchored where the town stands, at the real moment it got there, so nothing jumps; time missed while it was stopped passes at the new pace.

## 0.10.3 (2026-10-25)

- Watch page: click a place to see inside. Shops show their stock, prices both ways, who's serving and who works there; the notice board shows its notes with who wrote them and when; the farm plot shows each bed; the jetty shows who's fishing; the lorry stop shows when the lorry comes next and its prices. Owner's view only.
- Watch page: residents waiting between thoughts aren't frozen any more: they sit at the kopitiam, sweep at their shop, tug a fishing line, stroll a tile or so and back, or look about at home; and a short speech bubble shows each line as it's said.
- Watch page on a phone: one column with no sideways scrolling, the map across the width (with a zoom button), the feed below, big tap targets and cards as a full-screen sheet; the header is one line with a short date, the version and the mode. The desktop layout is unchanged apart from showing the version.
- Living town: watch-page changes only; nothing in the town or its save changes.

## 0.10.2 (2026-10-25)

- **Answers:** a resident someone spoke to first is told, in plain words, that the other person is waiting for their answer, until they answer, the other leaves, or the chat has run long.
- **No loops:** doing the very same thing again within a few minutes still goes through, but doesn't bring the next thought straight on, and the resident hears "You've just done that."
- **Living town:** at upgrade (save v4) every resident starts with nothing remembered as last done; the waiting line needs no upgrade, since it comes from what they've already heard.

## 0.10.1 (2026-10-25)

- "Look around" now answers briefly (where you are and who's there). Its reply used to be the whole view, saved as a memory each time; those copies were 56% of all memory text, stale and costly to recall.
- Living town: picks this up on restart. Old copies fade with time like any small memory.

## 0.10.0 (2026-10-25): the kampung's own time

- **The 4x clock:** the kampung keeps its own time, four game minutes to a real minute, so a game day is six real hours. Night, the morning lorry, shifts, crops and the days residents plan around all run in game time, and walking is four times faster to watch.
- **The kampung calendar:** the town has its own dates (12 months, 365 days, a leap day every fourth year from Year 4), beginning on Monday, 1 January, Year 0, and residents know today's date. The watch page shows the same date.
- **Thinking stays within the real budget:** each resident still has US$0.0139 of thinking per real hour and the town US$3.33 per real day, so residents think about half as often per game hour (every 10 game minutes when nothing happens, 2 minutes after doing something).
- **Living town:** at upgrade (save v3) the clock is anchored where the town stands, so nothing jumps: the date becomes Monday, 1 January, Year 0: the time of day carries on, and the weekday jumps once to Monday. From then on every weekday rule goes by the kampung's week. Time missed while the town was stopped for the upgrade passes quietly, four times as fast as before.

## 0.9.5 (2026-10-25)

- Residents remember the words of a note they pin, as something that matters. Mei Ling pinned a "WANTED" note for herself, forgot it within the hour, and then asked who wrote it.
- Living town: picks this up on restart. Notes pinned before it are still remembered without their words.

## 0.9.4 (2026-10-25)

- **Watch from your phone at home:** the live town's page can also be opened from a phone on the same home Wi-Fi (read-only).
- **Backups:** a town restarted after every failed upgrade keeps one backup
  of its old save instead of a new full copy per try.
- **Refusal:** a save that can't be opened read-only is refused with a plain
  message, so a refused save itself is never written to.
- **Guard:** an upgraded save must now fit today's saved types at every depth
  (brains included) and have exactly today's tables.
- **Living town:** nothing to pick up. Saved state is unchanged and a v2 town
  carries on as it is.

## 0.9.3 (2026-10-25)

- Shopkeepers can no longer "set" a price to what it already is: it's refused in-world ("That's already your price"). Mdm Tan had re-set rice to $4.20 every minute and never answered the people asking her for work.
- Living town: picks this up on restart; nothing in the save changes.

## 0.9.2 (2026-10-25)

- Watch page: the story feed survives a restart; the page refills it with the latest stories from the saved town.
- Living town: a watch-page change only; the save already keeps every event.

## 0.9.1 (2026-10-25)

- Watch page: residents are no longer hidden behind shop fronts and buildings; they always draw in front.
- Living town: a watch-page change only; nothing in the town or its save changes.

## 0.9.0 (2026-10-25): launch

The first numbered release: everything up to the 24/7 launch.

- **Upgrades:** a save from an older version is backed up beside it
  (`kampung.db.bak-v<n>`) and upgraded in place on start; a save from newer
  code is refused, untouched, with a plain message.
- **Cast ties:** family and old friends know each other from day one.
- **Cast (M4):** the ten owner-approved residents, with their cards and
  starting ties.
- **Talk (M4):** a speaker waits for an answer and sees the talk so far, so
  conversations cost less.
- **Watch page (M3):** a local page with the pixel kampung, the story feed and
  resident cards, live, fake-fast or replaying a trial.
- **Minds (M2):** residents think on Haiku 5.5 within a per-resident budget
  and a daily town cap, remember with fading, discover places and people
  in-world, and talk line by line. Paid trials are measured and logged.
- **Sim core (M1):** the map, a real-time Singapore clock, needs, money, three
  owners and seven job-seekers, the morning lorry, every v1 action with
  in-world refusals, the story feed, and save and resume under
  `KAMPUNG_HOME` that skips missed hours.
- **Living town:** a town saved by earlier test builds (save v1) is backed up
  and upgraded to save v2 on start. Its residents gain their family and old
  friends among the people they know, and keep everyone they had already met.
  A new town starts at v2.
