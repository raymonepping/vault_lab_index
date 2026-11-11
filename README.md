# Lab Index

One page that lists the Podman labs next to this folder
(`~/Documents/VSC/HashiCorp/Vault`), shows whether each one runs, and starts
or stops a lab with that lab's own Makefile:

```sh
make -C <lab> up   RUNTIME=podman
make -C <lab> down RUNTIME=podman
```

Nothing else. The portal never runs `reset`, `clean`, `clean-slate`,
`destroy`, `prune` or a volume target, and it never edits a lab.

## Quick start

```sh
make check RUNTIME=podman   # podman, the machine, make, node, config
make up RUNTIME=podman      # (re)builds vlix-ui when ui/ changed, starts both parts
open http://127.0.0.1:18800
make down RUNTIME=podman    # stops the portal only; labs keep running
```

Needs: Podman with a running machine, GNU Make, Node 24 or newer on the Mac.
Resource prefix: `vlix-` (container `vlix-ui`, image `vlix-ui:local`,
compose project `vlix-app`).

| Target | Does |
| --- | --- |
| `make check` | checks the tools, the config and the controller |
| `make build` | builds `vlix-ui:local` (arm64) |
| `make up` | starts the controller on the Mac and `vlix-ui` in Podman |
| `make status` | the controller, `vlix-ui` and its image, nothing else |
| `make logs` | the controller's events and `vlix-ui`'s log |
| `make down` | stops `vlix-ui` and the controller; no lab is touched |
| `make clean` | `down`, then removes `vlix-ui:local`; no volumes, no prune |
| `make test`, `make test-ui`, `make verify` | unit tests; Playwright and axe; everything |

Every target takes `RUNTIME=podman` (the default). Any other runtime is
refused.

## How it works

Two parts, because a lab's Makefile needs the Mac's podman client, machine,
keychain and files:

- **The controller** (`controller/`, Node, no dependencies) runs on the Mac
  at `127.0.0.1:18801`. It finds the labs, asks podman about their
  containers every 15 s, and runs one `make up` or `make down` at a time.
- **The dashboard** (`ui/`, Nuxt) runs in Podman as `vlix-ui` at
  `127.0.0.1:18800`. It reaches the controller through
  `host.containers.internal`.

## Which folders are labs

The controller reads files only; it never runs `make` to find labs. A folder
next to this one is a lab when all of these hold:

1. Its `Makefile` has an explicit `up:` and `down:` target.
2. It uses Podman (compose files, or `podman` in the Makefile or
   `scripts/*.sh`) and does not mention `multipass` or `crc`.
3. It records a resource prefix: `prefix` followed by a backticked name such
   as `` `vpip-` `` in its `AGENTS.md`, `CLAUDE.md` or `.claude/CLAUDE.md`.
   A lab that records none can get one in this repo's
   `config/prefixes.json`, without touching the lab.
4. No other lab uses the same prefix.

Every other folder is listed under "not controlled here" with the reason.
To bring one in, fix that reason: add a prefix line to the lab's
`AGENTS.md` or to `config/prefixes.json`, then press Refresh.

## Reading the status

Status comes from podman, filtered by the lab's prefix. A successful
`make up` alone never makes a lab "Running".

| Status | Means |
| --- | --- |
| Running | at least one container runs, none unhealthy, none crashed |
| Stopped | no container runs (a stopped lab may keep its exited containers) |
| Starting, Stopping | the portal's `make up` or `make down` is running; Starting also while running containers pass their first health check |
| Partial | some run, and some are stopped, crashed or unhealthy |
| Failed | the last `make up` or `make down` from the portal failed |
| Unknown | podman did not answer |
| Stale (added) | the last answer is older than 30 s, or the controller is offline |

The lights on each card are its containers: green runs, amber runs
unhealthy, dim is stopped. "Need a look" counts partial, failed, stale and
unknown labs.

## Stopping keeps data

Stop runs the lab's own `make down`, which stops its containers and keeps its
volumes and state. Start it again later to pick up where it was. Stopping the
portal (`make down` here) never stops a lab; if you stop the portal while a
lab is starting, the controller lets that `make` finish for 30 s and then
stops it, which can leave the lab half up. Run its `make up` again.

## Trust boundary

See `docs/security-model.md`. In short: both parts listen on 127.0.0.1 only,
every controller call needs a token kept in a file only your user can read, which `vlix-ui`'s server adds for the browser, the
browser can ask for three things only, and the only commands the controller
can run are the two above.

## Where things are

- `controller/`: `server.js`, `lib/` (discover, status, runner, redact), `test/`
- `ui/`: the Nuxt dashboard; `ui/Containerfile`
- `compose/app/compose.yaml`, `scripts/*.sh`, `config/`
- `e2e/`: Playwright and axe against fixture labs (`make test-ui`)
- `DESIGN.md`: the look (Vault daylight glass) and the status mapping
- `docs/STATE.md`: what was built and measured
