# Changelog

Newest first. One line per change, in plain English. Each release says how a
town that is already living picks it up ("Living town"), because the town is
never reset (see [docs/design/upgrades.md](docs/design/upgrades.md)).

## 0.24.0 (2026-10-26): households

- **Households** ([docs/design/households.md](docs/design/households.md), build plan [households-build.md](docs/design/households-build.md)):
  - Ah Seng moves in with his father and Mei Ling with her aunt, so two houses stand free.
  - **Mr Lim, the village head,** lives in a house of his own up a path in the middle of the kampung. He owns every house and stall, and lets them: 50¢ a week a house, $1 a week a stall, held by the first of the household or the shopkeeper. He comes round for the rent on Mondays, into the village fund (an account of its own; the nightly audit still checks every resident's purse).
  - **Rent starts after notice:** everyone holding a place is told when; the first rent is due on the Monday at least four weeks on. What can't be paid is owed; it can be paid at his house.
  - **Buying:** a house or stall can be bought outright at a year's rent, or week by week (half as much again a week, theirs after 44 weeks). A place that's bought is never taken.
  - **Not paying:** a Monday's rent still owed at the next Monday's round, and the house is let go: the whole household sleeps rough at the jetty, where rest comes back at half the speed. What they owed stays owed. To rent a free house at Mr Lim's they must clear it and pay a week up front, and whoever was turned out with them comes home too. Paying what's owed in between starts the week's grace again from the newest week. A round missed while the kampung was away is caught up.
- **Living town:** at upgrade (save v19) Ah Seng and Mei Ling move in with family (any kerosene in their old stoves goes with them), everyone but Ah Kow knows the village head's house, and every place starts with nothing owing; rent begins in about four weeks.

## 0.23.0 (2026-10-26): thinking when something changes

- **Residents think when something changes, not on a clock.** Measured in the living town: 70% of thoughts came with nothing new since the last one, and asked "what now?" with nothing new, they talked, and talked in circles. Now someone turning up where they are (for a worker at the counter too), being spoken to, getting hungry (crossing into hungry, aching or faint), finishing what they were doing, their shift starting, or an offer to them ten minutes from lapsing brings a thought on; otherwise the next one is half an hour off, not ten minutes.
- **Memory without the echo.** Talk between two other people is heard in the moment but not kept in long-term memory, and isn't recalled from before. The same thing said over and over to the same person is remembered once, the newest (different things, and anything that matters like a promise or a debt, all stay), and only the newest two passing thoughts come back. (Ah Kow's mind held five copies of Mei Ling asking Mdm Tan if the rice was ready, and his own same thought four times.)
- **Food in sight.** Hungry with nothing to eat, a resident now sees where they could get food each time they think (a shop being minded, the lorry while it's in, the jetty for a fish), not only when idle. When idle and hungry, they think of family in another house.
- **Living town:** nothing to upgrade; memories already kept are recalled the new way at once.

## 0.22.0 (2026-10-26): less wasted thinking

- **Less wasted thinking** (in a day of the living town, about one call in three went on something that couldn't work):
  - Someone who has said three things in a row to a person who hasn't answered sees that they haven't, and a fourth is turned away ("Mdm Tan hasn't answered you."). Any answer, or doing something together, starts it again. (Ah Kow said much the same line to Mdm Tan every ten minutes for hours.)
  - **Buying** is offered at a shop only while someone is minding it (510 tries in a day at an empty provision shop).
  - Things are found by the names people actually use: "nasi putih", "bubur kosong (plain rice porridge)", "water from my pail", "my two fresh fish". Words that could mean something else ("a cup of coffee", "fried rice", "bread and fish") are still not guessed at. A list of things to trade counts one of each, or as many as it says.
  - Raw rice "needs cooking on a stove".
- **Living town:** at upgrade (save v18) nobody's count of unanswered lines has started.

## 0.21.1 (2026-10-26): the month's limit holds

- **The month's limit holds:** the town's daily cap is now what's left of the month's US$100 shared over the days left (today included), never above US$3.33 a day and never below nothing. A 31-day month can no longer reach US$103 at the daily cap; a costly start leaves less for the rest of the month. The residents, Pak Osman and the watch page's English all share it.
- **Living town:** nothing to upgrade.

## 0.21.0 (2026-10-26): trust and fondness

- **Trust and fondness** ([docs/design/relationships.md](docs/design/relationships.md)): each resident now holds two feelings about each person they know, moved only by deeds. Gifts, help, errands, trades, repaid debts, wages paid, lessons and talk warm them; wages left owed overnight, deals talked of that nothing backs within the hour and a plea for a loan turned down cool them. Words alone never move trust. Each kind of deed counts once a day between two people, so small change can't buy trust. Residents see it as one line in words for each of the few people near them they feel most strongly about ("You're fond of Rahim, and you trust Rahim."), never as numbers; the watch page's card shows the numbers to the owner.
- A hungry resident is now pointed to the lorry stop too, while Pak Osman is in with food they can afford (nobody had thought to buy his bread).
- **Living town:** at upgrade (save v17) family start fond and trusted, Ah Huat and Rahim as old friends, and everyone else neither; nothing that happened before counts.

## 0.20.0 (2026-10-26): cooking at home

- **Cooking at home** ([docs/design/home-cooking.md](docs/design/home-cooking.md)): every house has a small stove. Anyone can cook a plain dish at home (bubur, fish porridge, vegetable rice, kopi, and new **grilled fish** and **boiled kangkong**) from what they carry: one small pot at a time on a house's stove, two servings (three for a master cook), into their own hands. The skilled dishes stay at the kopitiam.
  - A stove needs fuel: **firewood**, gathered free past the farm plot (20 minutes a bundle, one bundle a pot), or a tin of **kerosene** from Pak Osman, which lasts four pots for anyone in that house.
- **Family:** a hungry resident with no shop serving thinks of a relative in another house and of the jetty, in turn ("You could ask your uncle Rahim for something to eat"), and seeing a relative faint with hunger stays in mind, once a day.
- **Living town:** at upgrade (save v16) every stove starts with no kerosene in it, and nobody has any firewood yet.

## 0.19.1 (2026-10-26): English on the watch page

- **English on the watch page:** an "English" button by the story feed shows lines residents say or think in Malay (or anything else) in English, with the original on hover. Speech itself is left as the residents choose. Translations come from the cheap model only while the button is on, a batch at a time, inside the town's daily cap (in the cost log as watch-page), and each line is translated once and kept privately under `$KAMPUNG_HOME`.

## 0.19.0 (2026-10-26): Pak Osman, and food for the kampung

- **Pak Osman, the lorry trader:** the morning lorry now has a driver. Pak Osman comes about half past six every day but Sunday and stays about an hour and a half. He has one lorry's worth of room a day, shared between what he brings from town (rice, coffee powder, bread and, new, kerosene) and the fish and vegetables he buys here: when it's full, he's full. What town can spare varies, so a shelf can run short. He no longer sells fish or vegetables.
  - Anyone can buy off the lorry now, not just shopkeepers; an owner's stock is still dropped off at their shop.
  - He sets his prices once a visit, always between 110% and 160% of the town price when selling and 40% to 80% when buying. He pays a little more when trade is slow, and asks a little more when money is piling up.
  - Name a price and he takes it, counters or says no; after about ten haggles a morning it's take it or leave it.
  - He keeps a book: regulars get slightly better prices and credit (up to about a quarter of a typical purse), debts last a week, and anyone who lets one run pays more and gets no more credit. He never forgets.
  - Ask him to bring something next time, with a deposit if you like. Nothing is promised: orders take at most half of what town sends of anything, so there is always some on open sale; he brings what town can spare and hands back the deposit for the rest (or all of it, if nobody comes for it).
  - He brings one line of news from town each visit.
  - In a thinking town his prices, his haggling and his news come from the cheap model (a fraction of a cent a visit, counted in the town's daily cap); with the cap spent or a call failing he trades by his usual ways.
- **Living town:** at upgrade (save v15) nobody has dealt with him yet. A lorry in at the stop carries on with the old lorry's goods and prices until eight; if the old lorry has already been today, he first comes tomorrow.
- **Feeding the town** (the kampung had run out of things to eat):
  - **Bubur:** rice and water, boiled soft, three bowls a batch. Any cook knows it, and cooking "rice" or "plain rice" makes it.
  - A cook can use what they've brought along when the kitchen is short.
  - "Eat" is only offered with something edible to hand, not with just raw rice or coffee powder.
  - A hungry resident is pointed only to shops someone is minding; with none, to the jetty for a fish. Finding nobody minding a shop ends that thought instead of trying again and again.
  - The lorry's horn tells everyone what he's brought from town today.
  - Neighbours can see when someone nearby looks hungry or faint with hunger.
  - Whoever pinned a note sees it as "your note" on the board.
- **Farm beds no longer stay taken forever:** a bed left without water for three days withers (a papaya tree holds out a week), its planter is told, and anyone may plant there again.
- A papaya tree's first fruit now needs watering every few days while it grows, not just once.
- The story feed says what was planted (chilli, a papaya tree) instead of always "kangkong", and notes when a bed withers.

## 0.18.0 (2026-10-25): what the skilled can do

- **Skills, what the skilled and masters can do:**
  - A skilled fisher with mended nets can **cast a net** from the jetty (45 minutes, up to four fish, one mended catch used), and a master's line sometimes brings up a **red snapper**.
  - A skilled grower can plant **chilli** (four watered days, four handfuls a bed), and a master can plant a **papaya tree** that fruits every three days once grown, as long as it's watered.
  - A skilled cook knows **sambal kangkong** (vegetables and chilli, three plates).
  - A master cook's batches give one more serving, and travellers pay up to a fifth more where a master cooked that day.
  - Travellers buy chilli, papaya and red snapper at the market stall, and sambal kangkong at the kopitiam, when they're priced.
  - Since 0.17.0, novices too get two more from a bed harvested on the day it's ready (5 → 7 for kangkong), and everyone fishes the evening tide (17:00–19:00). That means more vegetables and fish for the lorry: watch lorry income.
- **Living town:** at upgrade (save v14) every bed is growing kangkong, as before, and no master has cooked yet today.

## 0.17.0 (2026-10-25): skills

- **Skills:** residents get better at fishing, farming and cooking by doing them, a little each day, over a year or two to mastery. Better fishers' lines come up empty less often; a handy grower harvests one more a bed and a handy cook is quicker at the stove. An expert senses the tides, the crowds from the road, or a bed at its best. A master can show someone how, up to expert. Unused, a skill goes rusty after a few weeks and slips after a year. Residents meet all this in words, never numbers; the wiki shows each resident's skills. There's an evening tide now too (17:00–19:00), and a bed harvested on the day it's ready gives two more.
- **Living town:** at upgrade (save v13) the old hands start at their levels (Rahim fishing, Ah Huat and Mak Esah cooking, masters; Fatimah farming, expert; Ah Kow farming and Hassan fishing, handy); everyone else is a novice; no lessons are on; a bed that's had its waterings knows the day it was ready.

## 0.16.2 (2026-10-25): no more starving

- **Hunger that matters:** from very hungry a resident feels it ("Your stomach aches; you need to eat soon."), and near starving can't ignore it ("You're faint with hunger. You must eat now."). Faint with hunger, they eat any food they carry at once, without stopping to think. A hungry resident pottering about is pointed to where food is sold, before anything else.
- **Food left for the kampung:** travellers from the road no longer buy the last 2 of anything; that's an owner's dial (`travellerReserve` in `settings.json`). In the living town shops ran out of food to travellers, and five residents sat at the edge of starving.
- **Living town:** picks this up on restart; nothing in the save changes (the new dial takes its default until `settings.json` names it).

## 0.16.1 (2026-10-25)

- A shopkeeper standing in their own shop can eat straight from the stock, and is offered to. Owners were starving at their own counters (Ah Huat and Mdm Tan at the hunger limit) because eating only worked on carried food.
- Living town: picks this up on restart; nothing in the save changes.

## 0.16.0 (2026-10-25): families

- **Families:** nobody's family is imaginary any more. **Mak Esah** (63), Siti's mother, lives in Siti's house; **Aminah** (12) and **Hassan** (8), Fatimah's children, live with her: thirteen residents in ten houses. Under 14 they can do chores, errands and fishing but can't be offered a shift ("Hassan is too young to work a shift."); from 60 a body tires a third quicker. They start with no money of their own and think on about half an adult's allowance (the town's daily cap is unchanged). Family call each other as families do: to Siti, "Mak" is her mother. Cards no longer leave room for invented relatives: Ah Huat is a widower, Mei Ling's parents died and her aunt raised her, and Fatimah's children are named.
- **Living town:** at upgrade (save v12) Mak Esah, Aminah and Hassan are at home, as they always were, knowing every place in the kampung and their family, who know them; everyone gets a birth year from their age. The new card lines are picked up on restart.

## 0.15.0 (2026-10-25): more to do each day

- **More to do each day:** chores that take a while with no thinking meanwhile: fetch a pail of water at the well, mend your nets at the jetty (the next few catches bring one more fish), sweep the shop (travellers wait longer in a swept shop). Kopi and fish porridge now take a pail of water. Residents can ask each other to run errands for pay ("fetch water", "take a fish to Mdm Tan"), paid when it's done or owed if the asker can't pay (an errand not done by the day's end hands the thing back, or it's owed for), and help a neighbour water their beds or mend their nets. At the dawn tide a line comes up empty half as often.
- **Looking around** is no longer offered (where you are and who's there is already in front of you), and doesn't bring the next thought on.
- **Living town:** at upgrade (save v11) nobody's nets are mended, no shop is swept, no errands are pending, and the kopitiam gets 4 pails of water.

## 0.14.0 (2026-10-25): travellers on the coast road

- **Travellers from the coast road:** labourers, hawkers and trishaw riders stop at the shops at set hours (busiest at the morning and evening rush), queue, and pay the shop's price if it's no more than they'll pay; serving each takes 2 minutes, by the owner there or a worker on shift. At the shop, owners see who's waiting, how many they served today and how many left unserved or turned away by price; away from it, they hear on coming back how many found nobody serving. Anyone at a busy shop sees someone serving alone. Money from travellers comes from outside the town, and each shop's travellers spend at most $6 a game day (once it's spent, nobody more comes that day).
- **Cooking takes time:** a batch takes 10 minutes at the stove (kopi 5), with no serving meanwhile. Serving tires like a shift. Owners who lose customers have a reason to hire.
- **The owner's dials:** `settings.json` under `KAMPUNG_HOME` holds limits on money from outside, written with the defaults on first start (for now the travellers' daily budget per shop, 600¢). Training wheels, loosened as the residents' own economy takes over.
- **Living town:** at upgrade (save v10) every shop starts the day with nobody waiting, nobody is mid-cook, and nothing spent by travellers yet; `settings.json` is written on the first start after the upgrade.

## 0.13.0 (2026-10-25): haggling at the counter

- **Haggling at the counter:** a buyer can name what they'll pay. At or above the shop's price it's a sale at the shop's price; below it, whoever minds the counter (the owner, or a worker on shift) sees the offer and can take it or turn it down, and a taken offer is a sale at that price, shown in the feed. A worker can take an offer down to four-fifths of the price; the owner, any. It lapses after a few minutes, or once the buyer leaves, and the buyer hears it wasn't taken. In the living town Ah Seng and Rahim agreed 26¢ for a bunch of vegetables, then he paid the posted 30¢, twice.
- **Giving nothing:** a gift of no money or none of something is refused ("You'd be giving nothing.") and nothing is recorded.
- **Living town:** at upgrade (save v9) no offers are waiting at any counter.

## 0.12.1 (2026-10-25): fixes from watching the town

- **Someone who's gone:** talking to or dealing with someone who isn't nearby now says who is ("Ah Seng isn't nearby. There's nobody here with you."), and the resident stops trying that minute. "Isn't nearby" was 22% of all action results (Raju tried Ah Seng 79 times). A name nobody in the kampung has is answered so.
- **Nothing to do:** after half an hour of pottering about with nothing done, a resident who isn't busy or minding their own shop is reminded of places they could walk to (the farm plot and the jetty first, never where they are). The day's plan is read against how they feel now; hungry at home with nothing to eat, they see "There's no food in the house." Memories no longer bring back who was nearby then.
- **The lorry's horn:** everyone awake hears the lorry come in, and learns where it stops.
- **Shops by their owners:** in a shop, residents see whose it is ("Mdm Tan's provision shop") and can walk to it by that name. 41 lines had a rumour of Ah Seng running a shop.
- **Said all there is to say:** two who go round in circles twice over (12 lines with nothing done) both see it, and lines to each other are held back until they do something together or 30 quiet minutes pass.
- **Living town:** picks this up on restart; nothing in the save changes.

## 0.12.0 (2026-10-25): the Kampung wiki

- Watch page: a **compact resident card**: the name, role, hunger and energy as coloured icons, and money in the header; one "Now" line (what they're doing, where, how hungry and tired); their work; what they carry as chips; an owner's shop folded away; then tabs for **Plan**, **Thoughts**, **Talk** and **Money**. Near-identical thoughts fold into one ("×3"), the model's own "*Ah Kow thinks:*" labels and asterisks are gone, and each list shows 3 with "more". The **Money** tab shows their income and spending by kind (sales, purchases, wages, gifts, trades, loans, repayments, the lorry), today and this week, and every entry (when, with whom, what, how much).
- Watch page: a **Wiki** button in the header opens the Kampung wiki: **People** (who they are from their cards, home, work, money, family and old friends), **Places** (what each is for and whose it is), **How it works** (needs, money and shops, cooking, fishing and farming, the lorry, work and wages, the calendar, written from the rules in the code so its numbers stay true), **Economy** (per game day for up to a week: GDP (what the town made: sales in town and to the lorry, less orders off it) and value traded, sales, money in town, money in and out across the town's edge; today's earnings and everyone's money as bars; who works for whom; debts; each shop's and resident's money, opened up by kind with every entry; the last ledger check; thinking spend against the daily cap) and **What's new** (this changelog, with the running version). Read-only, from the saved events.
- Living town: watch-page changes only; nothing in the town or its save changes.

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
