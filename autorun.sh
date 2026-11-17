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
SUPERVISOR_RESTARTS=0
MAX_SUPERVISOR_RESTARTS=5

stop_shell_loop=0
trap 'stop_shell_loop=1' INT TERM HUP

for ((i = 0; i < 1000000; i++)); do
  node --no-warnings "./core/server/AutorunSupervisor.ts" "${SUPERVISOR_ARGS[@]}"
  SUPERVISOR_EXIT=$?

  should_recover=0
  if [ "$stop_shell_loop" -eq 0 ]; then
    if [ "$SUPERVISOR_EXIT" -eq 75 ] || [ "$SUPERVISOR_EXIT" -eq 3 ] || [ "$SUPERVISOR_EXIT" -eq 134 ] || [ "$SUPERVISOR_EXIT" -eq 139 ]; then
      should_recover=1
    fi
  fi

  if [ "$should_recover" -eq 0 ]; then
    if [ "$SUPERVISOR_EXIT" -ne 0 ] && [ -f "autorun.lock.local" ]; then
      node --no-warnings "./core/server/AutorunSupervisor.ts" --cleanup-orphan >/dev/null 2>&1 || true
    fi
    exit "$SUPERVISOR_EXIT"
  fi

  SUPERVISOR_RESTARTS=$((SUPERVISOR_RESTARTS + 1))
  if [ "$SUPERVISOR_RESTARTS" -gt "$MAX_SUPERVISOR_RESTARTS" ]; then
    echo ""
    echo "[ERROR] Supervisor exceeded maximum crash recovery attempts (${MAX_SUPERVISOR_RESTARTS}). Stopping."
    if [ -f "autorun.lock.local" ]; then
      node --no-warnings "./core/server/AutorunSupervisor.ts" --cleanup-orphan >/dev/null 2>&1 || true
    fi
    exit "$SUPERVISOR_EXIT"
  fi

  echo ""
  echo "==================================================="
  echo "[WARN] Supervisor process exited unexpectedly (code ${SUPERVISOR_EXIT})."
  echo "[INFO] Auto-recovering persistent supervisor (${SUPERVISOR_RESTARTS}/${MAX_SUPERVISOR_RESTARTS}) in 2 seconds..."
  echo "==================================================="
  SUPERVISOR_ARGS=("--resume")
  sleep 2
done
