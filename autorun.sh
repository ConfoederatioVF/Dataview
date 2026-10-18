#!/usr/bin/env bash
# ===================================================
#           Dataview Webviewer Launcher (Bash)
# ===================================================
set -e
export NODE_OPTIONS="--max-old-space-size=16384"

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not found in PATH."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[INFO] node_modules not found. Installing dependencies..."
  npm install
fi

MODE="${1:-dev}"
if [ "$MODE" = "preview" ] || [ "$MODE" = "prod" ]; then
  npm run preview
elif [ "$MODE" = "build" ]; then
  npm run build
  npm run preview
else
  npm run dev
fi
