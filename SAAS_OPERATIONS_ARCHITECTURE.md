# 🏢 SaaS Operations Architecture
**Multi-Channel + Central Monitoring + Auto-Updates**

---

## 🎯 Your Requirements

1. ✅ **All channels work simultaneously** (Telegram, WhatsApp, Discord, Web)
2. ✅ **Each church = isolated installation** (own Docker containers + bot)
3. ✅ **Central monitoring** (you see all churches from one dashboard)
4. ✅ **Push updates** to all bots remotely
5. ✅ **Analytics** across all installations

---

## 🏗️ Architecture: Hub and Spoke Model

```
┌─────────────────────────────────────────────────────────┐
│         CENTRAL HUB (Your Control Center)               │
│  https://liturgy-ops.yourdomain.com                     │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Operations Dashboard                          │    │
│  │  • See all 10 churches live                    │    │
│  │  • Performance metrics                          │    │
│  │  • Training progress                            │    │
│  │  • Alerts and issues                            │    │
│  │  • Push updates                                 │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Analytics Engine                              │    │
│  │  • Accuracy trends                             │    │
│  │  • Usage statistics                             │    │
│  │  • Error rates                                  │    │
│  │  • Training velocity                            │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Update Manager                                │    │
│  │  • Bot versions                                │    │
│  │  • Roll out updates                            │    │
│  │  • Rollback if needed                          │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Secure HTTPS + Auth
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Church A    │  │   Church B    │  │   Church C    │
│  (St. Greg)   │  │ (Holy Cross)  │  │ (St. Vartan)  │
│               │  │               │  │               │
│  App + Bot    │  │  App + Bot    │  │  App + Bot    │
│  + Postgres   │  │  + Postgres   │  │  + Postgres   │
│               │  │               │  │               │
│  Channels:    │  │  Channels:    │  │  Channels:    │
│  • Telegram   │  │  • Telegram   │  │  • Telegram   │
│  • WhatsApp   │  │  • WhatsApp   │  │  • WhatsApp   │
│  • Discord    │  │  • Discord    │  │  • Discord    │
│  • Web Chat   │  │  • Web Chat   │  │  • Web Chat   │
│               │  │               │  │               │
│  Reports to   │  │  Reports to   │  │  Reports to   │
│  Central Hub  │  │  Central Hub  │  │  Central Hub  │
└───────────────┘  └───────────────┘  └───────────────┘
```

---

## 📡 Multi-Channel Configuration

### Single Bot, Multiple Interfaces

**Each church's bot simultaneously handles:**

```json
// agent/clawdbot.json5
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "unique-per-church",
      "dmPolicy": "allowlist",
      "allowFrom": ["church-admin-ids"]
    },
    "whatsapp": {
      "enabled": true,
      "accountSid": "...",
      "authToken": "...",
      "phoneNumber": "+1234567890"
    },
    "discord": {
      "enabled": true,
      "botToken": "...",
      "guildIds": ["church-discord-server"]
    },
    "slack": {
      "enabled": false  // Optional
    }
  },
  "gateway": {
    "port": 29789,
    "controlUi": {
      "enabled": true,
      "basePath": "/clawdbot"
    }
  }
}
```

**Result:**
- Church admin can chat via Telegram while at home
- Operator can use Web Chat during service
- Discord channel for community questions
- WhatsApp for quick mobile access
- ALL connected to SAME bot, SAME memory

---

## 🔧 Bot-to-Hub Communication

### Heartbeat + Metrics Reporter

**Each church bot sends regular updates to your central hub:**

