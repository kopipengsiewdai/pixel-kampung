# M3 build notes: calls made while building the watch page

Status: **Claude's calls, for the owner to review.** These fill in details
under [v1-spec](v1-spec.md) §6 and §8 item 3. None of this goes into any
resident's prompt; the page only reads the town.

## The page

- **Where:** `http://127.0.0.1:8160/`, from `npm start` (beside the live town)
  or `npm run watch` (fake town or replay). It binds to `127.0.0.1` only, so
  nothing off the PC can reach it, and it refuses requests addressed to any
  other host name. `--port` moves it.
- **Read-only.** The town never hears from the page. Replay controls only
  move the replay's own clock.
- **No outside calls.** Phaser and the art are served by the same process, and
  the page's content policy lets it load and fetch from that server only.
- **Built at start.** The client is bundled in memory by esbuild when the
  server starts (about a second), so the page always matches the code and
  there's no build step to forget.
- **Light on the PC.** Phaser's Canvas renderer (no GPU) capped at 30 frames a
  second; the ground is painted once. The server sits around 125 MB in real
  time and stayed near 175 MB through four game days at 3000×.
- **If the page fails** (port busy, say), `npm start` says so and the town
  keeps running.

## What it shows

- **Map:** the 40×30 tile kampung with the five places, ten houses, paths,
  well, notice board, lorry stop, farm beds (planted and ready kangkong; wet
  soil once watered that day), the beach, sea and jetty. The lorry drives in
  at 07:00 and out at 07:30.
- **Residents** walk through the tiles the sim stepped them through, spread
  over the real time those minutes take, so they keep to the footpaths.
  Sleepers at home are inside (a "z" over the roof); someone who dozed off
  outside lies down where they are. Names stack when people share a tile.
- **Day and night** tint follows the Singapore clock: night from about 20:30
  to 05:00, warm at dawn and dusk. Windows glow at night when someone's home
  and awake; shop lamps glow while someone minds the shop.
- **Feed:** the existing story-feed sentences, newest first, notable ones
  highlighted.
- **Card** (click a resident or their name): doing, where, money, job, hunger
  and energy, what they carry; for owners, their shop's stock and prices;
  wages owed either way; today's plan, the last few thoughts and evening
  reflections, and what they noticed lately. Fake-brain residents have no
  thoughts, and the card says so. The card is marked as the owner's view.
- **Place card** (click a place on the map; 2026-10-25): who's there now,
  and what's inside. A shop shows its owner, who's serving (the owner if
  minding it, else a worker on shift), its workers, stock and both price
  lists. The notice board shows every note, newest first, with who wrote it
  and when. The farm plot shows each bed: whose kangkong, ready or how far
  along. The jetty shows who's fishing. The lorry stop shows when the lorry
  comes next and its buying and selling prices. A house shows whose it is.
  Clicks on a person still open their card; the picked place is outlined.
  Same owner's-view rule: nothing on it reaches a resident. Replays of
  trials recorded before place cards show what their frames have.

## Speeds and replay

- `--speed` is **game minutes per real minute**: 4 is the live town's pace
  on the 4x clock (1 was real time before 2026-10-25), and 60 is a game hour
  a minute. Replays offer 1×, 10×, 60×, 300× and 1440× on the page.
- **`npm run watch -- --fake`** starts a fresh town from Monday 06:00 with
  every resident on the free fake *model* (not the bare fake brain), so the
  cards show plans and thoughts. Nothing is saved and nothing costs money.
- **Trials record themselves.** `npm run trial` now writes a frame a minute
  (gzipped JSON) and every event into the trial's own `.db`, next to its
  memories. About 1 MB per 10 game hours for ten residents.
- **Older trials** (before this milestone) kept memories only: no positions.
  They replay as a thoughts-only story (plans, thoughts and reflections in
  the feed and on the cards) with everyone drawn at home, and the page says
  so. The US$1 trial running when M3 was built is one of these.
- A replay of a trial that is still running follows it as it grows.
- The page's trial picker lists `.db` files in `KAMPUNG_HOME/trials/` and
  opens them by name only.

## Art

- **Our own** (drawn in code by `scripts/art/build_art.py`, CC BY-NC-SA 4.0):
  attap houses on stilts in three styles, the kopitiam shophouse with its
  KOPI signboard, the zinc-roofed provision shop, the striped wet-market
  stall, the well, the notice board, a green 1960s goods lorry and its stop
  sign, coconut palms, a banana plant, the sampan, sea, shore, sand, jetty,
  laterite, farm beds, kangkong at three stages, a window glow and the "z".
- **CC0** (Pixel-boy's *Ninja Adventure* pack): the ten residents' walk cycles
  (two with hair recoloured darker), grass, dry field, footpath, floor paving,
  trees, a bush, ferns, flowers, crates, barrels, a pot, sacks, kopitiam tables
  and stools.
- All of it is about 80 KB. Each folder has a `CREDITS`.
- **Gaps for later art:** residents are drawn from a fantasy pack, so a few
  look more storybook than 1960s; our own resident sprites (and the M4 cast)
  can replace them one by one.
