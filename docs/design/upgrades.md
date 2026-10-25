# Upgrades: one living town, forever

## The rule (owner decision, 2026-10-25)

**There is one world, and it is never reset** unless the owner says so. Every
release upgrades the living town in place: residents carry on with their
money, jobs, friends and memories, and find whatever is new in the world, the
way they find everything else (see the in-world knowledge rule in
[principles.md](principles.md)). Nobody tells them.

So:

1. **Every change to saved state ships with an upgrade step and a fixture.**
   Saved state is everything in the save file: the world (`WorldState`), the
   brains' saved state, and the other tables (events, ledger, memories).
2. **Resets only with the owner's yes.** Wiping the town, starting a new one in
   its place, or going back to an older backup are all resets.
3. **Steps are append-only.** A step that has shipped is never edited or
   removed: some town may still be waiting to run it. A mistake is fixed by a
   new step.

## What happens when the town starts

The save file is `$KAMPUNG_HOME/kampung.db` (`sim.db` for `npm run sim --
--save`). Its `meta` table holds the save version (`schema`), and so does the
saved world (`version`). When the save is opened, its version is first read
over a read-only connection, which never writes the save itself. SQLite may
still create its empty `-wal`/`-shm` side files next to it, as it does on
Windows. If the file can't be opened read-only, the town refuses to start
with a plain message rather than risk a write. Then:

- **Same version as the code:** it loads as it is.
- **Older:** the code first copies the whole file beside it as
  `kampung.db.bak-v<old version>`. If that name is taken it uses `.2`, `.3`,
  …, and it never overwrites a backup. The copy is flushed to disk and checked
  before anything else happens. If an earlier try's upgrade failed, its
  backup of this very save is reused rather than copied again. To count as
  this very save, the backup must be a whole, checked copy with the same
  versions, the same saved world and brains word for word, and the same row
  count and newest row in every other table. So a town restarted after every
  failure keeps one backup, not a pile of them, while a save that changed in
  the meantime, even within the same minute, gets a fresh one. Then it runs
  every step from the save's
  version up to the code's, **in one transaction**, writes the upgraded save
  and starts. If a step fails, nothing is changed: the save stays at its old
  version, the backup is there, and the command stops with the error. The
  console shows each step's one-line reason. Today's tables are only created
  after the steps, so each step sees the file as it was at its version.
- **Newer** (the code was rolled back): it **refuses to start**, prints a plain
  message, and writes nothing. Run the newer code again. Going back to the
  backup instead is a reset, and the owner decides that.

Releases before 0.9.0 don't check the version at all, so never run code older
than 0.9.0 on the living town. If one does save into an upgraded file anyway,
the saved world goes back to its old version while the tables stay upgraded.
The next start notices and upgrades just the world.

Memories live in the same file as the world (`npm start -- --minds`), so one
version and one backup cover both. Trial files under `trials/` are throwaway
and aren't upgraded.

## How to write a step

When a change touches anything saved:

1. **Add a step** at the end of `UPGRADES` in
   [`src/store/upgrades.ts`](../../src/store/upgrades.ts). `SCHEMA_VERSION`
   is the number of steps plus one, so adding the step bumps it.
   - `from`: the version it upgrades (the previous `SCHEMA_VERSION`).
   - `why`: one line on what changes for a town already living. It's printed
     when the step runs.
   - `save`: a pure function from the old save (`{ world, brains }`, as plain
     JSON) to the new one. Don't change the input. The runner stamps the new
     version, so you don't have to.
   - `tables`: optional, for changes to the file's other tables (`events`,
     `ledger`, `memories`). It gets the open database inside the same
     transaction. A step that adds a table creates it itself, as it is at
     that version. The `memories` table only exists in a thinking town's
     save, so check for it before altering it.
2. **Keep the step frozen.** It describes the save as it was at `from`, so it
   doesn't import live game code (which will change) and it carries the data
   it needs inside it. Example: v1 → v2 holds its own copy of the cast's ties.
3. **Make it idempotent and gentle.** Merge, don't overwrite or duplicate.
   Keep whatever the town has already lived through. A new field gets the
   value a fresh town would have, unless that would erase history.
4. **Write the test first**, against the older fixture: what a town saved
   before your change should look like after the step.
5. **Freeze the fixtures**: `npm run save-fixture`. It writes three files, and
   won't overwrite any that exist. Commit them all.
   - `test/fixtures/saves/v<N>.sql`: a tiny, fake, seeded town saved by the
     new code, as SQL text (never a `.db`).
   - `v<N>.shape.txt`: the shape of everything a save holds. That's the
     world (`WorldState`), what the fake brain and the mind save, and the
     tables of a fresh save file.
   - `v<N-1>.upgraded.sql`: the previous fixture after your step alone, so
     reviewers can see exactly what the step does.
6. **Add a CHANGELOG line** saying how the living town picks the change up.

## The guard

`test/upgrades.test.ts` fails if someone forgets. It fails when:

- What a save holds differs from the current version's frozen shape. That
  covers `WorldState`, the brains' saved types, and the tables. Any such
  change needs a new step.
- A shipped step no longer turns its fixture into its frozen
  `.upgraded.sql`, because someone edited it.
- A version has no fixtures, or the steps don't run 1 → 2 → … → current.
- Any fixture, upgraded to the current version, is missing a field a fresh
  town has, or can't be resumed and run for half a game hour.

Each fixture, upgraded to the current version, must also:

- fit today's saved types at every depth, brains included: no missing field,
  no field today's code dropped, no value of the wrong kind. The type
  checker reads the types, so maps like items or talk are checked by their
  key and value types, not by which keys a town happens to have;
- have the same tables, column for column, as a fresh save. That catches a
  step that forgets an `ALTER TABLE`, since today's `CREATE TABLE IF NOT
  EXISTS` would otherwise leave the old-shaped table quietly in place.

It also checks the backup (one per save, however many failed tries), the
refusal of a newer save (even one left mid-write), the rollback of a failed
step, and that an upgraded save isn't upgraded a second time.

CI's `frozen-save-fixtures` job fails a pull request that changes or
removes any fixture already on `main`. So the guard can't be satisfied by
regenerating an old version's fixtures.

The guard can't see a change in what a saved value *means* (the same field
used differently). That still needs a step, and the reviewer checks for it.

## Steps so far

| Step | Why |
|---|---|
| v1 → v2 | Family and old friends know each other, as the cast was written (#13 seeded the ties only in new towns). They're merged into `knownPeople` alongside anyone already met. |
| v2 → v3 | The 4x clock and the kampung calendar. The clock is anchored where the town stands (`anchorT = t`, `anchorMs = t × 60 000`, since a v2 town's minutes were real minutes), so nothing jumps. Today becomes Monday, 1 January, Year 0: the time of day carries on, and the weekday jumps once to Monday (the free fake brain's "done today" weekday labels follow it). |
| v3 → v4 | Residents remember what they last did (`lastDone`, starting empty), so doing the same thing again straight away doesn't keep them from answering anyone. |
| v4 → v5 | A game day every five real hours instead of six. The clock is re-anchored where the town stands: `anchorT = t`, `anchorMs` = the real moment t was reached at the old pace (15 real seconds a game minute, frozen in the step), so nothing jumps; from then on 12.5 real seconds a game minute. Nothing else changes. |
