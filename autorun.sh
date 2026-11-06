#!/usr/bin/env bash
# ===================================================
#     Confoederatio Dataview Service Launcher (Bash)
# ===================================================
set -u

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not found in PATH."
  echo "Please install Node.js from https://nodejs.org/ and try again."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[INFO] node_modules directory not found. Installing dependencies..."
  if ! npm install; then
    echo "[ERROR] Failed to install dependencies."
    exit 1
  fi
fi

SUPERVISOR_ARGS=("$@")

stop_shell_loop=0
trap 'stop_shell_loop=1' INT TERM

for ((i = 0; i < 1000000; i++)); do
  node --no-warnings "./core/server/AutorunSupervisor.ts" "${SUPERVISOR_ARGS[@]}"
  SUPERVISOR_EXIT=$?

  if [ "$stop_shell_loop" -eq 1 ] || [ "$SUPERVISOR_EXIT" -eq 0 ] || [ "$SUPERVISOR_EXIT" -eq 130 ] || [ "$SUPERVISOR_EXIT" -eq 143 ]; then
    exit 0
  fi

  echo ""
  echo "==================================================="
  echo "[WARN] Supervisor process exited unexpectedly (code ${SUPERVISOR_EXIT})."
  echo "[INFO] Auto-recovering persistent supervisor in 2 seconds..."
  echo "==================================================="
  SUPERVISOR_ARGS=("--resume")
  sleep 2
done
