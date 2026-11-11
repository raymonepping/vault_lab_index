# One Command, Three Responsibilities

<!-- markdownlint-disable MD013 MD010 -->

## I wanted one command before a demo. I ended up giving three tools clear jobs.

Five minutes before a demo, I do not want to remember which machine starts first, which token has just been minted, or whether the Vault API is ready for Terraform. I want to run one command and know whether the room is ready.

```bash
make lab
```

That wish started as a practical irritation. The command is short; the chain behind it is not. Machines have to exist. Their operating systems need configuring. Vault needs certificates, a licence, storage, initialisation and an unseal path. Only then can I configure the namespaces, policies and secrets engines that the demonstration is about.

One dependency in the middle drives most of the design. Terraform cannot configure a Vault API that has not been initialised, and the token it needs does not exist until bootstrap has created it. Putting everything in one file does not remove that dependency. Giving each stage one clear job does.

The `golden_ticket` README eventually gave me a line for the split I had been working toward:

> **Terraform builds the house. Ansible decorates it.**

Terraform builds the machines and the structure inside Vault: VMs, inventory, Transit keys, AppRole roles, namespaces, mounts and policies. Ansible does everything that has an order and a moment: the operating system, Vault itself, initialisation and unseal, the seal agent, the front door, the people and the console. Make sits in front of both and tells me which door to open.

I started with `multi_pass`. Since then, I have used the trio in seven projects: `multi_pass`, `golden_ticket`, `shift_gear`, `vault_dance`, `vault_balancing`, `vault_codex` and `vault_pipeline`. They run on different substrates and tell very different Vault stories. The tools did not stay in neat, fixed lanes; each project made me redraw the handoff. The common thread is that I can bring the lab up, understand what happened, and recover when a step fails.

## The first labs taught me the split; the next ones made it earn its keep

The projects do not share a deployment architecture. Each one added something to the pattern.

- **`multi_pass`** — Runs on three RHEL Multipass VMs. Terraform creates the VMs, invokes Ansible, and configures Vault namespaces and mounts. Ansible handles RHEL, Vault installation, TLS, licensing, bootstrap and validation. It taught me to check Terraform state for secrets.
- **`golden_ticket`** — Runs on eight RHEL Multipass VMs. Terraform creates the VMs, inventory, baseline run, seal Transit and AppRole, and Vault structure. Ansible handles Vault, initialization and unseal, the seal agent, HAProxy, identity and console. It added one phase list, three gates and a separate Vault identity for each tool.
- **`shift_gear`** — Runs on OpenShift Local (CRC). Terraform owns the cluster contract, Kubernetes resources, Helm releases and Vault structure. Ansible prepares the platform, initializes Vault, delivers credentials, configures identity and applications, and validates the result. Its six-field substrate contract isolates CRC-specific details.
- **`vault_dance`** — Runs as Podman Compose stacks. Terraform configures the Vault platform, identity and rotation. Ansible manages Linux host accounts, sudo and SSH; Compose and shell scripts own containers and most bootstrap work. It showed me that Ansible can have a deliberately small role.
- **`vault_balancing`** — Runs as three simulated Podman sites. Terraform declares seal keys and roles, namespaces, mounts, policies, audit and token roles. Ansible initializes and seals Vault, issues scoped tokens, configures replication, and runs and validates failover. It adds a human decision, a durable fence, and measured RTO/RPO.
- **`vault_codex`** — Runs as a local Podman cluster. Terraform declares seal and platform resources, including Sentinel EGP, control group, Transform and Transit. Ansible initializes and bootstraps Vault, loads the cast and story state, then validates actors and refusals. The console tells a story while Vault enforces every answer.
- **`vault_pipeline`** — Runs local workloads and data services in Podman. Terraform declares seal and platform resources for workload identity, Transit, JWT and database access. Ansible bootstraps, creates schema and keys, loads models, delivers initial credentials and validates. Each workload has its own identity, and the caller's Vault token governs document access.

