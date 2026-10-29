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

## Not yet

- Residents reading a paper, or a notice board press. That would be an
  in-world feature of its own, agreed separately.
- Pushing issues to the owner's phone.
