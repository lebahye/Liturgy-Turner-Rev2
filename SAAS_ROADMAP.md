# SAAS Roadmap - Future Vision

**Status:** Placeholder / Future Development  
**Priority:** After production validation  
**Last Updated:** 2026-02-20

---

## 🎯 Vision: Multi-Church SAAS Platform

### What We're Building Toward
A turnkey liturgy page-turning system that churches can subscribe to with minimal setup.

### Pricing Tiers (Planned)
- **Starter ($49/month):** 1 church, self-service onboarding, 95% accuracy
- **Professional ($149/month):** Up to 5 churches, white-glove onboarding, 97% accuracy
- **Enterprise ($499/month):** Unlimited churches, custom training, 99% accuracy

---

## 🚧 Current Status: Pre-Production

### What We Have Today
✅ Local-first system (works offline)  
✅ Docker deployment (easy install)  
✅ Training from corrections (learning system)  
✅ Real-time audio processing (Whisper + fuzzy matching)  
✅ Sequential logic foundation (page order constraints)  

### What We're Missing for SAAS
❌ 90% accuracy validation (needs real church testing)  
❌ Metrics dashboard (visualize performance)  
❌ Multi-tenant architecture (1 church → many churches)  
❌ Automated onboarding (currently manual)  
❌ Billing/subscription system  
❌ Customer support infrastructure  

---

## 📊 Critical Path to SAAS

### Phase 1: Validate Core Technology (Current)
**Goal:** Prove the approach works  
**Timeline:** Next 2-4 weeks  
**Success Criteria:**
- [ ] Deploy at one church
- [ ] Achieve 90%+ accuracy in real service
- [ ] Collect 3-5 full service recordings
- [ ] Document all edge cases and failures
- [ ] Validate Whisper + fuzzy matching approach

**Why this matters:** Can't sell a product that doesn't work reliably.

---

### Phase 2: Production Hardening (After Phase 1)
**Goal:** Make it bulletproof for one church  
**Timeline:** 2-3 weeks after Phase 1  
**Tasks:**
- [ ] Build metrics dashboard
- [ ] Add audio quality pre-validation
- [ ] Enhance confidence scoring with sequential logic
- [ ] Create backup/restore system
- [ ] Write operator training materials
- [ ] Document troubleshooting procedures

**Why this matters:** Need proven reliability before scaling.

---

### Phase 3: Multi-Church Foundation (After Phase 2)
**Goal:** Prepare for 2-3 beta churches  
**Timeline:** 1-2 months after Phase 2  
**Tasks:**
- [ ] Multi-tenant database schema
- [ ] Church-specific configuration system
- [ ] Centralized training data storage (optional)
- [ ] Remote monitoring/diagnostics
- [ ] Automated installation process
- [ ] Beta program onboarding flow

**Why this matters:** Learn scaling issues with small group before going wide.

---

### Phase 4: SAAS Platform (6-12 months out)
**Goal:** Full commercial product  
**Tasks:**
- [ ] Billing/subscription system (Stripe)
- [ ] Self-service onboarding portal
- [ ] Customer dashboard (metrics, settings, support)
- [ ] Automated training pipeline
- [ ] Fleet-wide analytics
- [ ] Multi-language support (Armenian dialects, English, Coptic?)
- [ ] Mobile app (iOS/Android) for remote control
- [ ] Community features (shared training data, forums)

**Why this matters:** This is the actual SAAS business.

---

## 🎓 Skills Needed (Future)

### When We Get to Phase 3+
These are the skills the liturgy bot proposed that make sense **later**:

#### 1. **Church Onboarding Automation**
**When:** Phase 3  
**Why:** Onboarding 10+ churches manually doesn't scale  
**What it does:**
- Upload audio → automatic analysis → production-ready database
- Quality validation → confidence report → ready/not-ready decision
- Problem page identification → recommendations