The newer labs changed the scale of the story, not the basic question. In `vault_balancing`, I wanted to see what an operator would actually do when the primary site disappeared, so I built a failover rehearsal with a durable fence and measured recovery numbers. In `vault_codex`, I made approval part of a cipher hunt: Vault decides whether the characters may proceed, including whether the requester can approve their own request. In `vault_pipeline`, I followed a document through separate workloads and made each workload prove its identity before it could handle the next step. In each one, the phase list is also a run sheet: it tells me what the audience sees and what the automation must prove behind the scene.

`vault_dance` remains a useful reminder that the three tools are not a quota. Compose owns its containers, shell scripts handle most of the Vault bootstrap, and Ansible only touches the Linux hosts whose passwords Vault rotates. `vault_crypto` goes further in the other direction: Make and Terraform are enough for its platform and cryptography rooms. I add a tool when its job exists, not to make every repository look alike.

## I wanted one front door, not one giant script

A repository can hold excellent Terraform modules and carefully written Ansible roles and still be hard to use. The missing information sits between the files. Which command runs first? Which credential must exist? Which root do I apply after bootstrap? What is safe to repeat after a failure?

I put those answers behind Make targets. The target names an operation; the script holds the checks, failure handling and evidence. In the newer projects, `make help` is a practical runbook: `make show-ready` prepares for a talk, `make doctor` reports what is wrong and how to fix it, and `make clean-slate` requires an explicit confirmation before removing project-scoped resources. The Makefile is the interface I want to remember; it does not pretend to be the logic engine.

In `golden_ticket`, the order lives in one file, `scripts/phases.txt`:

```text
# The only phase list. One phase per line: <tool> <name>.
# Read by scripts/lab.sh, idempotency.sh, drift.sh, layers.sh, the automation
# digest and the console. tf = a Terraform root, ansible = a playbook.
tf infra
ansible converge
ansible seal-init
tf seal
ansible agent
ansible bootstrap
tf platform
ansible proxy
ansible identity
ansible ux
ansible validate
```

Eleven phases, two tools, one list. `make lab` walks it, the idempotency and drift gates read it, and the console draws it. Adding a phase means adding a line here, not updating several sequences that can drift apart. If a phase fails, the script prints the exact resume command, for example `make identity && make lab`. I reused that idea in the newer labs: `vault_codex` has twelve phases, `vault_pipeline` fifteen, and `vault_balancing` adds a drill runner so an operator can advance a failover one act at a time.

Building an environment and starting an existing one are separate operations, and the targets keep them apart. `vault_dance` has `make bootstrap` for the first and `make up` for the second. In `golden_ticket`, `make lab` reconciles the platform, while `make up` starts the existing VMs, seal Vault first, and unseals.

Make gives me none of the hard guarantees: no state, no locking, no security boundary. The tools underneath have to provide those. Make gives them a consistent front door.

## I learned to let Terraform own the changes I need to review

Terraform earns its place when I want to compare declared resources with the running environment and review the difference before anything changes.

In `multi_pass`, that starts with three VMs, and a separate root later configures namespaces and mounts inside Vault. In `golden_ticket`, it includes the seal's Transit key, AppRole roles and platform policies. In `shift_gear`, it extends to Kubernetes namespaces, RBAC, Routes and Helm releases.

The roots are separate on purpose. A VM provider can do its job before Vault exists. The Vault provider needs a working API and a usable token. Separate applies let the second phase start once those prerequisites hold.

This is how `multi_pass` runs `make lab`:

```text
make lab
   |
   +-- Terraform: create VMs and publish topology
   |
   +-- Terraform Ansible provider: invoke convergence
   |      |
   |      +-- Ansible: configure RHEL, install and bootstrap Vault
   |
   +-- Validate the running cluster
   |
   +-- Terraform Vault provider: configure the platform
   |
   +-- Check plans and inspect state for known secrets
```

Terraform invokes Ansible here without becoming the playbook. The provider records the orchestration resource; Ansible does the configuration work.

## One early shortcut taught me to make reruns visible

I learned this one the frustrating way. In `multi_pass`, I changed an Ansible playbook, ran the lab again, and expected the changed content digest to trigger convergence. Nothing happened.

