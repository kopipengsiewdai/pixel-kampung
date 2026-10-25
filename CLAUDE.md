# Pixel Kampung — project rules

AI-first browser life-sim (pixel art, no combat). AI residents play within the
game's rules: jobs, quests, businesses, then hand out quests themselves.
Design is agreed with the owner directly in the project session, one question
at a time; decisions go in `docs/design/`. **Don't build gameplay ahead of an
agreed spec.** Send ARC0 a one-line status when a decision lands or a
milestone ships.

## HARD RULE: public repo / private runtime split

This repo is **public**. Everything else is private and lives **outside the
repo and outside OneDrive**, under `~/.kampung/` (`%USERPROFILE%\.kampung\`
on Windows; override with `KAMPUNG_HOME`):

| Public (this repo) | Private (`~/.kampung/`, never committed) |
|---|---|
| engine, sim rules, client | live world state, saves |
| agent framework + prompts | economy DB, any `*.db` |
| owned / compatibly-licensed art & audio | agent memories, transcripts, logs |
| docs, tests, CI, small seed/demo world | `.env`, API keys, tokens |
| | player / account data (later) |

- Code reads runtime paths from `KAMPUNG_HOME`; never hard-code a path under
  the repo for runtime output.
- The gitleaks pre-commit hook (`core.hooksPath=.githooks`) and CI scan must
  stay on. Never bypass with `--no-verify`.

## HARD RULE: in-world knowledge only (AI residents)

Full text: `docs/design/principles.md`. Residents know nothing about the game's
architecture, features or code; they can only do what's implemented, and they
discover new features in-world. We never tell them about changes. So:

- Agent context = in-world perception (sees, hears, holds, remembers) plus the
  actions available right now. No API docs, feature lists or system
  descriptions in prompts.
- Never leak internals in prompts, tool/action names or error messages
  ("you can't do that here", never "feature not implemented").

## HARD RULE: one world forever

Owner, 2026-10-25: the live town is never reset without his yes. Every change
to saved state (world, brains, memories, tables) ships with an upgrade step in
`src/store/upgrades.ts` and a frozen fixture save (`docs/design/upgrades.md`),
so the living town upgrades in place and residents discover changes in-world.
Releases get a version, a git tag and a `CHANGELOG.md` line saying how the
living town picks the change up.

## HARD RULE: pseudonymity

Commits and every public surface use **kopipengsiewdai** /
`64517180+kopipengsiewdai@users.noreply.github.com` (set in this repo's local
git config — the machine's global config is the owner's real identity, so
check `git config user.email` before committing in any new clone/worktree).
Never put the owner's real name, email, location, family, tenant or work
details in code, commits, issues, PRs or docs.

## Merge authority

Owner, 2026-10-24, in the project session: "Yes, you can merge your own PRs
once CI is green." Claude merges its own PRs once all required checks pass,
after a fresh-context review of anything that matters. `main` still needs a
PR and green CI (never push to it directly). The owner can revoke this at any
time. Paid API spend beyond an agreed cap, and anything public beyond this
repo, still needs his yes.

## Working rules

- No scratch files or logs in the repo root or Desktop: use the session
  scratchpad or the gitignored `.scratch/`.
- No filesystem-wide scans (`find /`, recursive searches of `C:\`).
- Subagents always get an explicit `model`: sonnet by default, opus for
  design/review, never fable.
- Heavy work (big builds, long sims, batch agent runs) goes to cloud sessions,
  not this shared PC.
- AI-player cost per agent-hour is a design constraint: cheap models for
  routine actions, bigger models only for big decisions.
- Licences: code AGPL-3.0, original art CC BY-NC-SA 4.0.
