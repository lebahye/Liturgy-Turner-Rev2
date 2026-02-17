# Liturgy Turner - Armenian Divine Liturgy Page Turner

**Automated page turning system for Armenian church services using audio recognition.**

---

## What It Does

- **Listens** to liturgy audio during services
- **Recognizes** where you are in the liturgy book
- **Turns pages** automatically on the display
- **Learns** from recordings to improve accuracy

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Anthropic API key

### Installation

```bash
# 1. Clone repository
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2

# 2. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Start system
docker compose up -d

# 4. Access
# App: http://localhost:5000
# Bot Control: http://localhost:29789 (token: liturgy-secure-token)
```

---

## Architecture

```
┌──────────────────────────────────────┐
│    LITURGY TURNER APP (:5000)        │
│  - Display liturgy pages             │
│  - Upload audio/PDFs                 │
│  - Training interface                │
│  - Live mode (auto page turns)       │
└──────────────────────────────────────┘
              ↓ HTTP API
┌──────────────────────────────────────┐
│    CLAWDBOT AGENT (:29789)           │
│  - Processes audio                   │
│  - Builds phonetic dictionary        │
│  - Controls page turns               │
│  - Learns from training              │
└──────────────────────────────────────┘

Communication:
- Telegram (@BadarakBot)
- Bot Control UI (http://localhost:29789)
```

---

## Bot Communication

### Telegram (Primary)
Message @BadarakBot to:
- Check training progress
- Control page turns
- Debug issues
- Process audio files

### Bot Control UI
Access at: `http://localhost:29789/?token=liturgy-secure-token`
- View sessions and logs
- Monitor system status
- Advanced troubleshooting

---

## Training

### 1. Upload Audio
- Go to http://localhost:5000/training
- Upload service recording

### 2. Tell Bot to Process
Via Telegram:
> "Process the new audio file"

### 3. Check Progress
> "What's the dictionary size?"
> "Show training status"

---

## Current Status

**Dictionary:**
- 3,755+ words (230 Armenian, 3,525 phonetic)
- Target: 5,000+ words for production

**Accuracy:**
- Current: ~60% (from single recording)
- Target: 90%+ (needs 2-3 more recordings)

**Next Steps:**
1. Upload more service recordings
2. Expand dictionary
3. Test page turning accuracy
4. Deploy to church

---

## Key Files

### For Users:
- `FINAL_SETUP.md` - Complete setup guide
- `CHANGES_MADE.md` - Recent changes
- `DOCKER.md` - Docker deployment details

### For Bot:
- `agent/AGENTS.md` - Bot behavior guidelines
- `agent/PROJECT_ACCESS.md` - Data access info
- `agent/SOUL.md` - Bot identity
- `agent/skills/` - Bot capabilities

### For Training:
- `PRE_TRAINING_STRATEGY.md` - How to reach 90%
- `DICTIONARY_OVERVIEW.md` - Dictionary details
- `CUSTOM_ARMENIAN_TRAINING.md` - Armenian-specific training

---

## Shipping to Church

```bash
# 1. On new laptop, clone repo
git clone YOUR_REPO
cd Liturgy-Turner-Rev2

# 2. Add API key
cp .env.example .env
# Edit .env

# 3. Start
docker compose up -d

# DONE - System ready for service
```

---

## Troubleshooting

### Bot not responding on Telegram:
```bash
docker compose logs agent | grep telegram
```

### Can't access Bot Control:
Use token in URL: `http://localhost:29789/?token=liturgy-secure-token`

### Agent can't see files:
```bash
docker compose exec agent ls -la /app/uploads/
```

---

## Development

**Key directories:**
- `client/` - React frontend
- `server/` - Express backend
- `agent/` - Clawdbot workspace
- `training-data/` - Phonetic dictionaries
- `uploads/` - Audio and PDF files

**Docker services:**
- `app` - Main application (:5000)
- `agent` - Clawdbot (:29789)
- `postgres` - Database (:5432)

---

## License

See `NOTES_LICENSING.md` for details.

---

**Built with:**
- Clawdbot (OpenClaw)
- Anthropic Claude
- React + TypeScript
- Express + Node.js
- PostgreSQL + SQLite
