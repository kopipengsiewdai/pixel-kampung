# Skills: getting better at what you do

Status: **settled 2026-10-25** (answers at the end: 4 and 5 are the owner's
decisions; 1–3 are Claude's calls, owner informed). It
builds on B (timed cooking, [daily-life.md](daily-life.md)) and C (mended
nets, the dawn tide), so the build comes after both are merged, and before
the village head (PR 9). Everything a resident meets here is in-world: no
numbers, levels or "experience" reach a prompt.

## What the owner asked for (2026-10-25)

- Skills now: **fishing, farming, cooking**. Later: mending and carpentry,
  trading, sewing.
- Five levels: **Novice, Handy, Skilled** (a new ability), **Expert**
  (timing), **Master** (a signature ability, and can teach).
- Experience **only from doing**. Levelling up is an in-world moment, and an
  ability appears as an action.
- Time to Master **at least a game year**: cooking 1.5, fishing 2, farming
  2, carpentry 3. The curve: Handy at 5%, Skilled at 20%, Expert at 50%.
- **Teaching** only by a Master, to someone nearby, at about twice the pace.
- **Fading:** rusty after a while without practice; one level lost after
  about a year unused, but never below Handy once Skilled was reached. Each
  skill fades at its own rate, with a hook for a change of tools.
- Starting levels: Ah Huat cooking Master, Rahim fishing Master, Fatimah
  farming Expert, Ah Kow farming Handy, Hassan fishing Handy, and Mak Esah
  cooking Master (answer 5); Hassan and Mak Esah come with the families PR.
  Everyone else starts as a Novice at everything.

## The principle: Novice is today

A Novice does exactly what everyone does now: the same catch odds, yields
and cooking times. Every level only adds to that. So the upgrade makes
nobody's day worse; only the starting Masters and Experts are better off
from the first morning.

## Experience: deeds, a day at a time

Experience counts **deeds**, and only finished ones (a line cut short, a
batch abandoned or a walk to the jetty count for nothing):

| Skill | A deed | A good day's practice (the daily cap) |
|---|---|---|
| fishing | a line brought up, empty or not (`caught_fish`); a cast net counts 2 | 6 (three hours at the jetty) |
| farming | planting a bed, watering a bed, harvesting a bed | 4 (two beds: plant, water, harvest, every two days) |
| cooking | a batch finished at the stove (`cooked`, per batch), at your own kitchen or on shift | 8 |

**You only learn so much in a day.** Deeds past the cap that day still
count as work (the fish are still caught) but teach nothing more. The cap
is what makes the "at least a year" a floor and not a target: nobody grinds
to Master in a month, however much they fish. A fake day (seed 42, 24 game
hours) shows the caps are what a diligent resident does now: six lines a
day each for the six who fish, two beds planted and watered, and four
batches for Ah Huat before travellers.

**Thresholds** (deeds; time at the full daily cap, game days, with real days
at 4.8 a day in brackets):

| | cap | Handy (5%) | Skilled (20%) | Expert (50%) | Master (100%) |
|---|---|---|---|---|---|
| fishing (2 years) | 6 | 219: 37 d (8 real) | 876: 146 d (30) | 2 190: 1 yr (76) | 4 380: 2 yr (152) |
| farming (2 years) | 4 | 146: 37 d (8) | 584: 146 d (30) | 1 460: 1 yr (76) | 2 920: 2 yr (152) |
| cooking (1.5 years) | 8 | 219: 27 d (6) | 877: 110 d (23) | 2 192: 274 d (57) | 4 384: 1.5 yr (114) |
| carpentry, later (3 years) | tbd | 5% | 20% | 50% | 3 yr |

Those are the fastest anyone can go. An LLM resident who fishes some days
and works shifts on others will take longer, and that's fine: Handy comes
within a week or two of real time for anyone who sticks at it, and Master is
a lifetime's work.

**Starting levels** are set at that level's threshold, practised today, so
nobody starts rusty.

## Levels in-world

**What they perceive.** One line about themselves, among the lines about
who they are (beside money and debts), only from Handy up. Words, never a
level name or a number:

| | fishing | farming | cooking |
|---|---|---|---|
| Handy | You're handy with a fishing line. | You've a feel for growing things. | You can cook a decent meal. |
| Skilled | You know how to throw a net. | You've learnt to grow chilli. | You know your way around a kitchen. |
| Expert | You can read the tides. | You know when a bed is at its best. | You can tell when the crowds will come. |
| Master | People say nobody fishes like you. | People say nobody grows like you. | People say nobody cooks like you. |

**Levelling up** is a notice when the deed that crosses the line is done,
remembered at importance 7, with a `skill_up` event (a key moment in the
feed: "Rahim has become an expert fisher."):

| | fishing | farming | cooking |
|---|---|---|---|
| Handy | The line feels natural in your hands now. | You're getting the knack of the beds. | Your cooking is coming along. |
| Skilled | You've worked out how to throw a net. | You think you could grow chilli now. | You've worked out how to make sambal kangkong. |
| Expert | You've started to feel when the tide will turn. | You can tell when your kangkong is at its best. | You've started to sense when the crowds will come. |
| Master | You know these waters as well as anyone. | The soil does what you ask of it. | Your cooking has become your own. |

**What others see** is only what happens: a red snapper coming up at the
jetty, a third plate from one batch. Reputation is talk, not a stat. Later,
when the wiki's People section shows skills, watchers see the level names
(the wiki is for watchers, not residents).

## What each level does

Effects build up: Expert keeps Handy's and Skilled's.

### Fishing

| | effect | today (Novice) → this level |
|---|---|---|
| Handy | an empty line less often | 30% → 25% (dawn tide 15% → 12%) |
| Skilled | **`cast_net`**: throw a net from the jetty | 45 minutes; 0–4 fish (about 2.2 on average); needs nets mended today (C's `mend_nets`) and uses one of their catches; counts 2 deeds. Empty lines 20% |
| Expert | **told the tides**: the dawn tide (C, 06:00–09:00) and a new evening tide (17:00–19:00) | "The evening tide is coming in: the fish will bite well until seven." Empty lines 15%. The evening tide is there for everyone, as the dawn tide is; only an Expert is told |
| Master | **red snapper**: about one line in twelve | a new item; travellers at the market stall pay up to $1.50. Empty lines 10% |

A Master's average line goes from 1.0 fish to 1.2 plus a snapper one line
in twelve: at today's prices Rahim earns about two fifths more for the same
hours.

### Farming

| | effect | today → this level |
|---|---|---|
| Handy | a bigger harvest | 5 → 6 bundles a bed |
| Skilled | **`plant` chilli** as well as kangkong | a new item; ripe in 4 days, 4 a bed; travellers at the market pay up to 40¢; the ingredient for sambal kangkong |
| Expert | **told the best day** | a bed harvested on the day it ripens yields 2 more (for everyone; only an Expert is told: "Bed 3 is at its best today.") |
| Master | **papaya**: plant a tree in a bed | a new item; first fruit after 10 days, then 2 papayas every 3 days as long as it's watered every 3 days. A bed that keeps giving. Travellers at the market pay up to 60¢; good to eat |

### Cooking

| | effect | today → this level |
|---|---|---|
| Handy | quicker at the stove | each batch a fifth quicker (B's porridge 10 → 8 minutes, kopi 5 → 4) |
| Skilled | **sambal kangkong**, a new dish (a new `cook` choice) | vegetables + chilli → 3 plates, 8 minutes; travellers at the kopitiam pay up to 50¢. Ties the kitchen to a Skilled farmer |
| Expert | **told when the crowds will come** | 45 minutes before each of B's busy hours: "The noon crowd from the road will be in soon." |
| Master | **a cook's own dish** | one more serving per batch (kopi 5 → 6, porridge 2 → 3), and travellers pay up to a fifth more at a kitchen where a Master cooked that day |

Ah Huat starts as a Master: a third less rice and fish per bowl of
porridge, and a kopitiam that travellers pay more at. This shifts the town's
money towards the kopitiam (see Risks); the knobs are the extra serving and
the fifth.

## Teaching

- **`teach`** (person, what: fishing, farming or cooking) is offered to a
  Master when someone's nearby. It's an offer, like a loan: the learner
  `agree`s or `refuse`s (`whichOffer` gains lessons), and it lapses after 30
  minutes.
- **A lesson lasts the rest of the day.** While teacher and learner are at
  the same place, the learner's deeds count double and their daily cap
  doubles. The learner sees "Rahim is showing you how he fishes."; once
  either leaves, it pauses.
- **Teaching only takes someone up to Expert.** Mastery is your own: past
  Expert a lesson teaches nothing more ("You've learnt all Rahim can show
  you; the rest is up to you."). That keeps the year floor even with a
  teacher: cooking 0.38 + 0.75 = 1.1 years, fishing and farming 1.5.
- The teacher gains nothing but the time it takes (they must stay), and the
  learner's thanks. Teaching yourself isn't offered; teaching an Expert is
  answered in words ("Fatimah knows as much as you could show her.").
- A Master can teach while doing the thing themselves (Rahim fishing beside
  Siti), so it costs the teacher little.

## Fading

| | rusty after unused | a level lost after unused | floor |
|---|---|---|---|
| fishing | 30 days | 365 days, then each 365 more | Handy once Skilled was reached, else Novice |
| farming | 45 days (a season off is normal) | 365 days | as above |
| cooking | 21 days | 365 days | as above |
| carpentry, later | 60 days | 540 days | as above |

- **Rusty:** the skill's effects work one level down (abilities stay: a
  rusty Skilled fisher can still cast a net, with Handy's odds), and the
  resident sees "It's been a while since you last fished; your hands are
  slow." One day's full practice (the daily cap) clears it, with "The feel
  of the line comes back to you."
- **A level lost:** experience drops to that level's threshold (the bottom
  of the level below) and the notice is "You've lost some of your feel for
  the nets." Nobody drops below Handy once they reached Skilled (`peak`
  remembers the highest).
- **The nightly check** runs in the same day roll as the audit; no cost.
- **A change of tools** (a hook, not built now): `toolsChange(skill)` turns
  everyone's skill rusty at once and can scale the thresholds, for when the
  motor boat or the gas stove comes. An upgrade step calls it, so residents
  find out in-world ("The new stove doesn't behave like the old one.").

## Saved state

`Resident.skills: Partial<Record<SkillId, { xp, peak, lastDay, today: {
day, xp }, rusty: boolean }>>`, plus `lessons: Lesson[]` and
`lessonOffers` in the world, and the new items (chilli, red snapper,
papaya, sambal kangkong) and a bed's `crop`. The upgrade step (the next save
version at merge, with frozen fixtures and a "Living town" line) gives
everyone an empty `skills`, then the owner's starting levels at their
thresholds. The families PR lands first, so S1 seeds Hassan's fishing
and Mak Esah's cooking too.

**No back-credit from the town's history.** The live town has a few weeks
of fishing behind it, but crediting it would be the one place experience
didn't come from doing (answer 3).

## The code, briefly

- `src/sim/skills.ts`: `SKILLS` (caps, thresholds, fading, lines),
  `levelOf`, `effectiveLevel` (rust), `practise(w, r, skill, deeds)` (the
  cap, lessons, level-ups, clearing rust), `fadeSkills(w)` (nightly).
- Hooks: `catchFish` (empty odds, snapper), `harvest` (yield, best day),
  `plant` (crop), `cook` and `stoveMinute` (time, yield, recipes),
  `travellersMinute` (a Master's fifth), perception (one line per skill, the
  tide, crowd and best-day lines).
- New actions only where they apply: `cast_net` (Skilled, at the jetty,
  nets mended), `teach` (Master, someone nearby). `plant` and `cook` gain
  choices rather than new verbs.
- Fake brain: casts a net when it can, harvests on the best day, cooks
  ahead of a coming crowd, and a Master teaches one nearby resident a day
  who's doing the same thing; the learner agrees.
- Wiki: People shows each resident's skills by level name and how far to
  the next; How it works gets a short section with the level names.

## Cost

No model calls: practice, levels and fading are all in the tick. Prompts
grow by at most three short lines (the self line per skill above Novice,
plus a tide or crowd line when it's due), and by one or two actions where
they apply.

## Tests (TDD, first)

Novice odds, yields and times are unchanged. The daily cap holds. Each
threshold is crossed on the right deed, with its line, memory and event.
Each level's effect works, and the abilities appear only from their level.
Teaching doubles until Expert and stops there, pauses when apart and lapses
at midnight. Rust after its days and clears after a day's practice; a level
lost after a year, never below Handy past Skilled. The upgrade sets the
starting levels. In-world wording checks over every new line. A fake trial
(`--fake --hours 24`, seeds 42–44) before and after, with a `--- skills ---`
block: deeds per skill, level-ups, lessons, and the starting Masters'
income against before.

## Build order: two PRs

1. **S1, the core:** experience, levels, perception lines, level-ups,
   rust and fading, teaching, the Handy and Expert effects (no new items),
   the save step, the wiki, the fake brain. Ships the starting levels.
2. **S2, the abilities:** Skilled and Master for each skill: `cast_net`,
   red snapper, chilli, papaya, sambal kangkong, a Master's dish, with
   their items and a second save step.

S1 alone is worth having: the town gets better at things, and the Experts
are told the tides, the best day and the crowds. S2 adds the new things to
make and sell (answer 1: split).

## Risks

- **Money towards the masters.** Rahim, Ah Huat, Mak Esah and Fatimah start ahead and
  stay there for a year; jobless seekers fish at Novice odds. That's the
  story (the old hands and the newcomers), but the trial watches seekers'
  income, and the knobs are the Master effects.
- **Kitchens without chilli** can't cook sambal kangkong; it only shows when
  the kitchen has the ingredients, like any recipe.
- **Rust feels unfair** to a resident who had no choice (a long job away
  from the jetty); 30–45 days of game time is 6–9 real days, long enough
  that only real neglect rusts.
- **Prompt growth:** at most three lines; Novices see none.

## As built (S1, save v13)

- `src/sim/skills.ts` holds the numbers above: thresholds, caps, rust and
  drop days, every line, `practise`, `fadeSkills` (each midnight and after a
  quiet skip), `toolsChange` (the hook, unused), and the lesson rules.
  `src/sim/actions/teach.ts` holds `teach` and the lesson's agree/refuse.
- **Effects in S1:**
  - fishing's empty-line odds at every level (30/25/20/15/10%, halved at the
    tides);
  - the evening tide (17:00–19:00) for everyone;
  - Handy farming +1 a bed;
  - +2 for any bed harvested on its ready day (the bed's new `readyDay`: the
    later of its second watering and two days after planting);
  - Handy cooking a fifth quicker;
  - the Expert lines (tides from 30 minutes before, crowds 45 minutes before
    the kopitiam's busy hours, a bed at its best).
- **Not yet (S2):** the Skilled and Master abilities and items, and a Master
  cook's extra serving and price. Until S2, Skilled's lines speak only of the
  craft: "You're a good hand with a line.", "Your lines come up empty less
  often now."
- **Who sees what:**
  - the teacher sees their pending offer ("You've offered to show Siti how
    to fish.");
  - lines say "how to fish", never "how he fishes", so no pronouns;
  - helping water a neighbour's beds counts as farming for the helper.
- `teach` is offered to anyone with a mastered skill and someone nearby, as
  "show someone nearby how to do what you do best (person, and item: what)".
  `agree`/`refuse` take a lesson like any offer; words with show, teach,
  learn or lesson choose it.
- **Starting levels** come from `skills` in `src/seed/cast.ts` (a new town)
  and a frozen table in the v12 → v13 step (the living town).
- **Watchers:** the wiki's People show each skill's level name, % to the
  next, and rust. The trial prints a `--- skills ---` block.
- **The fake brain:**
  - a Master at the work offers once a day to someone beside them, and stays
    (fishing alongside) while it's on;
  - a learner, on shift or not, agrees;
  - an Expert cook keeps twice as much ready ahead of a crowd.

## Answers (2026-10-25)

1. **Two PRs: yes** (Claude's call, owner informed). S1, the core, comes after
   the families PR; S2, the abilities and new items, after it.
2. **The new things: yes, as S2 abilities** (Claude's call, owner informed):
   chilli, red snapper, papaya and sambal kangkong, kept grounded in a 1960s
   Singapore kampung.
3. **No back-credit: yes** (Claude's call, owner informed). Starting levels come
   from the residents' stories instead.
4. **Teaching only up to Expert: yes (owner decision).** The last step to
   Master always comes from your own practice, so mastery takes at least a
   game year.
5. **Mak Esah starts as a Master cook (owner decision)**, so she can teach.
   Ah Huat stays a Master too.
