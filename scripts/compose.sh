#!/usr/bin/env bash
# scripts/compose.sh <stack> <compose args...>: the only way to run compose.
# One stack, `app`, as compose project vlix-app. config/defaults.conf first,
# .env second, so .env wins.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
stack=${1:-}
[[ $stack == app ]] || { echo "usage: $0 app <compose args...>" >&2; exit 64; }
shift
command -v podman >/dev/null || { echo "podman is required" >&2; exit 69; }
unset COMPOSE_FILE COMPOSE_PROFILES COMPOSE_PROJECT_NAME
envs=(--env-file "$root/config/defaults.conf")
[[ -f $root/.env && -s $root/.env ]] && envs+=(--env-file "$root/.env")
exec podman compose --project-name "vlix-$stack" --project-directory "$root/compose/$stack" \
  --file "$root/compose/$stack/compose.yaml" "${envs[@]}" "$@"
