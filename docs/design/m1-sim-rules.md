# M1 sim rules: the numbers

The spec ([v1-spec.md](v1-spec.md)) fixes the shape of the game. Building
milestone 1 needed concrete numbers and a few small rules it doesn't state.
They are collected here so they can be reviewed and tuned in one place. None
of this goes into any resident's prompt.

## Owner decisions (agreed 2026-10-24)

1. **Workers mind the shop, and kopitiam workers also cook.** A shop sells
   only while its owner or a worker on shift is there. A kopitiam worker on
   shift can cook from the kitchen's stock, like the owner.
2. **Owners post buying prices, with a limit if they like** ("fish at 20¢, up
   to 10"). Anyone can sell to them at that price until the limit or the
   owner's cash runs out. Haggling with a trade offer works too.
3. **Wages are a cash debt, paid in person.** There's no bank and no auto-pay:
   an owner with no cash can't pay. When pay happens is between owner and
   worker, agreed in talk and not enforced by the game. Owners can pay part
   of what they owe.
4. **Economy balance waits for M2**, when real brains set prices and wages.
5. **Owners set every price themselves.** Shops start with stock but no
   prices. Owners who price badly can go broke; that's part of the story
   (social mobility). The numbers below that are rules of the world, such as
   food values, hunger, fishing, crops and the lorry's fixed price list, are
   starting values, to be tuned after watching real brains play.
6. **No shop changes hands in v1.** A broke owner keeps an empty shop and can
   recover by fishing or farming. Selling or taking over a shop is a later
   feature that residents discover in the world.

## Time and needs

- 4 game minutes per real minute since 2026-10-25 (it was 1 game minute = 1
  real minute); the rules below are all in game time. Night is 23:00–06:00.
- Needs run 0–1000. Hunger rises 1 a minute awake and 1 every 3 minutes
  asleep, so a resident needs about 2–3 meals a day. Energy falls about 2
  every 3 minutes awake (1 a minute while fishing or working) and recovers 3 a
  minute asleep.
- At 23:00 anyone awake stops what they're doing, walks home and sleeps.
  Everyone wakes at 06:00. Brains are never asked to think at night.
- Running out of energy means dozing off on the spot until partly rested.
  Starving (hunger 1000) drains energy faster, ends a shift in progress and
  stops you starting one. From 800 a resident is told their stomach aches;
  from 950 they're faint, and eat the most filling food they carry at once,
  without a thought.
  Nobody dies.
- Walking covers 3 tiles a minute along the shortest route, preferring
  footpaths.

## Money and goods

- Integer cents. Starting purses: $5–$20 for job-seekers, $60–$100 for owners
  (spec §2), drawn from the seeded RNG.
- Goods: fish, vegetables (kangkong), rice, coffee powder, bread, and the
  kopitiam's kopi, fish porridge and vegetable rice.

| Food | Hunger it takes away |
|---|---|
| fish porridge | 450 |
| vegetable rice | 400 |
| bread | 250 |
| fish (eaten as caught) | 150 |
| vegetables | 100 |
| kopi | 50, and +120 energy |

Rice and coffee powder can't be eaten as they are.

## The lorry (07:00–07:30 at the lorry stop)

| Owners order (money leaves town) | Anyone sells (money enters town) |
|---|---|
| rice 20¢, coffee 50¢, bread 15¢, fish 40¢, vegetables 25¢ | fish 15¢, vegetables 10¢ |

Ordered stock is dropped off at the owner's shop.

## Shops

- A shop serves only while someone is minding it: the owner standing in it,
  or a worker on shift there.
- Owners set selling prices and buying prices. A buying price can carry a
  limit ("up to 10"), which counts down with each purchase; the owner sets a
  new one when they want more.
- An owner can take from or add to their own stock for free (the money stays
  in one purse).
- No opening prices. Shops start stocked (kopitiam: coffee, rice, a little
  fish and vegetables, and some kopi and dishes ready; provision shop: rice,
  coffee, bread; stall: fish, vegetables) and owners price them in play.
- Kopitiam cooking (one batch), by the owner or a worker on shift: 1 coffee →
  5 kopi; 1 fish + 1 rice → 2 fish porridge; 1 vegetables + 1 rice → 2
  vegetable rice. A batch takes 10 minutes at the stove (kopi 5); the
  ingredients go in at the start and the servings come out at the end.
- Chores (daily-life.md C), with no thinking while they run: fetch water at
  the well (10 min, a pail), mend nets at the jetty (30 min; the next 3
  catches today bring one more fish), sweep your shop or where you're on
  shift (15 min; travellers wait 12 minutes there today, not 8). A batch of
  kopi or fish porridge takes a pail of water. At the dawn tide (06:00–09:00)
  and the evening tide (17:00–19:00) a fishing line comes up empty half as
  often.
- Skills (skills.md): fishing, farming and cooking get better with finished
  deeds, so much a day. A novice's odds, yields and times are as above; a
  better fisher's line comes up empty less often (30/25/20/15/10%), a handy
  grower harvests one more a bed, a handy cook is a fifth quicker. Any bed
  harvested on the day it's ready gives two more. Skills rust with disuse
  and fade after a year; a Master can show someone how, up to Expert.
- Travellers from the coast road (daily-life.md B) come to each shop at set
  hours, queue (4 at most, 8 minutes at most), and are served 2 minutes
  each by the owner there or a worker on shift there, neither cooking. They
  pay the shop's price from outside (the `travellers` account) if it's no
  more than they'll pay (kopi 20¢, fish porridge 50¢, vegetable rice 45¢,
  rice 35¢, coffee 75¢, bread 25¢, fish 55¢, vegetables 35¢).
