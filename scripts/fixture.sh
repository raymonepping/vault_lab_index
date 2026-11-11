#!/usr/bin/env bash
# scripts/fixture.sh start|stop: the controller on fixture labs (fake make
# and podman, port 18811) and the UI build on the host (port 18810). For UI
# work and `make test-ui`; it never touches a real lab.
set -euo pipefail
cd "$(dirname "$0")/.."
FIX=.build/fixtures
RUN=.build/fixture-run
mkdir -p "$RUN" && chmod 700 "$RUN"

stop_pid() { # stop_pid <file> <command fragment>
  local f=$1 pid
  [[ -f $f ]] || return 0
  pid=$(cat "$f")
  if /bin/ps -p "$pid" -o command= 2>/dev/null | grep -F -- "$2" >/dev/null; then kill "$pid"; fi
  rm -f "$f"
}

case "${1:-}" in
start)
  "$0" stop
  node -e "import('./controller/test/fixtures.js').then(f => { const o = f.makeLabs('$FIX/labs'); require('node:fs').writeFileSync('$FIX/prefixes.json', JSON.stringify(o.overrides)); })"
  PATH="$PWD/controller/test/bin:$PATH" VLIX_LABS_ROOT="$FIX/labs" VLIX_PREFIXES="$FIX/prefixes.json" \
    VLIX_RUN_DIR="$RUN" VLIX_CONTROLLER_PORT=18811 VLIX_REFRESH_S="${VLIX_REFRESH_S:-15}" FAKE_MAKE_MS="${FAKE_MAKE_MS:-3000}" \
    nohup node controller/server.js >"$RUN/controller.log" 2>&1 &
  echo $! >"$RUN/controller.pid"
  for _ in $(seq 50); do curl -sf 127.0.0.1:18811/healthz >/dev/null && break; sleep 0.1; done
  VLIX_CONTROLLER_URL=http://127.0.0.1:18811 VLIX_TOKEN_FILE="$PWD/$RUN/token/controller.token" PORT=18810 HOST=127.0.0.1 \
    VLIX_ALLOWED_HOSTS=127.0.0.1:18810,localhost:18810 \
    nohup node ui/.output/server/index.mjs >"$RUN/ui.log" 2>&1 &
  echo $! >"$RUN/ui.pid"
  for _ in $(seq 50); do curl -sf 127.0.0.1:18810/healthz >/dev/null && break; sleep 0.1; done
  curl -sf 127.0.0.1:18810/healthz >/dev/null || { echo "fixture UI did not start; see $RUN/ui.log" >&2; exit 1; }
  echo "fixture dashboard: http://127.0.0.1:18810"
  ;;
stop)
  stop_pid "$RUN/ui.pid" ui/.output/server/index.mjs
  stop_pid "$RUN/controller.pid" controller/server.js
  ;;
*) echo "usage: $0 start|stop" >&2; exit 64 ;;
esac
