# Project Agent (Dedicated Clawdbot)

This folder is for the **project-local Clawdbot instance** used by Liturgy Turner.

Goal: keep the "project agent" separate from any personal assistant instance.

## How it works

Clawdbot normally stores state + config under `~/.clawdbot/`.
For this project we override that using env vars so the agent is **self-contained**:

- `CLAWDBOT_STATE_DIR=./agent/.clawdbot-state`
- `CLAWDBOT_CONFIG_PATH=./agent/clawdbot.json5`

Nothing in `agent/.clawdbot-state/` should be committed to git.

## Quick start (WSL/Ubuntu)

1) Copy the example config:

```bash
cp agent/clawdbot.json5.example agent/clawdbot.json5
```

2) Start the project gateway:

```bash
bash agent/run-gateway.sh
```

> Note: this uses your system-installed `clawdbot` binary.
> If you want a pinned version, add it to this repo as a devDependency and replace
> `clawdbot` with `npx clawdbot`.

## Next steps (now)

- Project skill: `liturgy-controller`
  - Calls the app's local control API to set/next/prev page.
  - Located at `agent/skills/liturgy-controller/`.
  - Enabled in `agent/clawdbot.json5` via `skills.load.extraDirs`.

## Next steps (planned)

- Add a small HTTP bridge (`server/routes/agent.ts`) so the project agent can:
  - record training/evaluation summaries
  - schedule evaluation jobs
  - maintain dictionary/fingerprint updates

For now, the project is fully functional without the agent; it will become the
"automation + learning maintenance" daemon.
