# Deployment Architecture (Final Direction)

## Goal
Liturgy page turning must work immediately after install, with predictable startup and health checks.

## Runtime Layers

Compose profiles are used to enforce separation:
- `core` profile: postgres + app (required)
- `agent-container-legacy` profile: optional legacy embedded agent (disabled by default)
- Preferred augmentation: external OpenClaw multi-agent runtime

1. **Core Runtime (required)**
   - Express API + React UI
   - `LiturgyPageTracker`
   - `training-data/*.json` artifacts
   - Endpoints: `/api/liturgy/*`, `/api/control/*`

2. **Optional Runtime (non-blocking)**
   - OpenClaw agent/gateway (`29789`)
   - Remote controls / notifications
   - App must remain healthy even if agent is unhealthy.

## Environment Strategy

### A) Windows Development (primary dev path)
- Run app locally for fastest debug loop.
- Optionally keep Postgres in Docker.
- Use Docker full-stack only when needed.

### B) Production (primary release path)
- Linux host + Docker Compose.
- Single command startup.
- Health checks + first-run verification script required.

## Port Contract
- App: container `5000`
- App host: `${APP_HOST_PORT}` (default `5000`)
- Agent gateway: `29789`
- Agent audio API (optional): `29788`
- Postgres: `5432`

## Tracker Configuration Contract
Tracker behavior must be controlled by env vars, not source edits.

- `TRACKER_MODE=prod|diag`
- Optional overrides:
  - `TRACKER_LOOKAHEAD`
  - `TRACKER_CONFIDENCE`
  - `TRACKER_COOLDOWN_MS`
  - `TRACKER_EVALUATE_ALWAYS`
  - `TRACKER_ALLOW_JUMPS`

## Acceptance Criteria
1. Fresh install starts with one command.
2. `/api/liturgy/status` returns initialized state.
3. `/api/liturgy/start` returns success.
4. `/api/liturgy/process` accepts chunks and returns valid tracking result.
5. UI root loads and reflects control state.
6. Optional agent failures do not break app runtime.
