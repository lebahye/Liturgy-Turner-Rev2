# Testing Checklist (Training + Live + TV Display)

## A) Basic app health
- [ ] `npm run check`
- [ ] `npm run build`
- [ ] `npm run db:migrate`
- [ ] `npm run dev:lan`
- [ ] `bash script/smoke.sh`

## B) PDF + TV display sync
- [ ] Open app on Windows: `http://localhost:5000`
- [ ] Open `/display` on TV/iPad: `http://<LAN_IP>:5000/display`
- [ ] Upload Badarak PDF (Home)
- [ ] Confirm total pages loads in UI
- [ ] Click next/prev page in Training or Live
- [ ] Confirm TV updates instantly

## C) Training session capture (manual page turns)
- [ ] Go to Training
- [ ] Start recording
- [ ] Play liturgy audio externally
- [ ] Use **Mark Turn** as you manually turn pages
- [ ] Stop recording
- [ ] Save session with a clear name
- [ ] Confirm no errors

## D) Fingerprint aggregation
- [ ] After save, verify merge ran (toast: “Saved & Merged”)
- [ ] Check `/api/training-stats?pdfId=<id>` (or use UI)
- [ ] Repeat another training run and confirm confidence/sessionCount increase

## E) Dictionary import (CSV/XLSX)
- [ ] Import dictionary file (API: `POST /api/import-dictionary`)
- [ ] Verify count: `GET /api/dictionary-words?pdfId=manual_dictionary`

## F) Live mode
- [ ] Go to Live
- [ ] Confirm it loads aggregated fingerprints for current PDF (preferred)
- [ ] Run in fingerprint mode
- [ ] Ensure manual override buttons work

