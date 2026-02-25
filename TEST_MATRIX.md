# Test Matrix

## 1) Core API Health (must pass)
- `GET /api/liturgy/status`
- `POST /api/liturgy/start`
- `POST /api/liturgy/process` (synthetic chunk)
- `POST /api/liturgy/goto-page` (manual page set)
- `GET /api/control/state`
- `POST /api/control/page/set`

## 2) Data Availability
- `training-data/live-tracker-data.json` exists
- `training-data/fingerprints.json` exists
- `training-data/speaker-models.json` exists

## 3) Streaming Behavior
- Start at page 1
- Feed known liturgy WAV chunks
- Verify page progression is monotonic
- Verify no large jumps in `prod` mode (unless explicitly allowed)

## 4) Environment Cases

### Windows (native app)
- App boot
- UI reachable
- API endpoints reachable from browser and curl

### Docker (Linux target)
- `docker compose up -d`
- app healthy
- tracker initialized
- first-run verify script passes

## 5) Agent Isolation
- Stop/disable agent container
- Confirm app endpoints still pass core API health

## 6) Release Gate
Only ship when all sections pass.
