import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover, targets, recordedPrefix, describe } from '../lib/discover.js';
import { makeLabs, ELIGIBLE } from './fixtures.js';

const base = mkdtempSync(join(tmpdir(), 'vlix-'));
const root = join(base, 'labs');
const { overrides } = makeLabs(root, join(base, 'outside'));
const { labs, excluded } = await discover(root, { overrides });
const why = Object.fromEntries(excluded.map((e) => [e.id, e.reason]));

test('eligible labs: up, down, Podman and a prefix', () => {
  assert.deepEqual(labs.map((l) => l.id), Object.keys(ELIGIBLE).sort());
  const p = labs.find((l) => l.id === 'portal_prefixed');
  assert.equal(p.prefix, 'ppx-');
  assert.equal(p.prefixSource, 'portal');
  assert.equal(labs.find((l) => l.id === 'alpha_lab').prefixSource, 'lab');
});

test('each excluded lab says why', () => {
  assert.equal(why.no_down, 'no down target');
  assert.match(why.vm_lab, /Multipass/);
  assert.match(why.no_prefix, /not a valid name prefix/);
  assert.match(why.dup_a, /overlaps dup_b/);
  assert.match(why.dup_b, /overlaps dup_a/);
  assert.equal(why.mk_dir, 'Makefile is not a regular file');
  assert.equal(why.no_podman, 'no Podman use found');
  assert.match(why.template_prefix, /no recorded prefix/);
  assert.equal(why.linked_lab, 'is a symlink');
});

test('the portal excludes itself', async () => {
  const r = await discover(root, { overrides, self: join(root, 'alpha_lab') });
  assert.equal(r.excluded.find((e) => e.id === 'alpha_lab').reason, 'this portal');
});

test('target lines: rules count, assignments and recipes do not', () => {
  const t = targets('up down: ## x\n\t@up: no\nfoo := 1\nbar ::= 2\nbaz::\n.PHONY: up\n');
  assert.ok(t.has('up') && t.has('down') && t.has('baz'));
  assert.ok(!t.has('foo') && !t.has('bar') && !t.has('@up'));
  assert.ok(!targets('up := 1\ndown = 2\n').has('up'));
});

test('a recorded prefix is backticked near the word prefix', () => {
  assert.equal(recordedPrefix('- Resource prefix: **`vbal-`** (containers'), 'vbal-');
  assert.equal(recordedPrefix('Prefix `arcanium-`. Never touch `vref-*`'), 'arcanium-');
  assert.equal(recordedPrefix('prefix: <none yet: choose one, e.g. `abc-`'), null);
  assert.equal(recordedPrefix('no word here `vbal-`'), null);
});

test('README: title, first paragraph, local links only', () => {
  const d = describe('# Lab `X`\n\n![badge](b.svg)\n\n> House motto.\n\nA **lab** with [docs](http://x).\nSecond line.\n\nMore. https://example.com http://localhost:8200/ui, http://127.0.0.1:3000.\n');
  assert.equal(d.title, 'Lab X');
  assert.equal(d.description, 'A lab with docs. Second line.');
  assert.deepEqual(d.urls, ['http://localhost:8200/ui', 'http://127.0.0.1:3000']);
  assert.ok(describe(`# T\n\n${'word '.repeat(80)}`).description.length <= 200);
});
