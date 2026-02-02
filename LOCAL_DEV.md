# Local Dev & Deployment (WSL/Ubuntu)

This project is designed to run **locally** on a Windows PC using **WSL2 + Ubuntu**, with clients (Windows browser, iOS Safari) connecting over the network.

## 0) Clone + install

```bash
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2
cp .env.example .env
npm install
```

## 1) Create/upgrade the local database (SQLite)

```bash
npm run db:migrate
```

This creates:
- `./data/liturgy-turner.db` (gitignored)

## 2) Run the app (LAN mode)

```bash
npm run dev
```

The server binds to `0.0.0.0`.

Access:
- Windows browser: `http://localhost:5000`
- iOS on same Wi‑Fi: `http://<YOUR_PC_LAN_IP>:5000`

### iOS microphone note
Safari on iOS typically requires **HTTPS** for microphone access.
Display-only usage works fine over HTTP.

## 3) Optional: run the dedicated project agent (Clawdbot)

This project includes an `agent/` scaffold for a **project-local Clawdbot instance**.

```bash
cp agent/clawdbot.json5.example agent/clawdbot.json5
npm run agent:start
```

The agent keeps its state in:
- `agent/.clawdbot-state/` (gitignored)

## 4) Optional: HTTPS for iOS mic (Cloudflare Tunnel)

If you want iOS mic training to work reliably, run with HTTPS.

Fastest path is Cloudflare Tunnel:

1) Install `cloudflared` in WSL.
2) Run:

```bash
npm run tunnel:quick
```

This prints an `https://...` URL you can open on iOS.

## 5) One-command local startup (advanced)

If you already created `agent/clawdbot.json5`:

```bash
npm run local:up
```

This runs:
- `db:migrate`
- `dev`
- `agent:start`

