# Makefile: Lab Index, the front door. `make help` lists every target.
# Resource prefix vlix- (container vlix-ui, image vlix-ui:local, project vlix-app).
SHELL := /bin/bash
.DEFAULT_GOAL := help
RUNTIME ?= podman
IMAGE := vlix-ui:local
-include config/defaults.conf
export NODE_IMAGE

ifneq ($(RUNTIME),podman)
$(error RUNTIME=$(RUNTIME) is not supported: this portal runs on Podman only (RUNTIME=podman))
endif

.PHONY: help check build up status down logs clean test test-ui verify fixture-up fixture-down

help: ## List the targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[1m%-13s\033[0m %s\n", $$1, $$2}'

check: ## Podman client and machine, GNU Make, Node >= 24, config, controller
	@command -v podman >/dev/null || { echo "podman is required" >&2; exit 1; }
	@podman --version
	@podman machine inspect --format '{{.State}}' 2>/dev/null | grep -qx running || { echo "the Podman machine is not running: podman machine start" >&2; exit 1; }
	@echo "podman machine: running"
	@$(MAKE) --version | head -1
	@node -e 'const v=+process.versions.node.split(".")[0]; if (v<24) { console.error("node >= 24 is required, found " + process.version); process.exit(1) } console.log("node " + process.version)'
	@test -f config/defaults.conf && test -f config/prefixes.json && node -e 'JSON.parse(require("fs").readFileSync("config/prefixes.json","utf8"))' && echo "config: ok"
	@scripts/controller.sh status || true

build: ## Build vlix-ui:local (arm64, Docker format so the HEALTHCHECK stays)
	@xattr -rc ui 2>/dev/null || true
	@COPYFILE_DISABLE=1 podman build --format docker --platform linux/arm64 --build-arg NODE_IMAGE=$(NODE_IMAGE) --tag $(IMAGE) --file ui/Containerfile ui

up: ## Start the controller (host) and vlix-ui (Podman); print the URL
	@podman image exists $(IMAGE) || $(MAKE) --no-print-directory build
	@scripts/controller.sh start
	@scripts/compose.sh app up -d
	@scripts/wait-healthy.sh vlix-ui 60
	@echo "Lab Index: http://127.0.0.1:$(VLIX_UI_PORT)"

status: ## The controller and this portal's vlix- container and image only
	@scripts/controller.sh status || true
	@podman ps -a --filter name=^vlix- --format '{{.Names}}  {{.Status}}  {{.Ports}}'
	@podman images --filter reference=vlix-ui --format '{{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}'

down: ## Stop vlix-ui and the controller; no lab is touched
	@scripts/compose.sh app down
	@scripts/controller.sh stop

logs: ## The controller's JSON events and vlix-ui's log (no make output, no token)
	@tail -n 50 .build/run/controller.log 2>/dev/null || echo "no controller log yet"
	@podman logs --tail 50 vlix-ui 2>/dev/null || echo "vlix-ui is not running"

clean: down ## Stop, then remove the vlix-ui image only (no volumes, no prune)
	@case "$(IMAGE)" in vlix-*) ;; *) echo "refusing: $(IMAGE) is not a vlix- image" >&2; exit 1 ;; esac
	@podman image rm --ignore $(IMAGE)

test: ## Controller unit tests
	@node --test 'controller/test/*.test.js'

fixture-up: ## Fixture controller (18811) and host UI (18810) with fake make and podman
	@test -f ui/.output/server/index.mjs || npm --prefix ui run build
	@scripts/fixture.sh start

fixture-down: ## Stop the fixture controller and UI
	@scripts/fixture.sh stop

test-ui: ## Playwright + axe against the fixture dashboard (the suite starts it)
	@npm --prefix ui run build >/dev/null
	@status=0; npm --prefix e2e test || status=$$?; scripts/fixture.sh stop; exit $$status

verify: ## shellcheck, unit tests, boundary checks, UI typecheck, gitleaks
	@shellcheck scripts/*.sh
	@$(MAKE) --no-print-directory test
	@scripts/boundary.sh
	@npm --prefix ui run typecheck
	@gitleaks dir --no-banner --redact . >/dev/null && echo "gitleaks: no leaks"
