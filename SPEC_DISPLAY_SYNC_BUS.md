# Display Sync Bus (Single-Device Hub + Wi‑Fi TV Viewer)

## Goal
Run everything on **one laptop/iOS device**:
- Device listens to live Badarak audio.
- Embedded decision engine chooses the correct page.
- App turns pages locally.
- A Smart TV on the same Wi‑Fi shows **current page only**, full-screen, always in sync.

## Non-Goals
- No hosting.
- No multi-device “decision engine”.
- No remote control from the TV by default.

## Architecture
### Components
1) **State Bus (server-side)**
- Canonical state: `{ pdfPath, pdfId, page, totalPages, mode, updatedAt, lastReason, lastConfidence }`
- Broadcasts changes over WebSocket.

2) **Controllers**
- Local UI (Live) and the embedded engine send `setPage/next/prev` commands to server.

3) **Viewers**
- `/display` page on TV subscribes to WebSocket and renders the current page.

## Wire Protocol
### WebSocket
`WS /ws`

Server -> client messages:
- `state`: `{ type: 'state', state: DisplayState }`
- `page_changed`: `{ type: 'page_changed', state: DisplayState }`

Client -> server messages (future):
- none for TV (read-only)

### HTTP API
All endpoints are local-network safe; write endpoints can optionally require a key later.

- `GET /api/control/state` -> `{ state: DisplayState }`
- `POST /api/control/page/set` body `{ page: number, reason?: string, confidence?: number }`
- `POST /api/control/page/next` body `{ reason?: string, confidence?: number }`
- `POST /api/control/page/prev` body `{ reason?: string, confidence?: number }`
- `POST /api/control/pdf/set` body `{ pdfPath: string, pdfId?: string, totalPages?: number }`

## DisplayState
```ts
type DisplayState = {
  pdfPath: string | null;    // e.g. /uploads/pdfs/file.pdf
  pdfId: string | null;      // sha256 stable id if known
  page: number;              // 1-indexed
  totalPages: number;        // >= 1
  mode: 'live' | 'training' | 'display';
  updatedAt: number;         // epoch ms
  lastReason?: string;
  lastConfidence?: number;
}
```

## Security
- TV viewer is read-only.
- Server binds to `0.0.0.0` so TV can connect.
- No secrets stored in DB.
- Optional future: require `X-DISPLAY-KEY` for write endpoints.

## UX Requirements (TV)
- Current page only.
- Fit-to-screen while preserving aspect ratio.
- Minimal chrome.
- Auto-reconnect.

