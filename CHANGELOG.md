# Changelog

Newest first. One line per change, in plain English. Each release says how a
town that is already living picks it up ("Living town"), because the town is
never reset (see [docs/design/upgrades.md](docs/design/upgrades.md)).

## Unreleased

- **Answers:** a resident someone spoke to first is told, in plain words, that the other person is waiting for their answer, until they answer, the other leaves, or the chat has run long.
- **No loops:** doing the very same thing again within a few minutes still goes through, but doesn't bring the next thought straight on, and the resident hears "You've just done that."
- **Living town:** at upgrade (save v3) every resident starts with nothing remembered as last done; the waiting line needs no upgrade, since it comes from what they've already heard.

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
