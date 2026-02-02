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
import zipfile, os, shutil
zip_path=os.environ['ZIP']
dest=os.environ['DEST']
parent=os.path.dirname(dest)

with zipfile.ZipFile(zip_path) as z:
    z.extractall(parent)

# Zip contains clawdbot-main/ at top level
src=os.path.join(parent,'clawdbot-main')
if not os.path.isdir(src):
    raise SystemExit(f"Expected folder not found after extract: {src}")

# Ensure destination is clean
shutil.rmtree(dest, ignore_errors=True)
os.rename(src, dest)
print('Extracted to', dest)
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
