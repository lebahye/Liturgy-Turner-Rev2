# 🎭 Liturgy Bot - Quick Start Guide

## Current Status: ⚠️ Configuration Issue

The bot agent is running but bound to localhost only, preventing the app from connecting.

## ✅ **IMMEDIATE WORKAROUND**

**Option A: Run Without Docker Agent** (Simplest)

1. Stop the agent container:
   ```bash
   docker stop liturgy-agent
   ```

2. Run the agent directly on your host:
   ```bash
   cd ~/clawd/projects/Liturgy-Turner-Rev2
   bash agent/run-gateway.sh
   ```

3. The app at http://localhost:5000 will now be able to connect to the agent

---

**Option B: Use the App Without Bot** (Temporary)

The Liturgy app works fine without the bot for creating/managing liturgies manually:
- http://localhost:5000 - Main app
- Create liturgies through the web UI
- The bot integration can be added later

---

## 🔧 **PROPER FIX** (For Later)

The issue is that Clawdbot's gateway binds to `127.0.0.1` for security, which doesn't work in Docker networks.

**Solution**: Configure Clawdbot with proper auth tokens and network binding:

1. Edit `agent/clawdbot.json5`:
   ```json5
   gateway: {
     mode: "production",  // Changed from "local"
     bind: "0.0.0.0",     // Bind to all interfaces
     port: 29789,
     auth: {
       mode: "token",
       token: "${CLAWDBOT_GATEWAY_TOKEN}"  // Use env var
     }
   }
   ```

2. Rebuild the agent container
3. Restart

---

## 📱 **WHAT YOU CAN DO NOW**

1. **Use the app**: http://localhost:5000 works perfectly for managing liturgies
2. **Chat with bot**: Currently needs the workaround above
3. **Alternative**: Connect Clawdbot to Telegram/WhatsApp for remote bot access

---

## 🎯 **RECOMMENDATION**

For now, **use the app directly** at http://localhost:5000. The core functionality (creating, editing, managing liturgies) works great without needing the bot agent for every interaction.

The bot is best for:
- Natural language queries
- Complex automation
- Remote access via messaging apps

The web UI is best for:
- Direct liturgy creation/editing
- Visual browsing
- Quick access

---

*Last updated: 2026-02-11*
