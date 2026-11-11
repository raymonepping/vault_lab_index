#!/usr/bin/env bash
# scripts/boundary.sh: the API boundary, live (prompt 04). Runs against the
# fixture controller (18811) and the fixture UI (18810): fake make and podman,
# never a real lab. Starts and stops the fixtures itself.
set -euo pipefail
cd "$(dirname "$0")/.."
C=http://127.0.0.1:18811
U=http://127.0.0.1:18810
pass=0 fail=0

[[ -f ui/.output/server/index.mjs ]] || npm --prefix ui run build >/dev/null
FAKE_MAKE_MS=1500 scripts/fixture.sh start >/dev/null
trap 'scripts/fixture.sh stop' EXIT
TOKEN_FILE=.build/fixture-run/token/controller.token
auth=(-H "Authorization: Bearer $(cat "$TOKEN_FILE")")

# check <name> <expected status> <curl args...>
check() {
  local name=$1 want=$2 got
  shift 2
  got=$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$@" || true)
  if [[ $got == "$want" ]]; then pass=$((pass + 1)); printf '  ok    %-52s %s\n' "$name" "$got"
  else fail=$((fail + 1)); printf '  FAIL  %-52s %s (want %s)\n' "$name" "$got" "$want"; fi
}
post=(-X POST -H 'content-type: application/json' -d '{}')

echo "controller (127.0.0.1:18811)"
check "healthz needs no token" 200 "$C/healthz"
check "no token" 401 "$C/api/labs"
check "wrong token" 401 -H 'Authorization: Bearer wrong' "$C/api/labs"
check "token with an Origin header" 403 "${auth[@]}" -H 'Origin: http://127.0.0.1:18810' "$C/api/labs"
check "foreign Host header" 400 "${auth[@]}" -H 'Host: evil.example' "$C/api/labs"
check "dot-dot as a lab id" 404 "${auth[@]}" "${post[@]}" "$C/api/labs/../up"
check "shell metacharacters in the id" 404 "${auth[@]}" "${post[@]}" "$C/api/labs/a;b/up"
check "a target other than up or down" 404 "${auth[@]}" "${post[@]}" "$C/api/labs/alpha_lab/reset"
check "an excluded lab" 404 "${auth[@]}" "${post[@]}" "$C/api/labs/vm_lab/up"
check "a path instead of an id" 404 "${auth[@]}" "${post[@]}" "$C/api/labs/%2Ftmp/up"
check "text/plain mutation" 415 "${auth[@]}" -X POST -H 'content-type: text/plain' -d '{}' "$C/api/labs/bravo_lab/up"
check "body over 1 KiB" 413 "${auth[@]}" -X POST -H 'content-type: application/json' --data-binary "{\"x\":\"$(head -c 2000 /dev/zero | tr '\0' a)\"}" "$C/api/refresh"
check "start a stopped fixture lab" 202 "${auth[@]}" "${post[@]}" "$C/api/labs/bravo_lab/up"
check "a second operation while one runs" 409 "${auth[@]}" "${post[@]}" "$C/api/labs/alpha_lab/down"
for _ in $(seq 60); do
  # Read the body first: grep -q after a pipe under pipefail can SIGPIPE curl.
  op=$(curl -s "${auth[@]}" "$C/api/operation")
  [[ $op == *'"state":"running"'* ]] || break
  sleep 0.25
done

echo "dashboard (127.0.0.1:18810)"
check "page" 200 "$U/"
check "a POST with another Origin" 403 "${post[@]}" -H 'Origin: http://evil.example' "$U/api/refresh"
check "a POST with no Origin" 403 "${post[@]}" "$U/api/refresh"
check "a POST from its own origin" 200 "${post[@]}" -H "Origin: $U" "$U/api/refresh"
check "text/plain from its own origin" 415 -X POST -H "Origin: $U" -H 'content-type: text/plain' -d '{}' "$U/api/refresh"
check "an unknown api path" 404 "$U/api/labs/alpha_lab/reset"
check "GET on a mutation" 404 "$U/api/labs/alpha_lab/up"
check "dot-dot through the proxy" 404 "${post[@]}" -H "Origin: $U" "$U/api/labs/../up"
check "GET operation is not forwarded" 404 "$U/api/operation"
check "another Host (DNS rebinding)" 400 -H 'Host: evil.example:18810' "$U/api/labs"
check "a rebinding POST with matching Origin" 400 "${post[@]}" -H 'Host: evil.example:18810' -H 'Origin: http://evil.example:18810' "$U/api/labs/bravo_lab/down"

token=$(cat "$TOKEN_FILE")
leak=0
for path in / /api/labs /healthz; do
  body=$(curl -s "$U$path")
  [[ $body == *"$token"* ]] && leak=1
done
if [[ $leak == 0 ]]; then pass=$((pass + 1)); echo "  ok    the token never reaches the browser"
else fail=$((fail + 1)); echo "  FAIL  the token reached the browser"; fi

echo "boundary: $pass passed, $fail failed"
[[ $fail == 0 ]]
