# M3 watch page: implementation plan

Builds milestone 3 ([v1-spec](../design/v1-spec.md) §6, §8 item 3): a
read-only page on localhost that shows the pixel kampung, the story feed and
resident cards, live or replayed from a trial. $0 of AI: everything is built
and tested against the fake brain and the fake model. Server pieces are
test-first.

## Shape

The sim stays as it is. A small hook in `Town` (`onTick`, called after every
saved minute) lets the view take a **frame**: a compact, owner-facing picture
of the town at one minute (where everyone is and the tiles they stepped
through, what they're doing, money, needs, job, carrying, shops, wages owed,
farm beds, the lorry). Nothing in a frame or a card ever goes into a
resident's prompt; the view only reads.

```
Town ──onTick──▶ FrameBuilder ──▶ LiveSource ──┐
                                               ├─▶ watch server (127.0.0.1) ──SSE──▶ page (Phaser + feed + card)
trial DB ──▶ ReplayReader ──▶ ReplaySource ────┘
                    ▲
trial.ts ──onTick──▶ ReplayRecorder (frames + events into the trial's DB)
```

- **Frames and cards** (`src/watch/view.ts`): `layoutOf(world)` (tiles,
  places, whose house is whose), `FrameBuilder.build(world)` (routes come from
  diffing each walker's remaining path), `cardOf(frame, id, extras)`.
- **Light** (`src/watch/light.ts`): day/night tint from the minute of the
  day, shared with the client.
- **Recorder / reader** (`src/watch/replay.ts`): frames (gzipped JSON, one a
  minute), events and meta go into the trial's own SQLite file next to its
  memories. The reader opens it read-only. A trial recorded before M3 has
  memories only: it replays as a thoughts-only story with everyone at home,
  and the page says so.
- **Player** (`src/watch/player.ts`): a playback clock with speed, pause and
  seek over a recorded range; skipped minutes' routes are joined so walkers
  still follow the paths.
- **Server** (`src/watch/server.ts`): Node `http`, bound to `127.0.0.1` only,
  Host header checked (no DNS rebinding), strict CSP (`'self'` only, so the
  page can make no outside calls). `GET /`, `/app.js`, `/assets/*`,
  `/api/layout`, `/api/stream` (Server-Sent Events: hello, then coalesced
  updates), `/api/resident/:id`, `/api/health` (RSS), and in replay mode
  `GET/POST /api/replay` and `POST /api/replay/open` (trial files under
  `KAMPUNG_HOME/trials/` only).
- **Client** (`src/watch/client/`): Phaser 3 on the Canvas renderer (no GPU
  needed), bundled by esbuild in memory when the server starts. Ground drawn
  once into a render texture; buildings and props as images; residents tween
  along their routes over the real time a game minute takes; a tint overlay
  for day and night. Feed panel, roster, resident card, replay controls.
- **CLIs:** `npm start` (and `--minds`) serves the page beside the live town.
  `npm run watch -- --fake --speed 60` runs a fresh fake-model town on a fast
  clock (thoughts included, $0). `npm run watch -- --replay [file]` plays a
  trial back. `npm run trial` now records frames into its DB.

## Art

- **Our own** kampung pieces, drawn as pixel maps in
  `scripts/art/draw-kampung.py` and rendered to PNG: attap stilt houses, the
  kopitiam and provision shop fronts, the wet-market stall, notice board,
  lorry, coconut palms, sampan, farm beds and kangkong. Licence: CC BY-NC-SA
  4.0 (`LICENSE-ART.md`), credited in their `CREDITS`.
- **CC0** (Pixel-boy's Superpowers *Ninja Adventure* pack): characters,
  ground tiles and small props, cropped into one atlas and lightly
  recoloured. Credited in their `CREDITS`.

## Steps

1. Light curve + layout + frame builder (routes) + cards. Tests.
2. Recorder + reader (+ memories-only trials). Tests.
3. Player (speed, pause, seek, joined routes). Tests.
4. Update merging, live source, replay source. Tests.
5. Server: routes, SSE, Host check, CSP, traversal, replay controls. Tests.
6. Art script and atlases; `CREDITS`.
7. Client: map, residents, tint, feed, roster, card, replay controls.
8. CLIs and `Town.onTick`; trial recording.
9. Headless page check with Playwright (`npm run test:page`, also in CI):
   the page loads, draws a frame, opens a card, and requests nothing off the
   local server; the server's RSS stays under 500 MB.
10. README "Watching the town".