Its Ansible run hangs off an `ansible_playbook` resource with `replayable = false`. I passed a content digest of the playbooks in `extra_vars`, expecting a changed playbook to trigger a new run. It never did. With `replayable = false`, a changed `extra_vars` value only updates the stored attributes; only a replacement runs the playbook. The digest triggered nothing, so `make lab` in `multi_pass` forces `-replace` on every run to make sure the playbook executes.

I fixed the mechanism in `golden_ticket`. The RHEL baseline (RHSM, DNS, firewalld, chrony, SELinux, SSH trust) runs inside the same apply, because a VM is not finished until its baseline has passed. A digest of every baseline file and the node map sit in a `terraform_data` resource, and the playbook is replaced when that changes:

```hcl
resource "terraform_data" "baseline_trigger" {
  input = {
    digest = local.baseline_digest
    nodes  = local.baseline_nodes
  }
}

resource "ansible_playbook" "baseline" {
  playbook   = "${local.repo_root}/ansible/baseline.yml"
  replayable = false

  lifecycle {
    replace_triggered_by = [terraform_data.baseline_trigger]
  }
}
```

Edit a baseline file and the next plan shows the replacement. Change nothing and the plan stays empty. A playbook sitting in the repository is no evidence that today's machines ran today's version; the plan now tells me whether they did.

## Some things only become real in the right order

A running process is only part of a working Vault platform. Before the cluster can serve anything, certificates must be in place, the seal must answer, initialisation must happen exactly once, nodes must join, and credentials must reach the right consumers.

Those operations have conditions and an order. Ansible gives me a place to read the current state, decide whether a change is needed, make it and check the result.

In `golden_ticket`, the two tools take turns. Terraform creates the VMs. Ansible installs Vault and initialises the seal Vault. Terraform creates the seal's Transit key and AppRole role. Ansible configures the seal agent and bootstraps the cluster. Terraform then configures the platform, and Ansible adds the proxy, identity and console on top. `shift_gear` does the same on OpenShift in thirteen phases: five Terraform, eight Ansible.

## Then I stopped passing facts by hand

The weakest version of this arrangement copies an IP address from terminal output into an inventory file and hopes I remember to update it.

I use structured outputs instead. In `multi_pass`, the deployment root publishes the node topology, the orchestration root passes it to the playbook as typed JSON, and the playbook builds its inventory in memory. The SSH identity and host-trust files travel by path.

`shift_gear` goes further. Its infrastructure root publishes one output, and `terraform/infra/outputs.tf` opens by calling itself the substrate contract:

```hcl
# Every value below can be satisfied by any OpenShift cluster.
# No module above infra/ may reference crc, vfkit, api.crc.testing,
# or any other substrate-specific detail. Consume these outputs only.

output "cluster" {
  value = {
    api_url         = var.api_url
    apps_domain     = local.apps_domain
    pod_cidr        = local.pod_cidr
    kubeconfig_path = var.kubeconfig_path
    ingress_ca_path = local.ingress_ca_path
    registry_host   = "image-registry.openshift-image-registry.svc:5000"
  }
}
```

Everything above `terraform/infra/` reads those six fields. No application role carries a hard-coded CRC address or rediscovers the wildcard domain. That gives me an architectural test I can run with `grep`: which code knows which substrate I am on?

It also limits what I can claim. CRC is the only substrate I have run. The contract makes a ROSA or vSphere target easier to attempt; it does not prove the platform works there. Operator installation, registry access, networking and trust all need a run on the second target before I say it works.

## A folder boundary is only a suggestion; Vault can enforce it

A folder called `terraform` and another called `ansible` show where I intended to put code. Permissions decide whether the tools can cross that line.

`golden_ticket` gives each tool its own token on each Vault, four in total, each with its own policy. Terraform's seal token can configure the seal's AppRole role but must not mint a SecretID for it. Ansible's seal token can mint that SecretID but must not change the role, the Transit mount or the `autounseal` policy. On the platform cluster, Terraform can create mounts and ACL policies but cannot touch LDAP auth, identity groups or the identity secrets; Ansible can do those three and cannot create a mount.

