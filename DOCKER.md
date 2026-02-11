# Docker Deployment Guide - Liturgy Turner

## Overview

This project can now run fully Dockerized with three containers:
1. **PostgreSQL** - Database
2. **Liturgy App** - Express + React app
3. **Clawdbot Agent** - Project-specific AI assistant

---

## Quick Start

### 1. Prerequisites

- **Docker** installed
- **Docker Compose** installed

### 2. Setup Agent Configuration

```bash
cd projects/Liturgy-Turner-Rev2

# Copy agent config example
cp agent/clawdbot.json5.example agent/clawdbot.json5

# Edit with your preferences (optional)
nano agent/clawdbot.json5
```

### 3. Configure Environment

```bash
# Copy Docker env template
cp .env.docker .env

# Edit with your credentials
nano .env
```

**Required:**
- `POSTGRES_PASSWORD` - Set a secure password

**Optional:**
- `OPENAI_API_KEY` - For AI features
- `GEMINI_API_KEY` - For Gemini AI integration
- `PUBLIC_BASE_URL` - If using reverse proxy/tunnel

### 4. Start Everything

```bash
docker-compose up -d
```

This will:
- Build the app and agent images
- Start PostgreSQL
- Run database migrations
- Start the app on port 5000
- Start the agent on port 29789

### 5. Check Status

```bash
docker-compose ps
```

Expected output:
```
NAME              STATUS
liturgy-postgres  Up (healthy)
liturgy-app       Up (healthy)
liturgy-agent     Up (healthy)
```

### 6. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f agent
docker-compose logs -f postgres
```

### 7. Access the App

- **Web UI:** http://localhost:5000
- **From another device on network:** http://YOUR_IP:5000

---

## Management Commands

### Stop Everything
```bash
docker-compose down
```

### Stop and Remove Volumes (clean slate)
```bash
docker-compose down -v
```

### Rebuild After Code Changes
```bash
docker-compose build
docker-compose up -d
```

### Restart Single Service
```bash
docker-compose restart app
docker-compose restart agent
```

### Database Migrations
```bash
# Migrations run automatically on startup
# To run manually:
docker-compose exec app npm run db:push
```

### Agent Commands
```bash
# Check agent status
docker-compose exec agent clawdbot status

# View agent config
docker-compose exec agent cat /app/agent/clawdbot.json5

# Restart agent
docker-compose restart agent
```

---

## iOS Access (HTTPS for Microphone)

iOS Safari requires HTTPS for microphone access.

### Option 1: Cloudflare Tunnel (Easiest)

1. **Install cloudflared** on host:
   ```bash
   # On host (not in Docker)
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```

2. **Run tunnel:**
   ```bash
   cloudflared tunnel --url http://localhost:5000
   ```

3. **Access on iOS:** Use the `https://...trycloudflare.com` URL

### Option 2: Nginx with Let's Encrypt

Set up reverse proxy with SSL certificate (advanced).

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Docker Compose Network                 │
│                                         │
│  ┌──────────────┐                      │
│  │  PostgreSQL  │ :5432                │
│  │  (Volume)    │                      │
│  └──────┬───────┘                      │
│         │                               │
│  ┌──────▼───────┐                      │
│  │  Liturgy App │ :5000                │
│  │  • Express   │                      │
│  │  • React     │ ◄─────┐             │
│  │  • Audio     │       │             │
│  └──────────────┘       │             │
│                          │             │
│  ┌──────────────┐       │             │
│  │ Clawdbot     │ :29789│             │
│  │ Agent        ├───────┘             │
│  │ (Gateway)    │                     │
│  └──────────────┘                     │
│                                        │
└────────────────────────────────────────┘
         │              │
         │              │
    ┌────▼───┐     ┌───▼────┐
    │ Browser│     │iOS/iPad│
    │ Client │     │ Safari │
    └────────┘     └────────┘
```

---

## Volumes

Docker manages these volumes automatically:

- **postgres-data** - Database files (persistent)
- **agent-state** - Clawdbot agent state (persistent)
- **./uploads** - Uploaded PDFs and audio (bind mount)
- **./data** - Local data files (bind mount)

**To backup:**
```bash
# Database
docker-compose exec postgres pg_dump -U liturgy_user liturgy_turner > backup.sql

# Uploads
tar -czf uploads-backup.tar.gz uploads/
```

---

## Troubleshooting

### App won't start
```bash
# Check logs
docker-compose logs app

# Common issues:
# - Database not ready: wait 30s and check again
# - Port 5000 in use: change PORT in .env
# - Build failed: run `docker-compose build --no-cache app`
```

### Agent won't start
```bash
# Check logs
docker-compose logs agent

# Common issues:
# - clawdbot.json5 not found: ensure agent/clawdbot.json5 exists
# - Permission issues: check file ownership
```

### Database connection failed
```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U liturgy_user

# Reset database
docker-compose down -v
docker-compose up -d
```

### Can't access from another device
```bash
# Ensure firewall allows port 5000
sudo ufw allow 5000

# Check Docker is binding to 0.0.0.0
docker-compose logs app | grep "listening"
```

---

## Development vs Production

### Development (Local with Hot Reload)
```bash
npm run dev  # Traditional way
```

### Production (Docker)
```bash
docker-compose up -d  # Runs built/optimized code
```

### Hybrid (Docker DB, local dev server)
```bash
# Start only database
docker-compose up -d postgres

# Run dev server locally
export DATABASE_URL=postgresql://liturgy_user:changeme@localhost:5432/liturgy_turner
npm run dev
```

---

## Scaling

### Add More App Instances (Load Balancing)

```yaml
# docker-compose.yml
app:
  deploy:
    replicas: 3
```

Then add Nginx load balancer in front.

### Separate Agent from App

Agent can run on different machine:

```yaml
# On Machine 1 (App)
environment:
  CLAWDBOT_GATEWAY_URL: http://192.168.1.100:29789

# On Machine 2 (Agent)
# Run agent container only
```

---

## Security

### Production Checklist
- [ ] Change `POSTGRES_PASSWORD` from default
- [ ] Use strong passwords
- [ ] Don't expose PostgreSQL port externally (remove `ports:` from postgres service)
- [ ] Use reverse proxy (Nginx/Caddy) with HTTPS
- [ ] Restrict agent port 29789 to internal network only
- [ ] Enable firewall rules
- [ ] Regular database backups
- [ ] Keep Docker images updated

---

## Next Steps

1. **Customize agent skills** - Add project-specific skills in `agent/skills/`
2. **Set up HTTPS** - For iOS microphone access
3. **Configure monitoring** - Add health checks, alerts
4. **Backup strategy** - Automate database backups
5. **CI/CD** - Automate builds and deployments

---

**Questions?** Check logs with `docker-compose logs -f` or file an issue.
