# Daily life: debts, reasons to hire, more to do

Status: **agreed with the owner, 2026-10-25** (answers at the end; build
order A → B → C, then D with the village head). It's folded
together with [talk-circles.md](talk-circles.md) (PR 13) and comes before
households, the village head and the lorry trader
([village-characters.md](village-characters.md)). Everything a resident meets
here is in-world, and nothing in this note goes into a prompt.

## What the living town showed

Mdm Tan keeps an account book from her card ("you remember every debt"),
and Rahim gave her all his money ($64.56) for a debt that never existed (the
loss stands: no refund). No jobs since launch. "Look around" was 209 of 564
events.

## Order: four PRs

1. **A. Real debts:** small, the live harm, and the sequel to "words don't
   move money".
2. **B. Reasons to hire:** the biggest gap; brings timed cooking, which C reuses.
3. **C. More to do:** chores, errands, helping; errands lean on A and B.
4. **D. New places: held** until the village head exists (PR 9); only his
   build list here.

Each PR takes **the next save version at merge time**, with fixtures and a
"Living town" CHANGELOG line ([upgrades.md](upgrades.md)).

## A. Real debts and lending

**The ledger.** `WorldState.debts: Debt[]`:
`{ id, debtor, creditor, cents, since, kind: 'loan' | 'iou', due: number | null }`.
- `debtor` and `creditor` are *accounts*: a resident's id now, later a named
  account (`lorry-trader`, `village-fund`, beside `lorry`), so Pak Osman's
  credit and Mr Lim's hardship loans use the same ledger. Those PRs add
  `kind`s `'credit'` and `'hardship'` and set `due` (null for now).
- One record per (debtor, creditor, kind); a new debt adds to it, keeping the
  earliest `since`. Wages owed (`owed`) stay put but are perceived alongside.
- Money moves only through `World.transfer` (`loan`, `repaid`), so the money
  check still adds up.

**Nobody is put in debt without agreeing.** Every debt starts as an offer
that the other person agrees to, kept in `debtOffers` like trade offers
(expires after 30 minutes):

| Action (in-world hint) | Who | When it's offered | What it does |
|---|---|---|---|
| `lend`: lend someone money (person, money) | anyone | someone's nearby | an offer; once agreed, the money moves and a `loan` is recorded |
| `borrow`: ask someone to lend you money (person, money) | anyone | someone's nearby | an ask; once agreed, the same |
| `write_iou`: write someone an IOU saying you owe them (person, money, words: what for) | the one who owes | someone's nearby | once agreed, an `iou`, and no money moves |
| `agree` / `refuse`: agree to, or turn down, what someone offered or asked about money (person) | the other one | there's an offer from them | settles it either way |
| `repay`: pay back money you owe (person, and money to pay only part) | the one who owes | you owe someone | moves money, oldest debt first |
| `let_off`: let someone off what they owe you (person, and money for only part) | the one owed | someone owes you | the debt shrinks or goes |

Agreeing checks money then ("Mdm Tan doesn't have $2.00."). Only the one who
owes can write an IOU, so nobody can make up a debt owed to them.