`make boundary` asks Vault, through `sys/capabilities-self`, what each token may do on 19 specific paths. Eleven of those checks expect a refusal. That proves the policy boundary; separate live tests prove the operations themselves work.

Policy-writing rights need extra care, and `vault_dance` showed me why. Terraform's refresh failed because reading an auth mount's tune endpoint needs `sudo`, so Terraform could not fix its own policy through Terraform. The scoped `terraform` token wrote the corrected policy once with `vault policy write`, and Terraform took over from there. It worked because that token may write ACL policies, which also makes it admin-equivalent. `golden_ticket` closes that loop explicitly: every bootstrap policy denies writes to `gt-tf-*` and `gt-ansible-*`, so no tool can rewrite its own permissions.

The split differs per project. `vault_dance` puts LDAP and JWT auth configuration in its Terraform identity root, while `golden_ticket` gives LDAP auth to Ansible. I don't follow a universal rule for which tool owns auth methods. Each resource has one agreed owner in each project, and Vault refuses the other tool.

In `vault_dance`, all three meet in one break-glass command:

```text
$ make ssh HOST=rocky CMD="id; hostname"
ssh: ldap-ada reads the current password of ops-breakglass@host-rocky from Vault and logs in (port 13622)
uid=1003(ops-breakglass) gid=1001(vault-managed) groups=1001(vault-managed)
host-rocky
```

Ansible created the `ops-breakglass` account and its `vault-managed` group on the host. Terraform configured the Vault rotation that changes its password. Make gives it one name. The script reads the password with the caller's own Vault token, never one of the lab's scoped tokens, so Vault decides per person: an operator gets in, a viewer is refused before SSH starts. The password goes from Vault to `sshpass` on a file descriptor, never on screen or in a process argument, and the read lands in Vault's audit log under Ada's name.

## I also learned that a clean handoff can still leak

Node addresses, roles and certificate paths are useful handover data. Private keys, licences and bootstrap credentials need a different route.

In `multi_pass`, Terraform receives topology and paths to protected files, and the playbooks read the material they need through that private channel. Running a playbook from Terraform has a side effect, though: the playbook's stdout lands in Terraform state, and Terraform creates state files `0644`. In `golden_ticket`, every task that touches a credential is `no_log`, the Terraform wrapper forces state to `0600`, and the secret scan covers state.

