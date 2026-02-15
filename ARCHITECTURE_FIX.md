# 🏗️ Single Port Architecture - FINAL FIX

## Current Problem

```
App Port:     5000  ✅ Running
Gateway Port: 29790 ❌ Not running
Result: Can't access bot UI, port confusion
```

## Solution Options

### Option 1: Embedded Gateway (Recommended)
**Run gateway as child process of main app**

```
┌──────────────────────────────────────┐
│  Single Port 5000                    │
│                                      │
│  Express App (parent)                │
│    ├─ /api/*         → API routes   │
│    ├─ /*            → React UI      │
│    ├─ /clawdbot/*   → Gateway proxy │
│    └─ child_process                 │
│         └─ Gateway (29790 internal) │
│                                      │
└──────────────────────────────────────┘

External access: ONLY port 5000
Internal: Gateway on 29790 (localhost only)
Proxy: Express forwards /clawdbot/* to gateway
```

**Advantages:**
✅ Single port exposed (5000)
✅ Gateway starts automatically with app
✅ No port confusion
✅ Works on Replit (single exposed port)
✅ Gateway dies with app (clean shutdown)

### Option 2: Unified HTTP Server
**Gateway and app share same HTTP server**

```
┌──────────────────────────────────────┐
│  Single HTTP Server on Port 5000    │
│                                      │
│  Routes:                             │
│    /api/*       → Express routes    │
│    /*           → React UI          │
│    /clawdbot/*  → Gateway directly  │
│                                      │
└──────────────────────────────────────┘
```

**Advantages:**
✅ True single port
✅ No proxy needed
✅ Simpler architecture

**Disadvantages:**
⚠️ Requires modifying Clawdbot to not start its own server
⚠️ More complex integration

### Option 3: Process Manager (PM2/systemd)
**Manage both processes, but still proxy**

```
Process Manager
├─ App (5000)
└─ Gateway (29790)

Nginx/Proxy:
  :5000 → App + Gateway proxy
```

**Disadvantages:**
❌ Still two processes
❌ More complexity
❌ Doesn't solve core issue

## 🎯 Recommended: Option 1

### Implementation

**server/index.ts changes:**
```typescript
import { spawn } from 'child_process';
import path from 'path';

// Start gateway as child process
function startEmbeddedGateway() {
  const gatewayScript = path.join(__dirname, '../agent/run-gateway.sh');
  
  console.log('🤖 Starting embedded Clawdbot Gateway...');
  
  const gateway = spawn('bash', [gatewayScript], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLAWDBOT_GATEWAY_PORT: '29790',
      CLAWDBOT_GATEWAY_BIND: 'loopback'
    }
  });
  
  gateway.stdout?.on('data', (data) => {
    console.log(`[Gateway] ${data.toString().trim()}`);
  });
  
  gateway.stderr?.on('data', (data) => {
    console.error(`[Gateway] ${data.toString().trim()}`);
  });
  
  gateway.on('exit', (code) => {
    console.error(`❌ Gateway exited with code ${code}`);
    if (code !== 0) {
      setTimeout(() => startEmbeddedGateway(), 5000); // Restart after 5s
    }
  });
  
  // Cleanup on app exit
  process.on('exit', () => gateway.kill());
  process.on('SIGTERM', () => gateway.kill());
  
  return gateway;
}

// Start it during app initialization
(async () => {
  // Start gateway first
  startEmbeddedGateway();
  
  // Wait 2 seconds for gateway to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Then start Express app
  await registerRoutes(httpServer, app);
  // ... rest of app startup
})();
```

### One Command Startup

**package.json:**
```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "start": "NODE_ENV=production node dist/index.cjs"
  }
}
```

**Just one command:** `npm run dev`
- Starts app on 5000
- Automatically starts gateway on 29790 (internal)
- Proxy handles /clawdbot routes

## 🚀 Deployment (Replit/Production)

### Single Port Exposure
```yaml
# Replit configuration
[deployment]
exposedPorts = [5000]

# Only port 5000 is publicly accessible
# Gateway on 29790 is internal only
```

### Environment Variables
```bash
PORT=5000
CLAWDBOT_GATEWAY_PORT=29790
CLAWDBOT_GATEWAY_BIND=loopback  # localhost only
```

## 🔐 Security Benefits

**With this architecture:**
- ✅ Gateway not exposed to internet (localhost only)
- ✅ App proxies with authentication
- ✅ Single firewall rule (port 5000)
- ✅ Admin can access via app's auth layer

## 📊 Summary

| Aspect | Before | After |
|--------|--------|-------|
| Ports exposed | 2 (5000, 29790) | 1 (5000) |
| Gateway access | Direct | Via proxy |
| Startup | 2 commands | 1 command |
| Replit compatible | ❌ No | ✅ Yes |
| Security | ⚠️ Exposed | ✅ Protected |

## ✅ Implementation Checklist

- [ ] Modify server/index.ts to spawn gateway
- [ ] Test startup (single command)
- [ ] Verify /clawdbot routes work
- [ ] Test on Replit
- [ ] Document for deployment