```typescript
// server/hubReporter.ts
import fetch from 'node-fetch';

const HUB_URL = process.env.CENTRAL_HUB_URL || 'https://liturgy-ops.yourdomain.com';
const CHURCH_ID = process.env.CHURCH_ID; // Unique per installation
const HUB_API_KEY = process.env.HUB_API_KEY; // Secure authentication

interface Metrics {
  timestamp: Date;
  churchId: string;
  status: 'operational' | 'degraded' | 'error';
  accuracy: number;
  servicesRecorded: number;
  lastService: Date | null;
  trainingProgress: number; // 0-100%
  activeChannels: string[];
  version: string;
  uptime: number;
  errors: ErrorLog[];
}

class HubReporter {
  private interval: NodeJS.Timeout;
  
  start() {
    // Report every 5 minutes
    this.interval = setInterval(() => {
      this.sendMetrics();
    }, 5 * 60 * 1000);
    
    // Immediate first report
    this.sendMetrics();
  }
  
  async sendMetrics() {
    const metrics: Metrics = {
      timestamp: new Date(),
      churchId: CHURCH_ID,
      status: this.getStatus(),
      accuracy: await this.getAccuracy(),
      servicesRecorded: await this.getServiceCount(),
      lastService: await this.getLastServiceDate(),
      trainingProgress: await this.getTrainingProgress(),
      activeChannels: this.getActiveChannels(),
      version: this.getBotVersion(),
      uptime: process.uptime(),
      errors: await this.getRecentErrors()
    };
    
    try {
      await fetch(`${HUB_URL}/api/metrics/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HUB_API_KEY}`
        },
        body: JSON.stringify(metrics)
      });
    } catch (err) {
      // Log locally if hub unreachable
      console.error('Failed to report to hub:', err);
    }
  }
  
  // Alert on critical issues
  async sendAlert(severity: 'info' | 'warning' | 'critical', message: string) {
    await fetch(`${HUB_URL}/api/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUB_API_KEY}`
      },
      body: JSON.stringify({
        churchId: CHURCH_ID,
        severity,
        message,
        timestamp: new Date()
      })
    });
  }
}

export const hubReporter = new HubReporter();
```

---

## 📊 Central Operations Dashboard

### Your Control Center UI

```typescript
// ops-dashboard/src/pages/Dashboard.tsx

interface Church {
  id: string;
  name: string;
  location: string;
  status: 'operational' | 'degraded' | 'error';
  accuracy: number;
  servicesRecorded: number;
  lastService: Date;
  trainingProgress: number;
  version: string;
  uptime: number;
  activeChannels: string[];
}

export default function OperationsDashboard() {
  const churches = useChurches(); // Real-time data
  
  return (
    <div>
      <h1>Liturgy Turner Operations</h1>
      
      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <h3>Total Churches</h3>
          <p className="text-3xl">{churches.length}</p>
        </Card>
        <Card>
          <h3>Avg Accuracy</h3>
          <p className="text-3xl">{avgAccuracy}%</p>
        </Card>
        <Card>
          <h3>Active Services</h3>
          <p className="text-3xl">{activeCount}</p>
        </Card>
        <Card>
          <h3>Alerts</h3>
          <p className="text-3xl text-red-500">{alertCount}</p>
        </Card>
      </div>
      
      {/* Church List */}
      <div className="mt-8">
        <h2>All Churches</h2>
        <table>
          <thead>
            <tr>
              <th>Church</th>
              <th>Status</th>
              <th>Accuracy</th>
              <th>Services</th>
              <th>Training</th>
              <th>Version</th>
              <th>Channels</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {churches.map(church => (
              <tr key={church.id}>
                <td>{church.name}</td>
                <td>
                  <StatusBadge status={church.status} />
                </td>
                <td>{church.accuracy}%</td>
                <td>{church.servicesRecorded}</td>
                <td>
                  <ProgressBar value={church.trainingProgress} />
                </td>
                <td>
                  {church.version}
                  {isOutdated(church.version) && (
                    <Badge>Update Available</Badge>
                  )}
                </td>
                <td>
                  {church.activeChannels.map(ch => (
                    <Icon key={ch} name={ch} />
                  ))}
                </td>
                <td>
                  <Button onClick={() => viewDetails(church.id)}>
                    View
                  </Button>
                  <Button onClick={() => pushUpdate(church.id)}>
                    Update
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Analytics */}
      <div className="mt-8">
        <h2>Performance Trends</h2>
        <LineChart data={performanceData} />
      </div>
    </div>
  );
}
```

---

## 🔄 Auto-Update System

### Push Updates to All Churches

