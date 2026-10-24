# M1 sim rules: the numbers

Status: **Claude's calls, for the owner to confirm.** The spec ([v1-spec.md](v1-spec.md))
fixes the shape of the game. Building milestone 1 needed concrete numbers and
a few small rules it doesn't state. They are collected here so they can be
reviewed and tuned in one place. None of this goes into any resident's prompt.

## Time and needs

- 1 game minute = 1 real minute, Singapore time. Night is 23:00–06:00.
- Needs run 0–1000. Hunger rises 1 a minute awake and 1 every 3 minutes
  asleep, so a resident needs about 2–3 meals a day. Energy falls about 2
  every 3 minutes awake (1 a minute while fishing or working) and recovers 3 a
  minute asleep.
- At 23:00 anyone awake stops what they're doing, walks home and sleeps.
  Everyone wakes at 06:00. Brains are never asked to think at night.
- Running out of energy means dozing off on the spot until partly rested.
  Starving (hunger 1000) drains energy faster, ends a shift in progress and
  stops you starting one.
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
  or a worker on shift there. This is what a worker's shift is worth to the
  owner.
- Owners set selling prices and, as part of "set prices", buying prices: a
  shop with a buying price for fish will buy fish from anyone at that price,
  so fishers always have a buyer besides the lorry.
- An owner can take from or add to their own stock for free (the money stays
  in one purse).
- Opening prices: kopitiam kopi 10¢, fish porridge 35¢, vegetable rice 30¢,
  buys fish 25¢ and vegetables 15¢. Provision shop rice 30¢, coffee 70¢,
  bread 20¢. Wet-market stall fish 30¢, vegetables 20¢, buys fish 20¢ and
  vegetables 12¢.
- Kopitiam cooking (one batch): 1 coffee → 5 kopi; 1 fish + 1 rice → 2 fish
  porridge; 1 vegetables + 1 rice → 2 vegetable rice.

## Fishing and farming

- A fishing session takes 30 minutes and lands 0–3 fish (about 1 on average).
- The farm plot has 8 beds; each resident can tend up to 2. Kangkong is ready
  after 2 days with water on 2 different days, and gives 5 bunches a bed.

## Jobs

- An owner offers a job in person: a wage per shift, a start hour and 1–8
  hours, ending by 23:00. The offer lapses after 2 hours. Accepting is in
  person too, and you can hold one job at a time.
- Working a shift pays pro rata for the minutes worked. The wage is owed until
  the owner pays it in person.

## Talk, trades and the notice board

- "Nearby" means in the same place, or within 3 tiles in the open.
- Trade offers lapse after 30 minutes. Notes hold up to 200 characters; the
  board holds 12, and the oldest falls off.

## Downtime

- A gap of up to 10 minutes is replayed. A longer gap is skipped in one jump:
  walkers arrive, fishing lines come in empty, shifts count as worked, anyone
  asleep keeps resting, nobody gets hungrier than 800 from the gap, anyone who
  rested through a night or 6+ hours wakes rested, and if it's night everyone
  is home asleep. No lorry,
  sales or talk happen in the gap; the feed notes a quiet spell.
