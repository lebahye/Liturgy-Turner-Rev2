# New PC Setup (Windows + WSL2) — Armenian Liturgy Page Turner

This project is designed to run **locally** on a Windows PC using **WSL2 + Ubuntu**.

## 0) Prereqs
- Windows 10/11
- WSL2 + Ubuntu installed
- Node.js 20+ inside WSL (recommended)

Inside WSL, verify:
```bash
node -v
npm -v
```

## 1) Clone + install
```bash
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2
cp .env.example .env
npm install
```

## 2) Create/upgrade local database (SQLite)
```bash
npm run db:migrate
```
Creates:
- `./data/liturgy-turner.db` (gitignored)

## 3) Run on LAN
```bash
npm run dev:lan
```

Access:
- Windows browser: `http://localhost:5000`
- iPhone/TV on same Wi‑Fi: `http://<YOUR_PC_LAN_IP>:5000`
- TV display mode: `http://<YOUR_PC_LAN_IP>:5000/display`

## 4) Quick smoke test
In another WSL terminal:
```bash
bash script/smoke.sh
```

## 5) Optional: project-local Clawdbot instance (for remote control + automation)
This project can run its own **dedicated** Clawdbot gateway (local-only) on port **28789**.

```bash
cp agent/clawdbot.json5.example agent/clawdbot.json5
npm run agent:start
```

> Note: This project is configured to use the **pinned Clawdbot version shipped in this repo** (`clawdbot-main.zip`).
>
> Build it in WSL:
>
> ```bash
> bash script/setup-clawdbot-from-zip.sh
> ```
>
> This produces:
> - `./vendor/clawdbot-main/dist/entry.js`

Remote control setup:
- See `REMOTE_CONTROL_SETUP.md` for Telegram + WhatsApp.

If you already have another Clawdbot instance running on the default port (18789),
this project will not conflict because it uses a different port.


## iOS microphone note
Safari on iOS often requires **HTTPS** for microphone access.
Display-only usage works fine over HTTP.

Optional quick HTTPS tunnel:
```bash
npm run tunnel:quick
```
