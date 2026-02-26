# New Install UI Checklist (Fresh PC)

Use this checklist exactly as a new user would.

## Preconditions
- Start core stack:
  - `docker compose --profile core up -d --build`
- Open app in browser.

## 1) Dashboard loads
- [ ] Home page opens without console errors.
- [ ] Mode cards visible (Playback, Training, Live, Projection).

## 2) PDF onboarding works
- [ ] Upload a PDF from Home.
- [ ] "Active PDF File" updates to uploaded filename.
- [ ] Existing uploaded PDFs appear in selector.
- [ ] Selecting an existing PDF updates active file.

## 3) Live page PDF recovery works
- [ ] Open Live page.
- [ ] If stale path exists, app auto-recovers from control state or uploaded files.
- [ ] PDF display renders (no "PDF not found").

## 4) Dictionary build/load
- [ ] Dictionary status progresses: checking/cached/extracting/ready.
- [ ] If extraction needed, it completes without terminal intervention.
- [ ] "No pages loaded" does not persist after successful extraction.

## 5) Start/Stop UX
- [ ] Start button activates session.
- [ ] Stop button cleanly ends session.
- [ ] No blocking error if agent is unavailable (fallback path active).

## 6) Release gate
- [ ] Run `./verify-release-gate.ps1 -BaseUrl http://127.0.0.1:5000` and all checks pass.

## Pass Criteria
All sections must pass on a fresh install without manual DB/path edits in terminal.