#### 2. **Multi-Church Learning**
**When:** Phase 4  
**Why:** After we have 10+ churches with good data  
**What it does:**
- Cross-church pattern recognition
- Universal variance modeling
- Zero-shot learning for new churches (70% accuracy immediately)

#### 3. **SAAS Analytics & Management**
**When:** Phase 4  
**Why:** Need business intelligence and customer success tools  
**What it does:**
- Per-church performance tracking
- Fleet-wide trends
- Customer health scoring
- Automated alerts for failing systems

#### 4. **Real-Time Streaming (Enhanced)**
**When:** Phase 3-4  
**Why:** Lower latency, better reliability  
**What it improves:**
- WebSocket-based page updates (not HTTP polling)
- Sub-500ms latency (currently ~1-2s)
- Graceful handling of network issues
- Multi-device sync

---

## 💰 Business Model Assumptions

### Target Market
- **Total Armenian churches in US:** ~150
- **Total worldwide:** ~500-1000
- **Market penetration goal:** 20% (100-200 churches)

### Revenue Projections (Optimistic)
- **Year 1:** 10 churches × $49/mo = $5,880/year
- **Year 2:** 50 churches × avg $75/mo = $45,000/year
- **Year 3:** 150 churches × avg $100/mo = $180,000/year

### Cost Structure
- **Development:** Your time (sweat equity)
- **Infrastructure:** $50-200/month (cloud hosting, APIs)
- **Support:** 5-10 hours/week initially
- **Marketing:** Organic (word of mouth in Armenian church community)

---

## 🚨 Known Risks

### Technical Risks
- **Whisper accuracy:** What if 90% isn't achievable with current approach?
- **Acoustic variance:** Churches have wildly different acoustics
- **Network reliability:** Rural churches may have poor internet
- **Hardware requirements:** Some churches have old computers

### Business Risks
- **Adoption:** Will churches pay for this?
- **Competition:** Someone else builds it first
- **Support burden:** Can't scale support with revenue
- **Technology shift:** Better AI models make our approach obsolete

### Mitigation Strategies
- **Start local-first:** Works offline, reduces risk
- **Beta program:** Get early feedback, validate willingness to pay
- **Document everything:** Reduce support burden through self-service
- **Stay modular:** Easy to swap out Whisper for better models

---

## 📝 Notes from Liturgy Bot Review

### What the Bot Got Wrong
The bot proposed building SAAS features **before validating the core technology**. This is backwards.

**Premature optimizations:**
- Multi-church learning (no churches yet!)
- Automated onboarding (manual works fine for 1-5 churches)
- Fleet analytics (no fleet yet!)
- Real-time streaming enhancements (current system is fine for MVP)

### What the Bot Got Right
The vision is sound:
- ✅ Churches need this (real problem)
- ✅ SAAS model makes sense (recurring revenue)
- ✅ Automated training is key (reduce onboarding time)
- ✅ Analytics are valuable (customer success)

**But the sequencing was wrong.** Build, validate, then scale.

---

## 🎯 Current Focus: Get to Production First

### Immediate Next Steps (This Week)
1. ✅ **Audio quality validator** - Add to liturgy-audio-controller
2. ✅ **Enhanced confidence scoring** - Sequential logic + impossible jump detection
3. 🔨 **Testing scripts** - Validate dictionary, test full service simulation
4. 🔨 **Metrics dashboard** - React UI to visualize performance
5. 🔨 **Training data collection** - Record services with ground truth

### Success Looks Like
- One church using the system successfully
- 90%+ accuracy in real services
- Documented setup process (proven to work)
- Known edge cases and workarounds
- Confidence that the approach scales

**Then we talk SAAS.**

---

## 🔄 Review Schedule

- **Monthly:** Review this roadmap, update based on learnings
- **After Phase 1:** Major revision based on real-world data
- **Quarterly:** Re-evaluate business model and timeline

---

**Bottom Line:** SAAS is the goal, but production validation is the priority. Don't build the factory until you've proven the prototype works.

---

*This file is a living document. Update it as we learn.*