```typescript
// ops-dashboard/src/services/updateManager.ts

interface UpdatePackage {
  version: string;
  changes: string[];
  botUpdates?: boolean;
  appUpdates?: boolean;
  databaseMigrations?: boolean;
}

class UpdateManager {
  // Push update to specific church
  async updateChurch(churchId: string, version: string) {
    // Send command to church's bot
    await fetch(`${getChurchUrl(churchId)}/api/admin/update`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'X-Hub-Signature': this.signRequest()
      },
      body: JSON.stringify({
        version,
        source: HUB_UPDATE_URL
      })
    });
  }
  
  // Push to all churches
  async updateAll(version: string, options: UpdateOptions) {
    const churches = await this.getAllChurches();
    
    // Staggered rollout (one at a time, monitor)
    for (const church of churches) {
      console.log(`Updating ${church.name}...`);
      
      try {
        await this.updateChurch(church.id, version);
        
        // Wait for confirmation
        await this.waitForUpdate(church.id, 5 * 60 * 1000); // 5 min timeout
        
        console.log(`✅ ${church.name} updated successfully`);
        
        // Brief pause before next church
        await sleep(30000); // 30 seconds
        
      } catch (err) {
        console.error(`❌ ${church.name} update failed:`, err);
        
        if (options.stopOnError) {
          throw new Error(`Update halted at ${church.name}`);
        }
      }
    }
  }
  
  // Rollback if something goes wrong
  async rollback(churchId: string, previousVersion: string) {
    await this.updateChurch(churchId, previousVersion);
  }
}
```

### Church-Side Update Handler

```typescript
// server/routes.ts - Each church has this endpoint

app.post('/api/admin/update', requireAdminAuth, async (req, res) => {
  const { version, source } = req.body;
  
  // Verify request is from central hub
  if (!verifyHubSignature(req)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  // Log update request
  logAdminAction('update_requested', { version });
  
  // Download and apply update
  try {
    // 1. Download update package
    await downloadUpdate(source, version);
    
    // 2. Backup current version
    await backupCurrentVersion();
    
    // 3. Apply update
    await applyUpdate(version);
    
    // 4. Run migrations if needed
    await runMigrations(version);
    
    // 5. Restart services
    await restartServices();
    
    res.json({ 
      success: true, 
      version,
      timestamp: new Date()
    });
    
  } catch (err) {
    // Rollback on failure
    await rollbackUpdate();
    
    res.status(500).json({ 
      error: 'Update failed', 
      message: err.message 
    });
  }
});
```

---

## 📈 Analytics & Monitoring

### Metrics Collected

**Per Church:**
```typescript
interface ChurchMetrics {
  // Training Performance
  accuracy: {
    current: number;
    trend: number[]; // Last 30 days
    byPage: number[]; // Which pages are hardest
  };
  
  // Usage Stats
  services: {
    total: number;
    lastServiceDate: Date;
    avgDuration: number;
    manualInterventions: number;
  };
  
  // Channel Activity
  channels: {
    telegram: { messageCount: number, activeUsers: number },
    whatsapp: { messageCount: number, activeUsers: number },
    discord: { messageCount: number, activeUsers: number },
    web: { sessionCount: number, avgSessionLength: number }
  };
  
  // Technical Health
  system: {
    uptime: number;
    errorRate: number;
    avgResponseTime: number;
    storageUsed: number;
  };
  
  // Training Progress
  training: {
    servicesRecorded: number;
    fingerprintsCollected: number;
    modelConfidence: number;
    readyForAutonomous: boolean;
  };
}
```

**Aggregated (All Churches):**
```typescript
interface AggregateMetrics {
  totalChurches: number;
  avgAccuracy: number;
  totalServices: number;
  
  // Best practices identification
  topPerformers: Church[];
  strugglingChurches: Church[];
  
  // Feature adoption
  channelUsage: {
    telegram: number;
    whatsapp: number;
    discord: number;
    web: number;
  };
  
  // Training insights
  avgTimeToAutonomous: number; // Services needed
  commonIssues: Issue[];
  
  // Version distribution
  versions: {
    [version: string]: number; // How many on each version
  };
}
```

---

## 🚨 Alert System

### Automatic Alerts to You

```typescript
interface Alert {
  severity: 'info' | 'warning' | 'critical';
  churchId: string;
  type: 'accuracy_drop' | 'service_error' | 'offline' | 'update_failed';
  message: string;
  timestamp: Date;
}

// Examples:
const alerts = [
  {
    severity: 'critical',
    churchId: 'st-gregory',
    type: 'accuracy_drop',
    message: 'Accuracy dropped from 95% to 72% in last service',
    timestamp: new Date()
  },
  {
    severity: 'warning',
    churchId: 'holy-cross',
    type: 'offline',
    message: 'No heartbeat received in 30 minutes',
    timestamp: new Date()
  }
];

// Alerts sent via:
- Email
- SMS (Twilio)
- Telegram (to your founder account)
- Dashboard notification
```

