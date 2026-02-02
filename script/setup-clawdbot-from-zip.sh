#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ZIP="${1:-clawdbot-main.zip}"
VENDOR_DIR="$ROOT_DIR/vendor"
DEST="$VENDOR_DIR/clawdbot-main"

if [ ! -f "$ZIP" ]; then
  echo "Missing $ZIP" >&2
  exit 1
fi

mkdir -p "$VENDOR_DIR"

echo "==> Cleaning old vendor folder"
rm -rf "$DEST"

echo "==> Extracting $ZIP -> $DEST"
ZIP="$ZIP" DEST="$DEST" python3 - <<'PY'
import zipfile, os, shutil, tempfile
zip_path=os.environ['ZIP']
dest=os.environ['DEST']
parent=os.path.dirname(dest)

# Extract into a temp dir to avoid clobbering dest (and to handle same-name top folder)
tmpdir=tempfile.mkdtemp(prefix='clawdbot_extract_', dir=parent)
try:
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(tmpdir)

    src=os.path.join(tmpdir, 'clawdbot-main')
    if not os.path.isdir(src):
        # fall back: first top-level dir
        entries=[e for e in os.listdir(tmpdir) if os.path.isdir(os.path.join(tmpdir,e))]
        raise SystemExit(f"Expected clawdbot-main/ not found in zip extract. Top dirs: {entries}")

    shutil.rmtree(dest, ignore_errors=True)
    os.rename(src, dest)
    print('Extracted to', dest)
finally:
    shutil.rmtree(tmpdir, ignore_errors=True)
PY

echo "==> Installing clawdbot deps (this may take a bit)"
cd "$DEST"
# Use npm ci when lockfile exists
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Building clawdbot"
npm run build

echo "==> Done. You can run:"
echo "  node $DEST/dist/entry.js --help"
