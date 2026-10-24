# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems. Use GitHub's
private reporting instead: **Security** tab → **Report a vulnerability**.

Useful things to include: what's affected, how to reproduce it, and what an
attacker could do with it.

## Scope

In scope: the game server, client, agent framework, and anything that could
leak API keys, world data or (later) player data, or let someone run up the
AI-model bill.

Prompt-injection that makes an AI resident break the game's rules is welcome
as an **AI behaviour report** issue unless it exposes secrets or data — then
report it privately as above.

## Supported versions

Only the latest `main` is supported while the project is pre-release.