---

## 🔐 Security & Access Control

### Multi-Tier Access

```typescript
enum AccessLevel {
  FOUNDER = 'founder',          // You - full access to all churches
  CHURCH_ADMIN = 'church_admin', // Church staff - their church only
  OPERATOR = 'operator',         // Service operator - limited actions
  VIEWER = 'viewer'             // Read-only
}

// Your central hub login gives you FOUNDER access
// Each church has local CHURCH_ADMIN accounts
// Operators only during services
```

---

## 🏁 Deployment Architecture

### Installation Package

```bash
# Church receives:
liturgy-turner-v1.0.0.zip
├── docker-compose.yml
├── .env.example
├── install.sh
├── agent/
│   ├── clawdbot.json5.example
│   ├── knowledge/
│   │   ├── base-liturgy.json
│   │   └── aggregated-learnings.json
│   └── skills/
└── docs/
    └── setup-guide.md

# During installation:
./install.sh --church-id="st-gregory-pasadena" \
             --hub-url="https://liturgy-ops.yourdomain.com" \
             --admin-email="admin@stgregory.church"

# Script:
1. Generates unique CHURCH_ID
2. Generates HUB_API_KEY (for reporting)
3. Configures docker-compose with IDs
4. Creates bot accounts (Telegram, WhatsApp, Discord)
5. Starts containers
6. Sends first heartbeat to your hub
7. Shows completion screen with access links
```

---

## 📊 Implementation Phases

### Phase 1: Multi-Channel Support (1 week)

**Tasks:**
- Enable Telegram (✅ already working)
- Add WhatsApp support
- Add Discord support
- Fix web chat (Bot.tsx URL)
- Test all channels simultaneously

**Result:** One bot, 4 interfaces

---

### Phase 2: Central Hub (2 weeks)

**Tasks:**
- Build operations dashboard
- Implement heartbeat system
- Create metrics reporter (church-side)
- Set up analytics database
- Build alert system

**Result:** You can see all churches

---

### Phase 3: Auto-Update System (1 week)

**Tasks:**
- Build update manager
- Implement version tracking
- Create update endpoints (church-side)
- Test staggered rollout
- Add rollback capability

**Result:** Push updates to all churches

---

### Phase 4: Advanced Analytics (ongoing)

**Tasks:**
- Performance dashboards
- Trend analysis
- Best practice identification
- Automated recommendations

**Result:** Data-driven improvements

---

## 💰 SaaS Business Model Impact

### Pricing Tiers

**Starter** ($99/month)
- Single channel (Telegram OR web)
- Basic support
- Manual updates

**Professional** ($199/month) ← Recommended
- All channels (Telegram + WhatsApp + Discord + Web)
- Priority support
- Auto-updates
- Analytics dashboard
- Central monitoring

**Enterprise** (Custom)
- Multi-location (archdiocese)
- White-label option
- Dedicated support
- Custom integrations

---

## 🎯 SUMMARY

### Your Questions Answered

**Q: Should all channels work at the same time?**
**A:** ✅ YES - One bot, multiple interfaces. Church chooses what they want.

**Q: How do I monitor progress?**
**A:** Central operations dashboard showing all churches real-time.

**Q: How do I push updates?**
**A:** Update manager with staggered rollout + rollback capability.

**Q: How do I get analytics?**
**A:** Each bot reports metrics to hub every 5 minutes. Aggregated analytics dashboard.

---

## 🚀 IMMEDIATE NEXT STEPS

**This Week:**
1. ✅ Fix Bot.tsx for web chat
2. ✅ Enable WhatsApp channel
3. ✅ Enable Discord channel
4. ✅ Test multi-channel simultaneously

**Next 2 Weeks:**
1. Build basic operations dashboard
2. Implement heartbeat system
3. Add metrics reporting

**Ship Date:** 3 weeks from now with full monitoring!

---

**Want me to start with multi-channel configuration?** 🚀
