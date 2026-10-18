#!/usr/bin/env bash
# ===================================================
#     Dataview Distribution Builder (Bash)
# ===================================================
set -e
export NODE_OPTIONS="--max-old-space-size=16384"

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not found in PATH."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[INFO] Installing dependencies..."
  npm install
fi

echo "[INFO] Building production distribution bundle..."
npm run build
echo "[SUCCESS] Distribution bundle built in dist/"
