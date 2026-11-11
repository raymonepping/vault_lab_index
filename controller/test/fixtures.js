// controller/test/fixtures.js: a fake labs root for unit tests and for the
// UI's fixture mode (scripts/fixture-controller.sh). Built in code so Git
// holds no symlinks.
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const MK = 'up: ## start\n\t@echo up\n\ndown: ## stop\n\t@echo down\n';
const lab = (root, name, files) => {
  mkdirSync(join(root, name), { recursive: true });
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(root, name, f, '..'), { recursive: true });
    if (body === null) mkdirSync(join(root, name, f), { recursive: true }); else writeFileSync(join(root, name, f), body);
  }
};
const readme = (title, text, extra = '') => `# ${title}\n\n> A motto line, skipped.\n\n${text}\n\n${extra}`;

// Eligible labs and the state the fake podman starts them in.
export const ELIGIBLE = {
  alpha_lab: { prefix: 'alp-', state: 'running' },
  bravo_lab: { prefix: 'brv-', state: 'stopped' },
  charlie_lab: { prefix: 'chr-', state: 'partial' },
  delta_lab: { prefix: 'dlt-', state: 'unhealthy' },
  echo_lab: { prefix: 'ech-', state: 'stopped', failsUp: true },
  portal_prefixed: { prefix: 'ppx-', state: 'stopped', fromPortal: true },
};

export function makeLabs(root, outside) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const [name, l] of Object.entries(ELIGIBLE)) {
    lab(root, name, {
      Makefile: l.failsUp ? 'up down: ## both\n\t@exit 2\n' : MK,
      'compose/app/compose.yaml': 'services: {}\n',
      'README.md': readme(name.replace('_', ' '), `The ${name} fixture lab: it stands in for a real lab while the UI is built.`, 'Open http://localhost:19300 or https://127.0.0.1:8443/ui.\n'),
      ...(l.fromPortal ? {} : { 'AGENTS.md': `- Resource prefix: \`${l.prefix}\`.\n` }),
      '.fake-state': l.state,
    });
  }
  lab(root, 'no_down', { Makefile: 'up:\n\t@echo up\n', 'AGENTS.md': 'Prefix `ndn-`.' });
  lab(root, 'vm_lab', { Makefile: MK + 'vm:\n\tmultipass launch\n', 'AGENTS.md': 'Prefix `vml-`.' });
  lab(root, 'no_prefix', { Makefile: MK + '\tpodman ps\n' });
  lab(root, 'dup_a', { Makefile: MK, 'compose.yaml': '', 'AGENTS.md': 'Prefix `dup-`.' });
  lab(root, 'dup_b', { Makefile: MK, 'compose.yaml': '', 'AGENTS.md': 'Prefix `dup-`.' });
  lab(root, 'mk_dir', { Makefile: null });
  lab(root, 'no_podman', { Makefile: MK, 'AGENTS.md': 'Prefix `npd-`.' });
  lab(root, 'template_prefix', { Makefile: MK, 'compose.yaml': '', 'AGENTS.md': '- Resource prefix: <none yet: choose one, e.g. `abc-`>' });
  if (outside) {
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'Makefile'), MK);
    symlinkSync(outside, join(root, 'linked_lab'));
  }
  return { overrides: { portal_prefixed: 'ppx-', no_prefix: 'bad prefix' } };
}
