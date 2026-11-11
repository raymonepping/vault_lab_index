# STATE

What was built, deferred and learned, per prompt. Read it first.

## Prompt 01: the host controller (2026-11-11)

Built `controller/` (Node 25 stdlib, no dependencies): `lib/discover.js`,
`lib/status.js`, `lib/runner.js`, `lib/redact.js`, `server.js`;
`config/defaults.conf`, `config/prefixes.json`. Prefix renamed to `vlix-` (D1).

- `node --test 'controller/test/*.test.js'`: 27 pass, 0 fail.
- Against the real root `..`: 14 eligible labs (11 with their own prefix,
  3 from `config/prefixes.json`), 17 excluded with reasons. No up or down
  was posted.
- No token: 401. `Origin` header with a valid token: 403.
- Token file `.build/run/controller.token` is 0600 in a 0700 dir; removed on
  SIGTERM.

Learned:

- A prefix that matches `^[a-z][a-z0-9_]*-$` has one dash, at the end, so two
  prefixes overlap only when equal. The overlap check stays for that case.
- Most READMEs open with the house motto as a blockquote; the description
  skips blockquotes and takes the first prose paragraph.
- A stopped lab keeps containers as `Exited (0)`; `podman ps` reports health
  only in the `Status` text, e.g. `Up 3 minutes (healthy)`.
- A container reaches a host server bound to 127.0.0.1 through
  `host.containers.internal`, and the server sees the remote address
  127.0.0.1 (gvproxy). Any local process can reach the controller, which is
  why every route but `/healthz` needs the token (D4).

## Prompt 02: the dashboard (2026-11-11)

Built `ui/` (Nuxt 4.6.4, Tailwind 4 only because `vault-glass.css` imports
it, `@lucide/vue`, fontsource). Nitro forwards four routes to the controller
with the token read per request; a POST needs its own `Origin` and JSON.
A Nitro plugin sets the CSP with a per-response nonce on Nuxt's scripts.
Fixture mode: `scripts/fixture.sh start` (fake `make` and `podman` in
`controller/test/bin/`, controller on 18811, UI on 18810).

- `npm --prefix ui run build`: clean. `npm --prefix ui run typecheck`: clean
  (Nuxt warns that Node 25 is unsupported; the image runs Node 24).
- Screenshots at 1440x900 and 390x844 (index, running operation, stop
  dialog): no console errors, no horizontal scroll at 390.
- Unit tests: 27 pass.

Fixed during review of the screenshots:

- Vite inlined small font subsets as `data:` URIs, which the CSP blocked:
  `build.assetsInlineLimit: 0`.
- `shell.css` is not loaded (no rail), so the topbar has its own glass rule.
- A stopped lab said "No containers" while its exited containers still
  existed: counts now include every container; the status still ignores
  exited-0 one-shots. Unhealthy containers are counted and shown amber.
- Tailwind's preflight zeroes `<dialog>` margins: the stop dialog sets
  `margin: auto` again.

## Prompt 03: Podman, Make and the controller lifecycle (2026-11-11)

Built `ui/Containerfile` (two stages from `node:24-alpine`, runtime holds
only `.output`, user `node`), `compose/app/compose.yaml` (`vlix-ui`, read-only
root, tmpfs `/tmp`, `cap_drop: ALL`, `no-new-privileges`, 256 MB,
`127.0.0.1:18800`), `scripts/compose.sh`, `scripts/controller.sh`,
`scripts/wait-healthy.sh`, and the Makefile (`help check build up status
down logs clean test test-ui verify fixture-up fixture-down`). The scaffold
demo (`index.js`, root `Containerfile` and ignore files) is gone.

- `make check RUNTIME=podman`: ok. `make RUNTIME=docker up`: refused.
- `make build`: `vlix-ui:local`, arm64, 174 MB, HEALTHCHECK kept.
- `make up`: 12.8 s from a built image; `vlix-ui` healthy, `/healthz`
  reports the controller up, 14 labs, all stopped.
- Token rotation: controller restarted alone, token fingerprint
  `d24a90ff` -> `b1243426`, the UI answered 200 without a restart.
- A second `make up`: "already running", one controller process.
- `make down`: container and network removed, controller stopped, token
  file removed, `:18801` closed. No lab was started or stopped.

Learned:

- The token lives in its own dir, `.build/run/token/`, mounted at
  `/run/vlix`: a restart writes a new file, and a single-file bind mount
  would keep serving the old one.
- A file the Mac user owns at 0600 reads fine as uid 1000 (`node`) inside the
  container on Podman machine.
- The controller is started by `make up`, so it inherits `MAKEFLAGS` and
  `MAKELEVEL`; the runner drops them (and `RUNTIME`, `VLIX_*`) from a lab's
  make.
- `npm ci` in Linux failed on a lock file updated incrementally on macOS
  (missing `@emnapi/*` optional deps); a fresh `npm install` lock fixed it.

## Prompt 04: verification, docs and the live test (2026-11-11)

Built `scripts/boundary.sh` (23 live checks on fixtures, run by `make
verify`), `e2e/` (Playwright 1.64.1 + axe, 8 tests x desktop 1440 and phone
390), README, `docs/security-model.md`, AGENTS.md and `.claude/CLAUDE.md` for
this project, `.gitignore` for the private and generated dirs.

- `make verify`: shellcheck clean, 27 unit tests, boundary 23/23, typecheck
  clean, gitleaks no leaks (one synthetic JWT marked `gitleaks:allow`).
- `make test-ui`: 16/16; axe WCAG 2.1 AA 0 violations on the index, a
  running operation, the stop dialog, a failure and offline, at both widths.
  Keyboard-only stop (Enter, Esc, Tab, Enter), reduced motion, no side
  scroll at 390.