Marking a value `sensitive` only hides it in output. It does not keep it out of state. Terraform's documentation separates redaction from the mechanisms that actually omit values, such as ephemeral values and write-only arguments, and which ones are available depends on the Terraform version and the provider resource. [Terraform's sensitive-data guidance](https://developer.hashicorp.com/terraform/language/manage-sensitive-data) describes the differences.

Ansible has the same problem, and `no_log` has gaps. In `golden_ticket`, a `no_log` task failed before sending its request because a variable-name collision produced a malformed URL. ansible-core 2.21 censored the task result but printed the offending value on its `[ERROR]` summary line. That value was harmless token-role metadata. The rule I took from it: never build a URL, header name or request target from a variable that could hold a secret. Secrets go only in header values and request bodies, role-prefixed variable names prevent the collision, and the secret scan reads the logs too.

So I inspect the handover and its by-products: state, logs and generated files. An ignored directory keeps material out of Git. File permissions, output handling and credential lifetimes each need their own control.

## The second run is where the story gets interesting

The first run asks whether the platform can be built. The second asks whether the automation understands what it built.

In `golden_ticket`, `make lab` runs all eleven phases and then three gates: every Ansible phase again with `changed=0`, every Terraform plan empty, and a secret scan. Only then does it write the convergence record, with the phase list, per-phase timings and a digest of the automation. The last recorded run against the eight existing VMs took 8 minutes 36 seconds. Validation alone took 57 of them.

![shift_gear's Layers page: 5 Terraform and 8 Ansible phases in run order, each with its evidence, and the four gates that must pass](./images/one-command-shift-gear-layers.png)

*`shift_gear` shows the same record in its console: every phase in `make lab` order with the tool that owns it, plus the gates. The `ux` row passes with one allow-listed change.*

Re-runs only prove re-runs, though. In `golden_ticket`, every converged re-run passed while a from-nothing rebuild failed. A handler used `systemctl try-restart`, which exits with code 5 when the unit is not installed yet. On a fresh VM, the install role's handler fired before the configure role had written the unit file. Ansible now accepts code 5 as "nothing to restart", and I rebuild from nothing before I call a lab done.

Each check proves something different:

- **Terraform plan:** Shows differences for the resources and fields the configuration and provider cover. It does not show whether an application can complete its intended operation.
- **Ansible repeat run:** Shows whether tasks report further changes on a real rerun. It does not prove their change reporting is accurate or that a fresh build works.
- **Ansible check mode:** Predicts changes for supported tasks. It can skip or misrepresent other operations.
- **Live validation:** Proves the logins, refusals and behaviours the test exercised. It says nothing about behaviour outside that test.

Ansible's documentation calls check mode a simulation. Modules without support may do nothing, and a task can force normal mode during a check-mode run. [Ansible's check-mode documentation](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html) spells out those limits. I hit them in `golden_ticket`: `keycloak_user_federation` reports a change on a realm that is already converged. Those tasks skip check mode, and the real-run idempotency gate covers them.

`shift_gear` documents its dry-run coverage for the same reason. LDAP commands, image builds, initialisation and credential repair do not get the coverage a desired-state object comparison gets, and live scenarios supply the evidence a clean dry run cannot.

## A lab is not finished when the first run turns green

A lab also has to survive ordinary use: stop it, start it, change something, recover from a failed phase and eventually remove it. Those commands deserve the same care as provisioning.

The same target name means different things per substrate. In `golden_ticket`, `make down` stops the VMs, seal Vault last. In `shift_gear`, it scales workloads down and never deletes PVCs or `.secrets/`. In `vault_dance`, it stops the Compose services and keeps their containers and volumes. The name is familiar; the `##` comment says what it does here.

Ownership applies after deployment too. In `shift_gear`, I never `oc rollout restart` a Deployment that Terraform owns, because the restart annotation shows up as drift on the next plan. I delete the pod and let the ReplicaSet replace it.

A small change in `vault_dance` shows the whole routine. Two one-shot containers prepare application volumes and render identity secrets. They are needed during startup, but their exited containers cluttered the inventory afterwards. The `up` target now removes them, and only after startup succeeds:

```make
up: ## (changes state) Start everything, then remove completed init containers (volumes kept)
	$(call run,up.sh)
	@# Only reached after successful startup. Compose recreates these on the next up.
	@./scripts/compose.sh app rm -f volume-init
	@./scripts/compose.sh identity rm -f identity-secrets-init
```

Their definitions and named volumes remain, and Compose recreates the helpers on the next start. I ran a repeated startup and confirmed that the service container IDs and named volumes survived. It is a four-line change, and it still needed an owner, a prerequisite, a narrow scope and a check.

This is what a start looks like. The last time I ran `make up`, the Podman VM was 28 minutes behind the Mac. I trimmed Compose's own Creating, Starting and Started lines and kept every line the scripts print:

```text
$ make up RUNTIME=podman
clock-sync: VM was 1671s behind the host, now 1s
unseal: vault-s is sealed, unsealing
unseal: vault-s is unsealed
vault-up: vault-s active, vault-1..3 unsealed, vault-2 is the leader
identity-secrets: 0 secret(s) created in kv/dance/identity (existing ones kept)
identity-secrets: AppRole identity-secrets credential still valid, kept
identity-up: OpenLDAP and Keycloak ready (http://localhost:13602)
hosts-up: host-rocky (127.0.0.1:13622) and host-ubuntu (127.0.0.1:13623) answer
app-up: stack started
  Console: https://localhost:13601/   (lab CA; make trust-root to trust it)
  API:     http://127.0.0.1:13600/api/health
up: done. make verify to check, make doctor if something looks wrong.
Going to remove vdnc-app-volume-init
 ✔ Container vdnc-app-volume-init  Removed
Going to remove vdnc-identity-secrets-init
 ✔ Container vdnc-identity-secrets-init  Removed
```

Each line names the step, what it found and what it did. The clock goes first, because Vault TTLs and JWT validation break when the VM drifts that far. The seal Vault unseals before the cluster starts, the cluster has a leader before identity starts, and identity answers before the hosts and the app come up. Where nothing needed doing, the line says so: no new secrets, the AppRole credential kept. The last script line names the next two commands, and the two init containers go only after it.

Destructive commands get more care. Every lab has a prefix (`gt-`, `sg-`, `vdnc-`) and every podman, Multipass or `oc` command filters on it. `make reset` in `shift_gear` asks me to type the project name first. A cleanup command for one lab has no reason to touch its neighbour.

## What I do differently now

I would write the ownership table before the first Make target. Which tool owns the machines or Kubernetes objects? Which owns the Vault mounts and policies? Which performs initialisation? Who issues credentials? Which controller may change a runtime field after deployment?

Then I would define the handovers: a node map, a cluster contract, a protected file path, a readiness check. Each producer makes something the next consumer can validate.

Only then would I put the sequence behind `make lab` or `make bootstrap`, with individual targets for diagnosis and recovery. The full command stops on failure, keeps its evidence and prints the next command to run.

I also write the checks next to the claims: a repeat run, a clean plan, a from-nothing rebuild, a real login, a refused request and a stop/start cycle each answer a different question. `golden_ticket` taught me this when a rerun passed but a fresh build failed. The next project starts with that lesson on the page, instead of waiting for the next failure to teach it again.

These labs run on my laptop, but I build them as if someone else will need to follow the sequence. Production adds state custody, remote execution identities, approvals, audit retention and coordination between operators; a local Makefile supplies none of them. If I moved one to a team tomorrow, I would move Terraform state into a remote backend with locking first, then replace the bootstrap tokens with identities the pipeline gets from Vault per run. The phase list, contracts and gates are useful starting points, but I would still validate them in that environment.

I still want that single `make lab` command before a demo. The difference is that I now know what I am asking it to do: move through a sequence whose owners are clear, whose handoffs can be checked, and whose failures leave me with a next step instead of a mystery.

## Follow the implementations

The source repositories contain the phase lists, wrappers and checks discussed here.

- [multi_pass](https://github.com/raymonepping/multi_pass): the three-stage deployment, Terraform-triggered Ansible convergence and the state secret check.
- [golden_ticket](https://github.com/raymonepping/golden_ticket): the shared phase list, the baseline rerun mechanism, scoped tool identities and `docs/lessons-learned.md`.
- [shift_gear](https://github.com/raymonepping/shift_gear): the OpenShift substrate contract, the Layers console and the dry-run coverage limits.
- [vault_dance](https://github.com/raymonepping/vault_dance): Compose lifecycle, Terraform-managed Vault configuration and Ansible-managed hosts.
- [vault_balancing](https://github.com/raymonepping/vault_balancing): a measured multi-site replication failover and failback drill.
- [vault_codex](https://github.com/raymonepping/vault_codex): a Vault-enforced cipher hunt with control groups, Sentinel and a shared phase list.
- [vault_pipeline](https://github.com/raymonepping/vault_pipeline): workload identities and document encryption across a local AI pipeline.
- [vault_crypto](https://github.com/raymonepping/vault_crypto): the useful two-tool counterexample, with Make and Terraform and no Ansible layer.

For the organisational side, I wrote [HashiCorp Terraform at Scale](https://github.com/raymonepping/assets_articles/blob/main/articles/HashiCorp-Terraform-at-Scale.md). For the larger Vault platform with a command behind every claim, the companion article is [One Vault Demo to Rule Them All](https://github.com/raymonepping/vault_reference/blob/main/article/07_One_Vault_Demo_To_Rule_Them_All.md). That repository is private: request access and I will grant it.
