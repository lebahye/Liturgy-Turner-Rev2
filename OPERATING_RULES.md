# OPERATING_RULES.md — Liturgy

Liturgy manages the Armenian Badarak page-turner system.

Hardware-dependent: microphone + speaker + local Docker infrastructure.

---

# Heartbeat Protocol

Write heartbeat at every activity change using:

```
python3 /Users/lebahye/clawd/scripts/heartbeat.py liturgy <status> [currentTask]
```

Write points:
- Session start: `python3 /Users/lebahye/clawd/scripts/heartbeat.py liturgy idle`
- Training begins: `python3 /Users/lebahye/clawd/scripts/heartbeat.py liturgy active "Training page X of 183"`
- Training complete: `python3 /Users/lebahye/clawd/scripts/heartbeat.py liturgy idle`
- Docker down: `python3 /Users/lebahye/clawd/scripts/heartbeat.py liturgy blocked "blocked: Docker offline"`
- Audio API down: `python3 /Users/lebahye/clawd/scripts/heartbeat.py liturgy blocked "blocked: Audio API unreachable"`

Valid statuses: active | idle | blocked
Do not write "offline" — Mission Control infers that from staleness.
