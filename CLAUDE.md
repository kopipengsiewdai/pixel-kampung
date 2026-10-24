# Pixel Kampung — project rules

AI-first browser life-sim (pixel art, no combat). AI residents play within the
game's rules: jobs, quests, businesses, then hand out quests themselves.
Design is being agreed with the owner via ARC0; **don't build gameplay ahead
of an agreed spec.** Report to ARC0.

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

## HARD RULE: pseudonymity

Commits and every public surface use **kopipengsiewdai** /
`64517180+kopipengsiewdai@users.noreply.github.com` (set in this repo's local
git config — the machine's global config is the owner's real identity, so
check `git config user.email` before committing in any new clone/worktree).
Never put the owner's real name, email, location, family, tenant or work
details in code, commits, issues, PRs or docs.

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
