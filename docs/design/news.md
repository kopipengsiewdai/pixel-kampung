# Kampung News: the owner's daily paper

Agreed with the owner on 2026-10-28/29 (questions Q1–Q4). Kampung News is a
page on the watch site for the owner only. Residents never see it, and nothing
from it ever goes into their prompts (docs/design/principles.md: in-world
knowledge only). Where the owner didn't decide a detail, Claude drafted it;
those drafts are marked *drafted*.

## What it is (Q1)

- **A daily paper, written by AI.** Each issue has a lead story and a handful
  of shorter reports on what really happened in the kampung: deals and
  quarrels, weddings, evictions, rent changes, who went hungry or fell ill,
  the lorry, the school, Mr Lim's notices.
- **Facts only.** *Drafted:* the writer is given a digest built from the saved
  events, the ledger and the day's notable talk, and may report only what is
  in it. It never invents events, quotes, prices or people. Quotes are
  residents' real words, translated into English (with the watch page's
  translator).
- **Cheap.** *Drafted:* one Haiku call per issue, logged in the cost log and
  counted inside the monthly cap (`dayCap`). If the day's cap is spent, the
  issue waits and is written later; it is never skipped.

## Voice (Q2)

- **A 1960s English-language broadsheet:** headlines, a dateline in the
  kampung calendar ("Kampung, Tuesday 3 January, Year 0"), and short, plain
  reports.
- *Drafted:* it is "Kampung News", its own invented paper, never styled or
  named after a real newspaper.

## Behind the scenes (Q3)

Each issue ends with a box for the owner, with plain figures computed from the
save (no AI, no cost), flagging anything stuck. *Drafted:* per kampung day in
the issue:

- meals per resident, and anyone who ate fewer than 2;
- residents at hunger 1000, who fell ill and who got well;
- the actions that failed most often, with the same refusal repeated (top 5);
- talk circles;
- residents with no money, the village fund, and money in and out across the
  edge of town;
- the AI spend against the monthly cap, and the last ledger check.

A figure gets a warning mark when it crosses a line: *drafted*, fewer than 2
meals, hunger 1000, the same refusal 10 or more times in a day, more than 30
circles, or spend above the day's cap.

## How often (Q4)

- **Once per real day.** *Drafted:* each morning at about 07:00 SGT, covering
  every kampung day since the last issue (about five). The lead story is the
  biggest event of the stretch, and the box shows each kampung day on its own
  row.
- If the town was down, the next issue covers the gap and says so.
- *Drafted:* back issues are kept and listed newest first on the News page.

## Where it lives

- *Drafted:* a "News" tab on the watch page, at the same address as the rest.
- Issues are runtime output, so they are kept under `KAMPUNG_HOME`, never in
  the repo. If they go into the save, that change ships with an upgrade step
  and a frozen fixture (docs/design/upgrades.md).

## As built (0.41.0)

- `src/news/newsroom.ts` writes an issue from about 07:00 SGT once a real
  day, covering every whole kampung day since the last issue (the first
  looks back five). One routine (Haiku) call, `kind: news`, in the cost log
  as `kampung-news` and checked against the day's cap first; a failed or
  capped issue is tried again ten minutes later, never skipped. At most three
  paid tries a real day (a refused or unusable answer counts); then it waits
  for the next morning. One issue covers at most seven kampung days: after a
  longer stretch with none, the latest week, saying how many it leaves out.
- "The town was down" means a quiet spell (the town stopped and came back),
  not the cap's quiet; a spell that ended today still marks the days it
  covered. The box's spend shows each real day since the last issue came out,
  and the month so far against the monthly cap.
- The writer sees only a digest: who's who (family from the cast, who is
  married), each day's key moments from the saved events (the same line
  repeated is folded into one, with how often), up to eight lines of notable
  talk a day (picked by words in English or Malay) put into English with the
  watch page's translator (every quote sent; one it can't do is left out), meals,
  hunger, illness, and money across the edge of town. A report quoting words
  that aren't in the digest (in "…", “…” or ‘…’, curly apostrophes matched) is
  dropped; a lead or headline that does goes whole, and the first report on
  record takes its place.
- The box (`src/news/box.ts`) is computed per kampung day. Hunger at 1000,
  residents with no money and the village fund are read at each midnight
  into `$KAMPUNG_HOME/news/days.jsonl`; days before the paper began show
  them as unknown. Refusals are counted by their wording (residents' replies
  keep no ok flag), so the page labels them an estimate.
- Issues are `$KAMPUNG_HOME/news/issues/<n>.json`. The watch page's **News**
  button opens them, newest first. Only a thinking town (`--minds`) writes
  the paper. Nothing is saved in the town's save, so there's no upgrade step.

## Not yet

- Residents reading a paper, or a notice board press. That would be an
  in-world feature of its own, agreed separately.
- Pushing issues to the owner's phone.
