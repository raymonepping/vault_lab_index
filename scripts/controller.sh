#!/usr/bin/env bash
# scripts/controller.sh start|stop|status: the host controller (prompt 03).
# Its pid lives in .build/run/controller.pid; a pid is trusted only while its
# command line is still this controller (macOS reuses pids).
set -euo pipefail
umask 077 # pid, log and token are private to this user
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
RUN=.build/run
PID=$RUN/controller.pid
LOG=$RUN/controller.log
port=$(sed -n 's/^VLIX_CONTROLLER_PORT=//p' config/defaults.conf)
if [[ -s .env ]]; then over=$(sed -n 's/^VLIX_CONTROLLER_PORT=//p' .env); port=${over:-$port}; fi

ours() { # ours <pid>: is it this project's controller?
  local cmd
  cmd=$(/bin/ps -p "$1" -o command= 2>/dev/null) || return 1
  [[ $cmd == *"$root/controller/server.js"* ]]
}
running_pid() {
  [[ -f $PID ]] || return 1
  local pid
  pid=$(cat "$PID")
  if ours "$pid"; then echo "$pid"; return 0; fi
  rm -f "$PID" # stale: the process is gone or is someone else's now
  return 1
}
healthy() { curl -sf --max-time 2 "http://127.0.0.1:$port/healthz" >/dev/null; }

case "${1:-}" in
start)
  if pid=$(running_pid) && healthy; then echo "controller: already running (pid $pid, 127.0.0.1:$port)"; exit 0; fi
  if healthy; then echo "controller: port $port answers but is not this controller; stop that first" >&2; exit 1; fi
  mkdir -p "$RUN" && chmod 700 "$RUN"
  nohup node "$root/controller/server.js" >>"$LOG" 2>&1 </dev/null &
  echo $! >"$PID"
  for _ in $(seq 100); do healthy && break; ours "$(cat "$PID")" || break; sleep 0.1; done
  healthy || { echo "controller: did not start; see $LOG" >&2; tail -5 "$LOG" >&2; exit 1; }
  echo "controller: running (pid $(cat "$PID"), 127.0.0.1:$port)"
  ;;
stop)
  pid=$(running_pid) || { echo "controller: not running"; exit 0; }
  kill -TERM "$pid"
  # It lets a running make finish for up to 30 s, then stops it (D11).
  for _ in $(seq 450); do ours "$pid" || break; sleep 0.1; done
  if ours "$pid"; then echo "controller: still running after 45 s (pid $pid); not killing it blindly" >&2; exit 1; fi
  rm -f "$PID"
  echo "controller: stopped"
  ;;
status)
  if pid=$(running_pid); then
    if healthy; then echo "controller: running (pid $pid, 127.0.0.1:$port, healthy)"; else echo "controller: pid $pid, not answering"; exit 1; fi
  else echo "controller: not running"; exit 3; fi
  ;;
*) echo "usage: $0 start|stop|status" >&2; exit 64 ;;
esac
