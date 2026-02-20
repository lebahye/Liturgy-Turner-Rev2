# Telegram Token Issue - SOLUTION

## Problem

The shell environment has `TELEGRAM_BOT_TOKEN` set, which **overrides** the `.env` file.

**Check:**
```bash
env | grep TELEGRAM_BOT_TOKEN
# Shows: 8586464887:AAHNJYRe7E8nR7koe2KquubsGlpHIyq1WdE
```

But `.env` has the correct token for @BadarakBot:
```bash
cat .env | grep TELEGRAM_BOT_TOKEN
# Shows: 8207834735:AAE65pYUq5VcXpde0-SmdUiwkvT61SbtMho
```

Docker Compose prioritizes:
1. Shell environment variables (highest)
2. .env file (lowest)

---

## Solution

### Option 1: Unset Shell Variable (Temporary - This Session Only)
```bash
unset TELEGRAM_BOT_TOKEN
docker compose down
docker compose up -d
```

### Option 2: Update Your Shell Profile (Permanent)
```bash
# Find where it's set
grep -r "TELEGRAM_BOT_TOKEN" ~/.bashrc ~/.bash_profile ~/.zshrc ~/etc/profile 2>/dev/null

# Remove or comment out that line
# Then reload:
source ~/.bashrc  # or ~/.zshrc
```

### Option 3: Override in Docker Compose Command
```bash
TELEGRAM_BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN .env | cut -d'=' -f2) docker compose up -d
```

---

## Quick Fix for Now

Run this:
```bash
cd ~/clawd/projects/Liturgy-Turner-Rev2
unset TELEGRAM_BOT_TOKEN
docker compose down
docker compose up -d
```

Then verify:
```bash
docker logs liturgy-agent 2>&1 | grep "@BadarakBot"
# Should see: starting provider (@BadarakBot)
```

---

## Current Status

✅ Token properly secured in .env (not tracked in git)  
✅ Config uses ${TELEGRAM_BOT_TOKEN} variable  
✅ Docker compose configured to pass variable  
❌ Shell environment overriding .env file  

**Action needed:** Unset the shell variable or update shell profile.
