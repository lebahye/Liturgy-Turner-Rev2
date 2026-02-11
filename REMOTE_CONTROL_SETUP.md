# Remote Control Setup (Telegram + WhatsApp)

This project is designed to run locally (Windows PC + WSL2). Remote control means:
- You send commands from **Telegram** or **WhatsApp**
- The **project-local Clawdbot** receives them
- Clawdbot calls the Liturgy app local control API to turn pages

## One-App Bot Embed (recommended)

When everything is running:
- Main app: http://127.0.0.1:5000/
- Embedded bot page: http://127.0.0.1:5000/bot
- Proxied control UI root: http://127.0.0.1:5000/clawdbot/

The iframe on `/bot` loads:
- `/clawdbot/chat?session=agent%3Aliturgy%3Amain`

## Prereqs
- Liturgy server running: `npm run dev:lan` (port 5000)
- Project-local Clawdbot running: `npm run agent:start` (gateway port 29790)

## Command style
Send simple messages:
- `next`
- `prev`
- `set 42`
- `state`

The Clawdbot agent will use the `liturgy-controller` skill to call:
- `POST /api/control/page/next|prev|set`
- `GET /api/control/state`

## Telegram
### 1) Create a bot
- Use **BotFather** in Telegram
- Create a bot and copy the token

### 2) Configure
Copy example config files:
```bash
cp agent/clawdbot.json5.example agent/clawdbot.json5
cp agent/channels.telegram.json5.example agent/channels.telegram.json5
```

Edit `agent/channels.telegram.json5`:
- Set `botToken`
- Set `allowFrom` to your Telegram user id (format: `tg:123456789`)

### 3) Include the channel config
In `agent/clawdbot.json5`, add:
```json5
{
  channels: {
    telegram: { "$include": "./agent/channels.telegram.json5" }
  }
}
```

Restart the agent.

## WhatsApp
WhatsApp requires pairing.

### 1) Configure
```bash
cp agent/channels.whatsapp.json5.example agent/channels.whatsapp.json5
```

Edit allowlist / DM policy in `agent/channels.whatsapp.json5`.

### 2) Include the channel config
In `agent/clawdbot.json5`, add:
```json5
{
  channels: {
    whatsapp: { "$include": "./agent/channels.whatsapp.json5" }
  }
}
```

### 3) Pair WhatsApp
Start the agent and follow the QR instructions printed by Clawdbot.

## Security (important)
- Always set allowlists:
  - Telegram: `allowFrom: ["tg:<yourUserId>"]`
  - WhatsApp: `allowFrom: ["+1..."]` (or pairing mode)
- Keep the gateway bound to loopback (default).
