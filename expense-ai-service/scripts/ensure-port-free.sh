#!/usr/bin/env bash
# ensure-port-free.sh — Kill any stale process holding the service port.
# Called by systemd ExecStartPre to prevent EADDRINUSE on restart.

PORT="${1:-3001}"

PID=$(ss -tlnp "sport = :${PORT}" 2>/dev/null | awk 'NR>1{match($0, /pid=([0-9]+)/, a); if(a[1]) print a[1]}' | head -1)

if [ -z "$PID" ]; then
  echo "[ensure-port-free] Port ${PORT} is free"
  exit 0
fi

echo "[ensure-port-free] Port ${PORT} held by PID ${PID}, sending SIGTERM..."
kill "$PID" 2>/dev/null

# Wait up to 5 seconds for graceful exit
for i in $(seq 1 10); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "[ensure-port-free] PID ${PID} exited"
    exit 0
  fi
  sleep 0.5
done

# Force kill if still alive
echo "[ensure-port-free] PID ${PID} did not exit, sending SIGKILL..."
kill -9 "$PID" 2>/dev/null
sleep 1

if kill -0 "$PID" 2>/dev/null; then
  echo "[ensure-port-free] ERROR: Could not kill PID ${PID}" >&2
  exit 1
fi

echo "[ensure-port-free] PID ${PID} force-killed"
exit 0
