# Testing Liturgy Bot on Your Laptop

## The Problem with Docker

Docker containers **cannot access your laptop's microphone** by default. They're isolated.

## Solution for Development/Testing

Run the **agent on your HOST** (outside Docker) while keeping the app in Docker.

## Setup

### 1. Keep Docker Containers Running

```bash
cd projects/Liturgy-Turner-Rev2
docker-compose up -d app postgres
```

This gives you:
- ✅ App at http://localhost:5000
- ✅ Database
- ❌ Agent (we'll run this on host instead)

### 2. Start Agent Locally

```bash
cd agent
./START_LOCAL_FOR_TESTING.sh
```

This starts the agent on **port 29790** with:
- ✅ Access to your laptop's microphone
- ✅ All 3 skills loaded
- ✅ Connects to app at localhost:5000

### 3. Open Web UI

Go to: **http://localhost:29790**

### 4. Test Audio

Say: **"Start listening and turn pages"**

The bot will:
1. Capture audio from your laptop microphone
2. Match it to the 172-page dictionary
3. POST page changes to http://localhost:5000

## Architecture

```
┌─────────────────────────────────────┐
│         YOUR LAPTOP                 │
├─────────────────────────────────────┤
│                                     │
│  🎤 Microphone                      │
│       ↓                             │
│  Liturgy Agent (HOST - port 29790) │
│       ↓                             │
│  ┌──────────────────────────────┐  │
│  │  DOCKER CONTAINERS           │  │
│  │                              │  │
│  │  liturgy-app (port 5000)     │  │
│  │  postgres                    │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Files

- `clawdbot-local.json5` - Config for local development
- `START_LOCAL_FOR_TESTING.sh` - Startup script
- Uses port 29790 (not 29789) to avoid Docker conflict

## When Ready for Church Deployment

Churches will run EVERYTHING in Docker on a dedicated device with audio cable from mixer. But for testing on your laptop, this hybrid approach works best.

## Troubleshooting

**"No microphone access"**
- Make sure you're running the script, not Docker
- Check browser permissions at http://localhost:29790

**"Can't reach app"**
- Make sure Docker containers are running: `docker-compose ps`
- App should be at http://localhost:5000

**"Skills not loading"**
- Run: `cd agent/skills/liturgy-audio-controller && npm install`
