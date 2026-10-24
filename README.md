# Pixel Kampung

**An early, AI-first pixel world where the residents actually play.**

Pixel Kampung is a browser life-sim with pixel characters, in the spirit of
MapleStory and RuneScape — but with no fighting or killing. It's a second life
with a real economy: residents take jobs, do quests and errands, earn coins,
start businesses, and eventually become the ones handing out quests.

The twist: **the residents are AI players**, not scripted NPCs. They play
within the same rules a human would. AI players come first; humans join later
and step into a town that has been living, trading and telling its own stories
without them — an experience that can't be repeated, because the world never
runs the same way twice.

## Status

Very early. The simulation core (milestone 1) and the residents' minds
(milestone 2, tested on a free fake model) are in, and there's a local watch
page (milestone 3). The approved design is in
[docs/design/](docs/design/). Watch the repo or join
[Discussions](../../discussions) to follow along.

## Running the sim core

Needs Node.js 22.18 or newer.

```bash
npm ci
npm run sim -- --days 3            # 3 game days on seed 42, printing the story feed
npm run sim -- --days 3 --notable  # only the highlights
npm test                           # Vitest
npm run typecheck
npm start                          # the live town, in real time (Singapore time)
```

Real thinking (milestone 2) needs an Anthropic API key in
`~/.kampung/.env` as `ANTHROPIC_API_KEY=...`. Never put it in the repo.

```bash
npm run trial -- --fake                         # a free dry run of the residents' minds
npm run trial -- --minds 3 --hours 4 --budget 1  # a paid trial, capped (US$10 for all trials)
npm start -- --minds                            # the live town, thinking for real, within budget
```

`npm run sim` writes nothing unless you pass `--save`. `npm start` keeps the
live town in `~/.kampung/kampung.db` (set `KAMPUNG_HOME` to move it) and
resumes from there after a restart. Runtime data never goes in this repo.

**Out of scope for now:** combat, killing, PvP. The world is about work, trade,
community and stories.

## Watching the town

A read-only page shows the pixel kampung, the story feed and a card for
whichever resident you click (money, job, needs, what they carry, what they're
doing, and their latest plan and thoughts). It's served on **this PC only**
(`127.0.0.1`) and makes no outside calls. Open the URL each command prints,
by default **http://127.0.0.1:8160/**, in any browser on the same PC.

```bash
npm start                                   # the live town in real time, with its page
npm start -- --minds                        # the same, thinking for real (within budget)
npm run watch -- --fake --speed 60          # a fresh fake town, 60× fast (a game hour a minute), $0
npm run trial -- --fake                     # make a free fake trial to replay
npm run watch -- --replay                   # play back the newest trial in ~/.kampung/trials/
npm run watch -- --replay trial-2026-10-24T09-00-00-000Z.db --speed 300   # a chosen trial, 300×
```

Add `--port 8161` to any of them if 8160 is busy. In a replay, the page has
play/pause, speed (1× to 1440×), a seek bar and, when there's more than one, a
trial picker. `--speed` is game minutes per real minute. Trials recorded
before the watch page existed keep only memories: they replay as thoughts
only, with everyone shown at home. The `--fake` town and its cards use the
free fake model, so nothing costs money. What the page shows is for you:
none of it ever reaches a resident.

To check the page in a headless browser: `npx playwright install chromium`
once, then `npm run test:page`.

Art: our own kampung pieces (houses, shops, stall, lorry, palms, sea, farm)
in [assets/art/kampung](assets/art/kampung/CREDITS), plus characters, grass
and props from Pixel-boy's CC0 *Ninja Adventure* pack in
[assets/art/ninja-adventure](assets/art/ninja-adventure/CREDITS).

## Ideas we're learning from

- Stanford's *Generative Agents* (Smallville)
- a16z's *AI Town*
- Altera's *Project Sid*

We borrow ideas, not code, unless a licence explicitly allows it.

## Reporting issues and ideas

Open an [issue](../../issues/new/choose) and pick a form:

- **Bug** — something is broken.
- **Enhancement** — an idea for the game or the tooling.
- **AI behaviour report** — a resident did something odd, broken, funny or
  wonderful. These are gold; tell us what happened and when.

Looking to help? Try issues labelled
[`good first issue`](../../issues?q=is%3Aopen+label%3A%22good+first+issue%22).
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

- Code: [GNU AGPL-3.0](LICENSE). If you run a modified version as a public
  server, you must share your changes.
- Original art and audio: [CC BY-NC-SA 4.0](LICENSE-ART.md).
