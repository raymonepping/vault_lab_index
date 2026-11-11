#!/usr/bin/env bash
# scripts/wait-healthy.sh <vlix-container> <seconds>: wait on its health state.
set -euo pipefail
name=$1 limit=$2
[[ $name == vlix-* ]] || { echo "refusing: $name is not a vlix- container" >&2; exit 64; }
for ((i = 0; i < limit * 2; i++)); do
  state=$(podman inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo missing)
  [[ $state == healthy ]] && { echo "$name: healthy"; exit 0; }
  sleep 0.5
done
echo "$name: $state after ${limit} s; see make logs" >&2
exit 1
