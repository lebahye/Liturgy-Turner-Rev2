# Pretrained DB seed

If you want the app to ship with **pretrained learning**, place a SQLite seed DB at:

- `seed/liturgy-turner.seed.db`

On first run, `script/first-run-smoke.sh` (and the recommended setup flow) can copy this seed into:

- `data/liturgy-turner.db`

Notes:
- This seed is intended to include only **learning + fingerprints + transcripts** for a specific PDF (`pdfId`).
- Do **not** include secrets or per-church private data.
- If the runtime DB already exists, the seed will not overwrite it.
