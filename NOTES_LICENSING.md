# Licensing Notes (v1+ roadmap)

## Decisions from user (2026-02-02)
- Deployment: local Windows PC + WSL2 Ubuntu.
- Clawdbot install: Option A (install via npm in WSL; keep project-local config/skill in repo).
- Business requirement: lock down automation/remote control if no payment.
  - When unpaid: allow manual page turning + TV /display to still work.
  - License verification: always-online required.
- Licensing provider: Stripe (details to implement later).

## Deferred details (later)
- How to bind license to installation (machine fingerprint vs installation ID, etc.).
- Stripe integration specifics:
  - Checkout/payment link flow
  - Webhook handling
  - Local verification strategy (always-online)
  - Customer portal / renewal