**What they perceive**, every moment, next to their money (like
talk-circles (a)):
- `You owe Mdm Tan $2.00.` / `Rahim owes you $5.00.` (summed per person; an
  IOU's words in brackets: `(for the fish)`); a worker: `Mdm Tan owes you
  $1.20 in wages.` (today only the owner sees it); neither: `Nobody owes you
  anything, and you owe nobody.`
- Offers, until agreed, refused or 30 minutes old: `Mdm Tan offers to lend
  you $2.00.` / `Rahim asks to borrow $2.00 from you.` / `Rahim writes you
  an IOU for $5.00 (for the fish).` Memories of these are importance 7.

**Tie to talk-circles.** The new events (`debt_offered`, `debt_agreed`,
`debt_refused`, `repaid`, `let_off`) join its "paying, a deal" settling row.
"Settling his account" talk now meets a true line: no debt means both see
"Nobody owes you anything…"; a real one puts `repay` in front of them.

**The card line** (Mdm Tan, "you remember every debt", `src/seed/cards.ts`
and `cast.md`) can stay: now there are real debts to remember, shown every
moment. It's an owner-approved card, so it's his call.

**The money ledger reconciles from zero** (owner, 2026-10-25). `World.transfer`
stays the single door for money. On top of the debts:
- **Opening balances:** A's save step records each resident's money at the
  upgrade as an opening entry from a `kampung opening` account, and a fresh
  town records its residents' starting money the same way at creation. Then
  replaying the ledger from nothing gives every purse.
- **A nightly audit** in the live server, once a game day: replay the ledger
  and check every account's balance against the money in the world, writing
  a plain `ledger OK` or `ledger MISMATCH: …` line to the town log (and the
  owner's wiki later). Nothing a resident sees.
- **Separate accounts** for the outside: `lorry`, `travellers` (B), and
  later the village fund, the village head's purse and the lorry trader, as
  village-characters.md says.

**Save step:** `debts: []`, `debtOffers: []`, plus the opening entries.
Nobody owes anyone at upgrade, which is true; Rahim's payment stays a gift.

**Fake brain:** a broke, hungry job-seeker asks someone nearby to lend 50¢.
An owner with over $30 agrees half the time. Anyone with over $2 repays.

**As built (A, save v7).** The opening account is `kampung-opening`. The
upgrade's opening entries are each purse as it stood, and the nightly check
replays from the first opening entry, so a living town's earlier ledger rows
are history rather than double counted. A debt keeps an IOU's words in
`what`. `let_off` takes off the newest debt first; `repay`, the oldest.
`agree` / `refuse` answer money offers only for now (haggling may share them).
In the fake economy seekers are rarely broke, so fake trials show few debts;
the fake brain's lending is covered by tests.

## B. Reasons to hire

**Today** a sale goes through whenever the owner stands in the shop
(`isStaffed`), cooking is instant, and the only customers are the ten
residents. One person does it all, so nobody hires.

**1. Travellers from the coast road** (owner: nameless customers yes, but
not "the rest of the kampung": the town has only ten people). The road to
town that the lorry uses runs past the kampung, and labourers, hawkers and
trishaw riders stop for kopi and food, or buy fish and vegetables to take
home, busiest at the morning and evening rush. They're unnamed, with no AI
and no cost, and come to each shop at set hours. They join a queue and pay
the posted price if it's at or under what they'll pay. Residents perceive
them as travellers ("Two travellers from the road are waiting."). Their
money comes from outside, through a separate `travellers` ledger account
like `lorry`, and the economy knobs (9d) can tune how many come. Each one
wants one thing the shop sells and has in stock, picked by fixed weights.
**Later, a second delivery:** boats at the jetty, with fishermen from other
villages buying supplies and eating at dawn and dusk (an account of their
own). Leave room for a frequent traveller to become a named regular one day
(later perhaps a village character with an AI head), but don't build it now.

| Shop | Busy hours: one customer every | Other open hours (07–21): one every | About a day |
|---|---|---|---|
| Kopitiam | 06:30–08:30, 12:00–13:00, 18:00–19:00: 5 min | 20 min | 80 |
| Provision shop | 08:00–10:00, 16:00–18:00: 6 min | 30 min | 60 |
| Wet-market stall | 06:00–09:00: 4 min | 30 min | 70 |

What they'll pay at most (against the lorry's cost): kopi 20¢ (10¢ a cup),
fish porridge 50¢ (30¢ a bowl), vegetable rice 45¢ (22¢), rice 35¢ (20¢),
coffee 75¢ (50¢), bread 25¢ (15¢), fish 55¢ (40¢), vegetables 35¢ (25¢).
Later these become the "town reference prices" of the economy check.

**A daily budget per shop (owner, 2026-10-25: cap the outside money,
slowly, as his dial).** At the cadence above, travellers could bring about
$83 a game day into a town of about $345, with the lorry the only sink. So
each shop's travellers spend at most `travellerBudgetCents` a game day
(default 600, $6: about $18 for the town); once it's spent, nobody more comes
to that shop that day (counted as neither left nor away; those already
queued are still served). It's a dial in the owner's private settings
(`$KAMPUNG_HOME/settings.json`, `src/sim/dials.ts`), not saved with the
town. **These caps are training wheels:** the goal is for the residents to
run their own economy without our guardrails, so they're loosened and in the
end removed as real sinks (rent, Pak Osman, festivals) and the residents'
own behaviour take over.

**2. Serving takes time:** `SERVE_MINUTES = 2` a customer, in the tick, with
no thought. Servers are the owner at the shop (awake, not walking or
cooking) and each worker on shift there (not cooking). The queue holds 4, a
customer waits 8 minutes at most, and with nobody serving nobody is served.
**3. Cooking takes time:** `cook` becomes a timed activity, 10 minutes a
batch (kopi 5), with no serving meanwhile; about 20 bowls a day is about 100
minutes at the stove. **4. Long hours tire:** a minute serving takes energy
as a shift does (1, against ⅔ standing about).

**Worked example.** Kopitiam morning rush (06:30–08:30, about 24
customers): the owner alone is at the lorry until about 07:15 (about 9 lost)
and cooks three batches (about 6 lost), so serves about 9; with a 06:00–10:00
worker, about 22. 13 more sales at about 18¢ margin is about **$2.30 against
a $2.00 shift**. The stall's rush overlaps the lorry too (about 15 lost,
$2.25). Hiring pays, just; the trial tunes it. Fishing stays below a wage
(about 35¢ an hour).

**What they perceive:**
- An owner at their shop: `Three people are waiting to be served.`,
  `Today you've served 23; 9 left without being served.`, `Two people turned
  away at your fish porridge price.`, and after being away, `While you were
  away, 6 people found nobody serving.`
- Anyone at a busy shop: `Ah Huat is serving alone, and three people are
  waiting.` That's how a job-seeker finds work: a true need, seen.
- A worker on shift: `You've served 6 people this shift.` The feed gets one
  line an hour per busy shop; the ledger one row a sale.

**Tie to talk-circles.** Job talk now has a reason, and the true "serving
alone" line gives seekers something real to ask about. A hire in words still
meets `Ah Seng talks about a job, but no job has been offered.`

**Save step:** shops gain `queue: { item, t }[]`, `serving: { by, until }[]`
and `today: { day, served, left, away, tooDear }`, fresh; Activity gains
`cooking { item, batches, until }` (nobody is mid-cook at upgrade).
**Fake brain:** an owner hires whoever asked once 5 customers have left
unserved today; a seeker asks for work on seeing "serving alone".

**As built (B, save v10).**
- Travellers come on a fixed cadence (every N minutes of the day), and what
  each wants is picked by fixed weights from the minute, not the world's
  random numbers, so other runs aren't disturbed.
- The kopitiam wants kopi 3, fish porridge 2 and vegetable rice 2; the
  provision shop rice 3, bread 3 and coffee 1; the stall fish 3 and
  vegetables 2. Each traveller wants only what is priced and in stock.
- Too dear counts by item. "Left without being served" counts both those
  who gave up in the queue and those who found nobody serving. The owner
  hears of the latter on coming back ("While you were away, …").
- Each sale is one `travellers` ledger row and one `traveller_bought` event
  (not in the feed, but the wiki's Economy counts it). The feed gets one
  `travellers_hour` line per busy shop.
- Cooking is a `stove` on the resident, not a new Activity kind, so a
  worker on shift can cook without leaving the shift. While it cooks they
  can only talk or look around, don't serve, and aren't asked to think.
  The servings go into the kitchen when it's done.
- A minute serving tires like a shift.

## Haggling at the counter (PR 15)

A buyer can name the money they offer with `buy`; below the shop's price it
waits for whoever minds the counter, who agrees or refuses (naming the item
when that person also has a money matter pending, or they're asked which).
**A worker on shift can take an offer only down to four-fifths of the
posted price ("That's below what Mdm Tan lets you take."); an owner can take
any price** (owner's call, recorded 2026-10-25). Taking never charges more
than the shop asks at that moment. An offer lapses after 5 minutes, or when
the buyer leaves or nobody minds the counter, and the buyer hears it wasn't
taken. A worker never sees or takes their own offer.

## C. More to do each day

**1. Look around.** Main's 0.10.1 made its reply short and stopped it
becoming a memory, but it's still offered every moment and counts as doing
something, so the next thought comes in 2 minutes, not 10. **Stop offering
it**: the notes already say where you are and who's there. A typed one still
answers as 0.10.1 does but, like `say`, doesn't bring the next thought on.
No save change; the trial reports the calls saved.

**2. Chores:** timed activities started by one thought, with no thinking
while they run (cheaper than idling at the 10-minute pace). Like fishing,
being spoken to is heard and answered afterwards.

| Chore (hint) | Where, how long | What it gives |
|---|---|---|
| `fetch_water`: fetch a pail of water | the well, 10 min | a pail of water (new item; "You'd want to boil it first.") |
| `mend_nets`: mend your nets | the jetty, 30 min | your next 3 catches today bring one more fish |
| `sweep`: sweep the shop | your shop, or where you're on shift; 15 min | customers wait 12 minutes there today, instead of 8 |

A kopi or porridge batch needs a pail (the step gives the living kopitiam
4), so water has a buyer: the owner sets a buying price, or a hand fetches.

**3. Paid errands between residents.** `ask_errand`: ask someone to run an
errand for pay (person; words: "fetch water", or "take <thing> to <person>";
money). It's taken up with A's `agree`.
- The pay moves itself when the runner `give`s the asker a pail, or the
  thing to the named person, before the day ends (for "take", the thing is
  handed over on agreeing): `Rahim pays you 10¢ for the errand.`
- If the asker can't pay, it becomes a debt (A, kind `iou`: both agreed when
  it was taken): `Rahim couldn't pay; he owes you 10¢.`
- The runner perceives `You're fetching water for Rahim, for 10¢.` Events
  `errand_asked`, `errand_taken` and `errand_done` join talk-circles'
  "paying, a deal" settling row.

**4. Helping neighbours:** `help` (person) waters their dry beds at the farm
or mends their nets at the jetty; unpaid, and both remember it (importance 6).

**5. Fishing that pays.** At the dawn tide (06:00–09:00) an empty catch is
15% likely, not 30%: with mended nets, about 55¢ an hour against 35¢
ordinarily. A $2.00+ shift (50¢ an hour) still beats an ordinary day, as the
principles ask. Farming is unchanged.

**6. Less idle talk.** Busy residents chat less and reach the circles line
less often; the fake brain does chores when it has nothing else to do.

**Save step:** `water` joins the items; Activity gains `chore { kind, until }`;
residents gain `mended: { day, left } | null`, shops `sweptDay`, the world
`errands: []`; the living kopitiam gets 4 pails.

**As built (C, save v11).**
- A chore is an Activity `chore { chore, until, shopId, forId, shift }`.
- A worker on shift who sweeps keeps the shift held in the chore, counts the
  minutes as worked, and is back on shift when it's done. A chore cut short
  (at night, or collapsing) gives nothing.
- Helping mend someone's nets is the same 30-minute chore, for them. Helping
  with beds waters their dry beds at once.
- The pail goes into kopi and fish porridge batches; vegetable rice needs
  none.
- An errand asked lapses unanswered after 30 minutes; taken, at the day's
  end ("The errand for Rahim came to nothing."). For "take", the thing goes
  back to the asker, or, if the runner no longer has it, is owed for at what
  travellers pay (an IOU "for the fish"). Handing it back to the asker calls
  the errand off, unpaid.
- `agree` / `refuse` answer an errand too. With more than one thing pending
  from the same person, the item picks a price at the counter; words about
  the errand (errand, fetch, water, its item or who it's for) pick the
  errand, and words about money (money, loan, lend, borrow, owe, IOU) the
  loan; otherwise they're asked which, and told what to say.
- A worker sweeping across the end of a shift is paid only to the shift's
  end. A chore still under way when the town rests overnight is cut short.
- Pay that can't be made: "Rahim couldn't pay, so owes you 10¢." (no
  pronoun), an `iou` "for the errand".
- The fake brain mends its nets before fishing about half the time, fetches
  and sells water to the kopitiam (which buys it), and sweeps now and then.

## D. Later: the village head's build list (held)

Owner, 2026-10-25: new places arrive in-world, as Mr Lim developing the
village (power 9), never just appearing. So D is only his build list; each
build gets its own PR and step once he exists: a notice, a building site for
a few days (odd jobs carrying stores, power 6), then it opens. All within
x ≤ 38, so it works at 40 or 44 wide, leaving the east strip for his house.
Tie to talk-circles: places to gather give talk something to do, and walking
off together resets the circles count.

| Build | Where (tiles) | Use once built |
|---|---|---|
| Cross path | y 13, x 14–31; and x 22, y 8–12 down from the well | joins the farm path and the jetty path |
| Kopitiam porch, with tables | x 2–9, y 12–13 (the kopitiam reaches y 13) | sit with others; more customer room |
| Football patch ("the padang") | x 15–21, y 15–19 | gather and play in the evening |
| Surau | x 24–27, y 15–17 | pray (quiet time, no game effect), gather |
| Chinese temple | x 34–37, y 11–14 | pray, gather |
| Hindu shrine, under a big tree | x 29–30, y 17–18 | pray |
| School hut | x 16–19, y 11–12 | scenery until there are children |
| Coconut grove | x 34–38, y 16–20 | gather coconuts (a 30-minute chore; food, and sold) |

Art: our own, drawn in `scripts/art/build_art.py` (CC BY-NC-SA, per
`assets/art/kampung/CREDITS`), plus CC0 Ninja Adventure pieces already packed
(table, stool, trees), credited. No upgrade step for D now.

## What not to do

- **No rule lists or feature news in prompts.** New verbs appear only in
  "Things you could do right now", worded as the character would.
- **No numbers that give the machinery away.** Customers are travellers waiting,
  not a "demand rate". Debts are what someone owes, not a "ledger".
- **No refunds or rewrites of history** (Rahim's loss stands).
- **No AI for customers, chores or errands.** All scripted, all $0.

## Tests (scripted brains) and trial measures

- **A:** lend and borrow need the other's agreement, and offers expire.
  Agreeing checks money; an IOU moves none, and only the one who owes can
  write one. Repay goes oldest first, can be part, and refuses when short;
  `let_off` works. The perception lines (worker's wages, "Nobody owes you
  anything…") pass `expectInWorld`. Debt events settle "paying" words, and
  money is conserved across the ledger.
- **B:** a scripted day per shop: a lone owner loses rush customers while at
  the lorry or cooking, and a worker on shift serves them. A price over what
  customers pay is turned away and reported. Serving drains energy; the
  queue limit and the 8-minute wait hold; an empty shop serves nobody. The
  worked example comes out within ±20%.
- **C:** `look_around` isn't offered, and a typed one doesn't bring the next
  thought on. Each chore's time and yield. An errand pays on the matching
  `give`, becomes a debt when the asker is short, and expires at day's end.
  `help` waters a neighbour's beds.
- **Upgrades:** each step against the previous fixture; a town resumed
  mid-day runs half an hour.
- **Trial** (`--fake --hours 24`, seeds 42–44, before and after each PR), new
  blocks: `--- money ---` (debts made, repaid, let off; owners' and seekers'
  money at day's end); `--- work ---` (jobs offered and hired a day; served
  and left per shop; owners' margin; seekers' income per waking hour from
  wages against fishing and farming); `--- day ---` (share of waking minutes
  busy, look-arounds, calls per resident-hour).

## Risks

- Outside money could pile up with owners; the economy check and Pak Osman's
  limited lorry balance it later, and the trial watches it until then.
- More verbs: each is shown only when it applies.
- Owners pricing above what customers pay lose sales; "turned away" teaches.
- Water in recipes could stall a kopitiam nobody fetches for.

## The owner's answers (2026-10-25)

1. **Nameless customers: yes, but not "the rest of the kampung".** They're
   travellers on the coast road first (an outside `travellers` account,
   tunable by the economy knobs), and boats at the jetty later; see B.1. A
   frequent customer may one day become a named regular, but not now.
2. **Mdm Tan's card** ("you remember every debt"): keep it.
3. **Loans:** no interest and no due dates for now.
4. **Order:** A → B → C, then D after the village head.
5. **Cooking needs pails of water**, as a light chore: yes.
6. **"Pray"** is quiet time with no game effect, when D comes.