- Haggling at the counter: `buy` can name the money offered. At or above the
  shop's price it's an ordinary sale at the shop's price (nobody overpays).
  Below it, it's an offer whoever minds the counter (the owner there, or a
  worker on shift) sees ("Ah Seng offers 16¢ for a bunch of vegetables.")
  and can agree to or refuse; taken, it's a sale at that price, the money to
  the owner, never more than the shop asks at that moment. A worker on
  shift can take only down to four-fifths of the price; the owner, any. It
  lapses after 5 minutes, or once the buyer leaves or nobody minds the
  counter, and the buyer hears it wasn't taken. A gift of no money or none
  of something is refused ("You'd be giving nothing.").
- On shift, a worker can still look around, talk, answer an offer at the
  counter and (at the kopitiam) cook,
  without leaving the shift.

## Fishing and farming

- A fishing session takes 30 minutes and lands 0–3 fish (about 1 on average).
- The farm plot has 8 beds; each resident can tend up to 2. Kangkong is ready
  after 2 days with water on 2 different days, and gives 5 bunches a bed.

## Jobs

- An owner offers a job in person: a wage per shift, a start hour and 1–8
  hours, ending by 23:00. The offer lapses after 2 hours. Accepting is in
  person too, and you can hold one job at a time.
- Working a shift pays pro rata for the minutes worked. The wage is owed until
  the owner pays it in person, in full or in part.

## Talk, trades and the notice board

- "Nearby" means in the same place, or within 3 tiles in the open.
- Trade offers lapse after 30 minutes. Notes hold up to 200 characters; the
  board holds 12, and the oldest falls off.
- Going somewhere together: when someone you exchanged a line with in the
  last 5 minutes sets off, you notice ("Ah Huat sets off for the
  kopitiam.") and think again within a minute. "Go with" someone walks you
  to where they're heading. It's offered while someone nearby is walking, or
  someone you spoke with in the last 5 minutes is; if they've already
  stopped, you go after them. Nothing about it is saved.

## Debts and lending

- A loan offered, a loan asked for, or an IOU written waits on the other
  one's yes for 30 minutes. Agreeing checks the lender's money then; an IOU
  moves none. Both have to be nearby.
- One debt per debtor, creditor and kind (`loan` or `iou`): a new one adds
  to it and keeps when it began; an IOU's words (up to 80 characters) are
  kept with it. No interest and no due dates (owner, 2026-10-25).
- `repay` pays the oldest debt first; with no sum it pays all, and refuses
  when short; more than is owed pays only what is owed. `let off` takes off
  the newest debt first, so the oldest stands longest.
- The ledger's outside accounts: `lorry`, and `kampung-opening`, the opening
  entry for each purse (a new town's starting money; at the v7 upgrade,
  everyone's money as it stood). The nightly check replays the ledger from
  the first opening entry; what came before it is already in it.

## Living-town review fixes (2026-10-25)

- Someone who isn't nearby is answered with who is: "Ah Seng isn't nearby.
  There's nobody here with you." / "Here with you: Siti and Muthu." That
  refusal ends the thought (asking again that minute won't bring them back),
  and the next comes after the short after-action gap (at the quiet pace if
  the last thought ended the same way). A name nobody in the
  kampung has: "You don't know anyone called "Mak"; there's nobody by that
  name in the kampung."
- Pottering about with nothing done for 3 quiet thoughts (30 minutes), a
  resident who isn't busy (walking, fishing, on shift) or minding their own
  shop is reminded of places they know: any with a job of Mr Lim's they
  could take there today first (not done, nobody at it, and they've done
  none today; Kampung, 2026-10-30, so building-site jobs get taken), then
  the farm plot and the jetty, then one more turning with the time, never where they are ("There's
  nothing more to do here. You could walk to …"). Read from when they last
  did something, so nothing new is saved.
- Hungry at home with no food carried: "There's no food in the house." The
  day's plan is shown with how they feel now.
- Memories recalled leave out "Nearby: …" lines (who was there then).
- When the lorry arrives, everyone awake hears its horn ("You hear the
  lorry's horn from the lorry stop."), learns where it stops, and thinks
  again within a minute.
- Standing in a shop, residents see whose it is ("Mdm Tan's provision shop";
  the owner, "your provision shop"), and can walk to it by that name. Only
  the words change: the place keeps its own name and id in perception.
- Two who keep talking with nothing done for twice the circles count (12
  lines) have said all there is to say: both see it, lines to each other are
  held back ("You and Siti have said all there is to say."), and doing
  something together, or 30 quiet minutes, opens it again.

## Downtime

- A gap of up to 10 minutes is replayed. A longer gap is skipped in one jump:
  walkers arrive, fishing lines come in empty, shifts count as worked, anyone
  asleep keeps resting, nobody gets hungrier than 800 from the gap, anyone who
  rested through a night or 6+ hours wakes rested, and if it's night everyone
  is home asleep. No lorry,
  sales or talk happen in the gap; the feed notes a quiet spell.
