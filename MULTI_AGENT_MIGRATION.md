# Multi-Agent Migration (Final Architecture)

## Locked Decision
Use **one OpenClaw gateway** with **multi-agent routing**.

- Liturgy app runs in Docker (`app + postgres`)
- Liturgy agent runs **outside Docker** as an OpenClaw agent
- Embedded Docker `agent` service is legacy-only and disabled by default

## Why
- Removes container restart-loop issues from the critical path
- Keeps one control plane for all agents
- Preserves per-agent auth/workspace isolation

## Docker Runtime (project)

Start core services only:

```bash
docker compose --profile core up -d --build
```

Do **not** enable legacy embedded agent profile unless debugging legacy behavior.

## App -> External Agent Contract

App now reads:

- `AGENT_AUDIO_API_URL` (default): `http://host.docker.internal:29788`

The external Liturgy agent must expose:
- `GET /health`
- `POST /feed-audio`
- `POST /start-recognition`
- `POST /stop-recognition`
- `GET /status`

## OpenClaw Multi-Agent Requirements

1. One gateway instance
2. Separate `agentDir` per agent
3. Separate auth profiles per agent
4. Bindings route Liturgy workflows/chats to Liturgy agent

## Telegram Routing Goal

`@BadarakBot` should bind Liturgy-specific chats to the Liturgy agent.
Global/general chats remain bound to the global assistant agent.

## Verification Checklist

1. Core app healthy: `/api/liturgy/status`
2. External agent healthy: `GET http://host.docker.internal:29788/health` from app container
3. App proxy healthy: `/api/agent/status` returns available=true
4. Live mode Start does not timeout

## Rollback

If external agent is unavailable, app remains operational in local mode/fallback path.
Legacy embedded agent can be re-enabled with:

```bash
docker compose --profile core --profile agent-container-legacy up -d --build
```