### Live cycle (D16, vault_pipeline only)

Before: vault_pipeline stopped (13 exited containers), 13 `vpip` volumes, VM
clock equal to the Mac's. From the dashboard at `127.0.0.1:18800`:

| Step | Result |
| --- | --- |
| Start lab | `make up` succeeded in 119 s (its own count: 116 s) |
| Status | Running, 13 running, from podman; console answered 200 |
| Stop lab, confirm | `make down` succeeded in 30 s |
| Status | Stopped, 13 stopped |
| Volumes | the same 13 before and after |

Screenshots: `docs/screenshots/live-*.png`. No other lab was started or
stopped.

Fixed after the live run:

- make's ANSI colour codes showed as text: the runner strips them (test).
- vault_pipeline's `make down` prints nothing; a finished, empty log now says
  "make printed nothing." instead of "Waiting for output…".
- While an operation runs, `GET /api/labs` re-observes when the last look is
  older than 5 s, so the rack lights follow the start.
- The redactor blanked the word after `data-secrets:` in one line. Over-
  redaction is the safe side; kept.

## Prompt 05: clean rounds

### Round 1 (after b6683ae)

Reviews: ponytail-audit (1 to 7), ponytail-review (8 to 11),
backend-design audit (12), security-discipline (13).

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Dashboard had no `Host` check: DNS rebinding could pass the Origin check | `ui/server/middleware/host.ts` with `VLIX_ALLOWED_HOSTS`; 3 boundary checks |
| 2 | `make up` printed the wrong URL when `.env` set the port | `-include .env` |
| 3 | README: Starting also means a first health check | README row |
| 4 | No test caught a blocked font or script | e2e asserts no console or page errors |
| 5 | Dashboard forwarded `GET operation`, which the browser never calls | route removed; boundary check |
| 6 | README link not URL-encoded | `encodeURI` |
| 7 | `ui/.dockerignore` duplicated `.containerignore` | deleted |
| 8 | `commit_gh` published the private `article/` draft | untracked, `article/` ignored; history is the user's call |
| 9 | Boundary leak check used `grep -q` after a pipe under pipefail | body read first, then compared |
| 10 | 5 s re-observe during an operation untested | server test with an injected clock |
| 11 | README overstated who holds the token | wording matches the security model |
| 12 | Refresh failures were swallowed | `refresh_failed` events |
| 13 | Plain HTTP and no login on loopback not recorded | security model "Limits" |

The controller's Host allowlist now comes from the port it listens on, which
also removed the test's double start.

Results: `make verify` green (27 unit, boundary 26/26, typecheck, gitleaks);
`make test-ui` 16/16; `vlix-ui` rebuilt, healthy, `Host: evil.example` 400.

### Round 2 (after 343624c)

| # | Finding | Fix |
| --- | --- | --- |
| 14 | The 200-line limit was written twice (runner, test) | test imports `MAX_LINES` |
| 15 | Dead `<!--` branch in the README reader's regex | deleted |
| 16 | `make up` kept serving an old image after `ui/` changed | `.build/ui-image.stamp` depends on `ui/` sources; `clean` removes it |
| 17 | The refresh error logger was written twice | `refreshLogged()` in one place |
| 18 | The e2e console guard also hid 404s for fonts and scripts | it skips only the offline test's 503 |
| 19 | The dashboard proxy logged nothing on 502 or 503 | one JSON line (route and reason, no token, no body) |

Security pass: no new findings.

Results: `make verify` green (27 unit, boundary 26/26, typecheck, gitleaks);
`make test-ui` 16/16; `make up` rebuilt once after the `ui/` change and not
on the second run; with the controller stopped, `vlix-ui` logged
`controller_offline` (`no token file`) and answered 503; `Host:
evil.example` 400.

### Round 3 (after 746b34b)

| # | Finding | Fix |
| --- | --- | --- |
| 20 | The hero named `HashiCorp/Vault`, which the portal never reads (`VLIX_LABS_ROOT` decides) | "next to this portal" |
| 21 | Found while checking 20: the server-rendered page showed "0 Podman labs" and zero tiles until the first answer | "The Podman labs" and "–" until data arrives |

ponytail-review of 746b34b, the backend audit and the security pass: no new
findings.

Results: `make verify` green (27 unit, boundary 26/26, typecheck, gitleaks);
`make test-ui` 16/16; the rebuilt `vlix-ui` serves "The Podman labs" and "–"
before hydration.

### Round 4 (after 669c8aa)

| # | Finding | Fix |
| --- | --- | --- |
| 22 | The published `main.css` carried 11 em dashes in comments | vault_pipeline's cleaned copy (identical styles) |
| 23 | Three em dashes in `.gitignore` comments | colons |

ponytail-review of 669c8aa, the backend audit and the security pass: no
findings. No tracked file holds an em dash now.

Results: `make verify` green (27 unit, boundary 26/26, typecheck, gitleaks);
`make test-ui` 16/16 (axe 0, no console errors); `vlix-ui` rebuilt by the
stamp after the CSS change, healthy.

### Round 5 (after 625c16b): zero to-dos

ponytail-audit (whole repo), ponytail-review (625c16b), backend-design audit
and security pass: no findings. 23 findings fixed over rounds 1 to 4.

Final results: `make verify` green (shellcheck, 27 unit tests, boundary
26/26, typecheck, gitleaks no leaks); `make test-ui` 16/16 (axe WCAG 2.1 AA
0 violations at 1440 and 390, no console errors); the portal runs at
`http://127.0.0.1:18800` (`vlix-ui` healthy, controller healthy).

Open for the user: `article/One-Command-Three-Responsibilities.md` is in the
history of the public repo through b6683ae (untracked since 343624c).
Removing it from history needs a force-push.
