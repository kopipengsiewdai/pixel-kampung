# Changelog

Newest first. One line per change, in plain English. Each release says how a
town that is already living picks it up ("Living town"), because the town is
never reset (see [docs/design/upgrades.md](docs/design/upgrades.md)).

## Unreleased

- **The 4x clock:** the kampung keeps its own time, four game minutes to a real minute, so a game day is six real hours. Night, the morning lorry, shifts, crops and the days residents plan around all run in game time, and walking is four times faster to watch.
- **The kampung calendar:** the town has its own dates (12 months, 365 days, a leap day every fourth year from Year 4), beginning on Monday, 1 January, Year 0, and residents know today's date. The watch page shows the same date.
- **Thinking stays within the real budget:** each resident still has US$0.0139 of thinking per real hour and the town US$3.33 per real day, so residents think about half as often per game hour (every 10 game minutes when nothing happens, 2 minutes after doing something).
- **Living town:** at upgrade (save v3) the clock is anchored where the town stands, so nothing jumps: the date becomes Monday, 1 January, Year 0: the time of day carries on, and the weekday jumps once to Monday. From then on every weekday rule goes by the kampung's week. Time missed while the town was stopped for the upgrade passes quietly, four times as fast as before.

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
