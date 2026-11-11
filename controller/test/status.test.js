import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observe, classify, podmanArgs } from '../lib/status.js';

const c = (name, State, Status = '', ExitCode = 0) => ({ Names: [name], State, Status, ExitCode });
const labs = [{ id: 'pipe', prefix: 'vpip-' }, { id: 'codex', prefix: 'vcdx-' }];

test('one podman call, one anchored filter per prefix', () => {
  assert.deepEqual(podmanArgs(labs), ['ps', '-a', '--format', 'json', '--filter', 'name=^vpip-', '--filter', 'name=^vcdx-']);
});

test('containers go to the lab whose prefix starts their name, and nowhere else', async () => {
  const fake = async () => JSON.stringify([c('vpip-a', 'running'), c('vpipx-b', 'running'), c('vpip_c', 'running'), c('xvpip-d', 'running'), c('vcdx-e', 'exited', '', 0)]);
  const m = await observe(labs, fake);
  assert.deepEqual(m.get('pipe'), { status: 'running', counts: { running: 1, other: 0, unhealthy: 0 } });
  assert.deepEqual(m.get('codex').counts, { running: 0, other: 1, unhealthy: 0 }, 'a stopped lab still counts its exited containers');
  assert.equal(m.get('codex').status, 'stopped');
});

test('status states', () => {
  assert.equal(classify([]).status, 'stopped');
  assert.equal(classify([c('a', 'exited', 'Exited (0) (healthy)')]).status, 'stopped');
  assert.equal(classify([c('a', 'running', 'Up (healthy)'), c('init', 'exited', 'Exited (0)', 0)]).status, 'running');
  assert.equal(classify([c('a', 'running'), c('b', 'exited', 'Exited (1)', 1)]).status, 'partial');
  assert.equal(classify([c('a', 'running'), c('b', 'created')]).status, 'partial');
  assert.deepEqual(classify([c('a', 'running', 'Up 2 s (unhealthy)')]), { status: 'partial', counts: { running: 1, other: 0, unhealthy: 1 } });
  assert.equal(classify([c('a', 'running', 'Up 2 s (starting)')]).status, 'starting');
  assert.equal(classify([{ ...c('infra', 'created'), IsInfra: true }, c('a', 'running')]).status, 'running');
});

test('no labs, no podman call; a podman failure throws', async () => {
  let calls = 0;
  await observe([], async () => { calls++; return '[]'; });
  assert.equal(calls, 0);
  await assert.rejects(observe(labs, async () => { throw new Error('machine down'); }));
});
