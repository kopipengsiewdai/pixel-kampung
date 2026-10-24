# Contributing

Thanks for wanting to help build the kampung.

## Before you start

- The project is early and the design is still moving. For anything bigger
  than a small fix, open an issue or a Discussion first so we can agree on it.
- Combat and killing are out of scope for now.

## Setup

1. Fork and clone.
2. Install [gitleaks](https://github.com/gitleaks/gitleaks#installing).
3. Enable the repo's hooks once per clone:

   ```bash
   git config core.hooksPath .githooks
   ```

   The pre-commit hook blocks commits that contain secrets.

## Ground rules

- **No runtime data in the repo.** World state, saves, economy databases,
  agent memories, logs and `.env` files live outside the repo
  (default `~/.kampung/`, see `.env.example`). Only a small seed/demo world
  belongs here.
- **No secrets, ever.** API keys go in `~/.kampung/.env`. CI scans every push.
- **Assets need a licence.** Original art is CC BY-NC-SA 4.0; third-party
  assets must carry a compatible licence and a `CREDITS` file.
- Keep pull requests small and focused, with tests where it makes sense.
- AI agent prompts are part of the code: changes to them get reviewed like code.

## Pull requests

- Branch from `main`, open a PR, fill in the template.
- CI must pass. A maintainer reviews and merges.

By contributing you agree your code is licensed under AGPL-3.0 and your
original art under CC BY-NC-SA 4.0. Please follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
