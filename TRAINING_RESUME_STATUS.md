# TRAINING_RESUME_STATUS

## Current real state (Mac mini audit)

- **Training is not currently running.** Process check shows no active `train-*`, `iterative-training`, `train-complete-system`, or similar training job.
- The repo **does contain prior training artifacts and reports** under `training-data/` and `agent/`, including:
  - `training-data/live-tracker-data.json`
  - `training-data/fingerprints.json`
  - `agent/final-training-report.json`
  - `agent/training-report.json`
- Those files prove **training work happened in the past**, but they do **not** prove an active training loop is running now.
- `openclaw status` shows the OpenClaw gateway is running locally, but it is **pairing-blocked/unreachable** from the local status check, and this does **not** indicate liturgy training is active.
- Root `package.json` has **no nightly training npm script**. It has app/runtime scripts (`dev`, `start`, `local:up`, `agent:start`) but nothing like `train`, `train:nightly`, or `training:resume`.

## Blockers

1. **No active training runner** is currently running on this Mac mini.
2. **No obvious scheduled nightly training job** is wired up in root npm scripts.
3. Several training scripts appear to be **historical or environment-specific** and use hard-coded container-style paths such as `/app/...`, so they are **not obviously safe to run directly on this Mac mini without validation**.
4. Historical docs/report files make strong accuracy claims, but they are **not enough to assume current readiness** without a fresh validation run.

## Next executable step

**Run a non-destructive validation pass first, not training.**

Recommended next step:

```bash
bash verify-release-gate.sh
```

Why this is the right next step:
- It is a verification script already in the repo.
- It is safer than launching one of the older training scripts blindly.
- It should confirm whether the current app/API/live-path still matches the previously generated training artifacts.

If that passes, the next step after validation is to inspect which historical training pipeline is still valid in this environment before resuming any training.

## Obvious safe nightly training command already in repo?

**No clearly safe nightly training command was found.**

What exists:
- `train-liturgy.mjs`
- `train-comprehensive.mjs`
- `agent/iterative-training.mjs`
- `agent/train-complete-system.mjs`
- `agent/final-complete-training.mjs`

Why I am **not** marking any of those as an obvious safe nightly command:
- root npm scripts do not expose them as a maintained workflow
- some scripts require specific files like `liturgy.pdf`, `full_service.wav`, or agent-only assets
- some use hard-coded `/app/...` paths that look container-specific
- I did not find a current scheduled job or documented nightly wrapper that safely runs them on this Mac mini as-is

## Best candidate if you want one to investigate next

If you want to identify a resumable training path, the best candidate to inspect first is:

```bash
node agent/final-complete-training.mjs
```

But this is **only a candidate for inspection**, **not yet confirmed safe** for unattended nightly use.

---

Audit basis:
- process table on this Mac mini
- root `package.json`
- `training-data/` contents
- `agent/` training scripts and JSON reports
- `openclaw status`
