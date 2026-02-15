# Optional Messaging Setup

## 📱 Telegram & WhatsApp - Optional Add-ons

**Important:** These are **NOT required** for the system to work! Only add if you specifically need remote control via messaging apps.

---

## 🎯 When to Add External Messaging

### ✅ Good Reasons to Add:
- Multiple people need control (deacon, altar servers, tech team)
- Want notifications on phones
- Remote testing/monitoring
- Training sessions from home
- Emergency control if laptop fails

### ❌ Don't Add If:
- You only need local control
- Just one person operates system
- Laptop is always near the action
- Want to keep things simple
- Don't want external dependencies

---

## 📊 Comparison

### Local Chat (Default) vs External Messaging

| Feature | Local Chat | Telegram | WhatsApp |
|---------|-----------|----------|----------|
| **Setup Time** | 0 minutes | 30 minutes | 1 hour |
| **Accounts Needed** | None | Telegram account | WhatsApp Business |
| **API Keys** | None | Bot token | Business API |
| **Works Offline** | ✅ Yes | ❌ No | ❌ No |
| **Remote Control** | ❌ No | ✅ Yes | ✅ Yes |
| **Multi-user** | ⚠️ Same device | ✅ Multiple phones | ✅ Group chat |
| **Setup Complexity** | ✅ None | ⚠️ Medium | ⚠️ High |
| **Maintenance** | ✅ Zero | ⚠️ Monitor bot | ⚠️ Business account |
| **Cost** | ✅ Free | ✅ Free | ⚠️ May cost |
| **Privacy** | ✅ Local only | ⚠️ Via Telegram | ⚠️ Via WhatsApp |

---

## 🤖 Telegram Setup (Optional)

### Prerequisites:
- Telegram account (free)
- BotFather access
- 30 minutes

### Steps:

#### 1. Create Bot Token
```
1. Open Telegram
2. Search for @BotFather
3. Send: /newbot
4. Follow prompts:
   - Bot name: "YourChurch Liturgy Bot"
   - Username: "yourchurch_liturgy_bot"
5. Save the token (looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
```

#### 2. Configure App
```bash
cd /app/project
nano .env

# Add this line:
TELEGRAM_BOT_TOKEN=your_token_here
```

#### 3. Restart App
```bash
docker compose restart
# or
npm run dev
```

#### 4. Connect
```
1. Open Telegram
2. Search for your bot
3. Send: /start
4. Bot responds with welcome message
```

### Commands Available:
- `/start` - Initialize bot
- `/page <number>` - Jump to page
- `/next` - Next page
- `/prev` - Previous page
- `/status` - Current status
- `/help` - List commands

---

## 💬 WhatsApp Setup (Optional)

### Prerequisites:
- WhatsApp Business account
- Verified business
- API access (may require approval)
- 1+ hours

### Warning:
WhatsApp Business API is more complex than Telegram. Consider if you really need it.

### Steps:

#### 1. Get API Access
```
1. Apply for WhatsApp Business API
2. Verify your business
3. Get approved (may take days)
4. Get API credentials
```

#### 2. Configure Webhook
```bash
cd /app/project
nano .env

# Add these lines:
WHATSAPP_API_TOKEN=your_api_token
WHATSAPP_PHONE_NUMBER=your_business_number
WHATSAPP_WEBHOOK_SECRET=your_secret
```

#### 3. Set Up Webhook
```
Configure webhook endpoint:
https://your-server.com/api/whatsapp/webhook

Or use ngrok for local testing:
ngrok http 5000
```

#### 4. Test
```
1. Send message to your business number
2. Bot should respond
3. Try commands
```

### Commands Available:
- Similar to Telegram
- Voice messages supported
- Media sharing supported

---

## 🔧 Configuration Files

### Location
```
/app/project/agent/
├── channels.telegram.json5    (Telegram config - if using)
└── channels.whatsapp.json5    (WhatsApp config - if using)
```

### Example: Telegram Config
```json5
{
  "enabled": true,
  "token": "YOUR_BOT_TOKEN",
  "allowedUsers": [
    "123456789",  // Your Telegram user ID
    "987654321"   // Another allowed user
  ],
  "commands": {
    "page": true,
    "next": true,
    "prev": true,
    "status": true
  }
}
```

---

## 🛡️ Security Considerations

### Telegram:
- ✅ Bot token is secret (don't share)
- ✅ Use `allowedUsers` to restrict access
- ✅ Bot can only control, not access files
- ⚠️ Messages go through Telegram servers

### WhatsApp:
- ✅ Business verification required
- ✅ Webhook secrets protect endpoint
- ✅ End-to-end encryption in app
- ⚠️ API calls go through Meta servers

### Recommendation:
- Use local chat if privacy is critical
- External messaging is convenient but less private
- Consider church's privacy requirements

---

## 🔄 Maintenance

### If Using External Messaging:

**Weekly:**
- [ ] Check bot is responding
- [ ] Verify commands work
- [ ] Monitor for errors

**Monthly:**
- [ ] Review bot logs
- [ ] Update allowed users if needed
- [ ] Check API quota usage (WhatsApp)

**As Needed:**
- [ ] Rotate tokens/secrets
- [ ] Update webhook URLs
- [ ] Add/remove users

---

## 🚫 How to Remove External Messaging

### If You Change Your Mind:

#### Remove Telegram:
```bash
cd /app/project
nano .env

# Remove or comment out:
# TELEGRAM_BOT_TOKEN=...

# Restart:
docker compose restart
```

#### Remove WhatsApp:
```bash
cd /app/project
nano .env

# Remove WhatsApp vars
# WHATSAPP_API_TOKEN=...
# WHATSAPP_PHONE_NUMBER=...

# Restart:
docker compose restart
```

**System continues working with local chat only!**

---

## 💡 Recommendations

### Start Simple:
1. ✅ Install with local chat only
2. ✅ Use for 2-3 services
3. ✅ See if you need remote control
4. ⚠️ Add messaging only if actually needed

### Most Churches Don't Need It:
- Local control is sufficient
- Simpler = more reliable
- Less to maintain
- Better privacy

### Add It If:
- Multiple people need control
- Remote monitoring is valuable
- Team coordination helps
- You have technical capacity

---

## 📚 Additional Resources

### Telegram:
- Bot documentation: https://core.telegram.org/bots
- BotFather: https://t.me/botfather
- API reference: https://core.telegram.org/bots/api

### WhatsApp:
- Business API: https://developers.facebook.com/docs/whatsapp
- Getting started: https://business.whatsapp.com/
- Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api

---

## 🎯 Summary

**Remember:**
- ✅ Not required for basic operation
- ✅ Local chat works great
- ⚠️ Add only if you need it
- ⚠️ More complexity = more maintenance
- ✅ Can add/remove anytime

**The default setup (local chat) is perfect for most churches!**

---

*Last Updated: 2026-02-15*  
*Default Setup: Local chat only*  
*External Messaging: Optional add-on*  
*Recommendation: Start simple, add later if needed*
