---
name: liturgy-controller
description: Control the Liturgy-Turner app (set/next/prev page, read state) via local HTTP API.
---

# Liturgy Controller

Use this skill when the user wants **Clawdbot to control page turns** in the Armenian Liturgy Page Turner app.

## Assumptions
- The Liturgy app server is running (default): `http://localhost:5001`
- Control API endpoints exist:
  - `GET /api/control/state`
  - `POST /api/control/page/set` body `{ page, reason?, confidence? }`
  - `POST /api/control/page/next` body `{ reason?, confidence? }`
  - `POST /api/control/page/prev` body `{ reason?, confidence? }`

## Configuration
- Read base URL from env var `LITURGY_BASE_URL` if set, else use `http://localhost:5001`.

## What to do
When asked to turn pages or query state:
1) Fetch state first:
   - `GET $BASE/api/control/state`
2) If asked to set a page:
   - Clamp page to `[1..state.totalPages]`.
   - Call `POST $BASE/api/control/page/set`.
3) If asked next/prev:
   - Call `POST $BASE/api/control/page/next` or `/prev`.

## How to execute
Use the **bash/exec tool** to call the API with `curl`.

### Commands
- Get state:
  - `curl -sS "$BASE/api/control/state"`
- Set page:
  - `curl -sS -X POST "$BASE/api/control/page/set" -H 'Content-Type: application/json' -d '{"page":42,"reason":"telegram","confidence":1.0}'`
- Next page:
  - `curl -sS -X POST "$BASE/api/control/page/next" -H 'Content-Type: application/json' -d '{"reason":"telegram","confidence":1.0}'`
- Prev page:
  - `curl -sS -X POST "$BASE/api/control/page/prev" -H 'Content-Type: application/json' -d '{"reason":"telegram","confidence":1.0}'`

## Output
- Always report back the resulting page and any reason/confidence.
- If server is unreachable, instruct the user to start it:
  - `npm run dev:lan`

