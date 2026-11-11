// The API boundary (D4, D5, D9, D11) against a fixture root and fake podman.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createController } from '../server.js';
import { makeLabs } from './fixtures.js';

const root = join(mkdtempSync(join(tmpdir(), 'vlix-')), 'labs');
const { overrides } = makeLabs(root);
const spawned = [];
const spawnFn = (cmd, args) => {
  const child = new EventEmitter();
  child.pid = 1;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  spawned.push({ cmd, args, child });
  return child;
};
const runFn = async () => JSON.stringify([{ Names: ['alp-web'], State: 'running', Status: 'Up', ExitCode: 0 }]);
let podmanCalls = 0;
let clock = Date.now();
const counted = async () => { podmanCalls++; return runFn(); };
const c = createController({ root, refreshS: 15, timeoutMs: 60_000, overrides, token: 'test-token', spawnFn, runFn: counted, now: () => clock });
await new Promise((ok) => c.server.listen(0, '127.0.0.1', ok));
const port = c.server.address().port;
after(() => c.server.close());

const auth = { authorization: 'Bearer test-token' };
const req = (path, { method = 'GET', headers = {}, body } = {}) =>
  fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body });
const post = (path, headers = {}) => req(path, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', ...headers }, body: '{}' });

test('healthz needs no token and says nothing about labs', async () => {
  const r = await req('/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('no token or a wrong token: 401', async () => {
  assert.equal((await req('/api/labs')).status, 401);
  assert.equal((await req('/api/labs', { headers: { authorization: 'Bearer nope' } })).status, 401);
  assert.equal((await req('/api/labs', { headers: { authorization: 'Bearer test-token-and-more' } })).status, 401);
});

test('an Origin header: 403, even with the token', async () => {
  const r = await req('/api/labs', { headers: { ...auth, origin: 'http://127.0.0.1:18800' } });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'forbidden-origin');
});

test('a foreign Host: 400', async () => {
  const { request } = await import('node:http');
  const status = await new Promise((ok) => {
    request({ host: '127.0.0.1', port, path: '/api/labs', headers: { ...auth, host: 'evil.example:80' } }, (res) => { res.resume(); ok(res.statusCode); }).end();
  });
  assert.equal(status, 400);
});

test('labs list: eligible labs with observed status, excluded with reasons', async () => {
  const j = await (await req('/api/labs', { headers: auth })).json();
  const alpha = j.labs.find((l) => l.id === 'alpha_lab');
  assert.equal(alpha.status, 'running');
  assert.equal(alpha.stale, false);
  assert.equal(j.labs.find((l) => l.id === 'bravo_lab').status, 'stopped');
  assert.ok(j.excluded.some((e) => e.id === 'vm_lab'));
  assert.ok(!JSON.stringify(j).includes('test-token'));
});

test('mutations: wrong content type 415, bad ids and actions 404', async () => {
  assert.equal((await post('/api/labs/alpha_lab/up', { 'content-type': 'text/plain' })).status, 415);
  for (const p of ['/api/labs/../up', '/api/labs/a;b/up', '/api/labs/alpha_lab/reset', '/api/labs/vm_lab/up', '/api/labs/nope/down', '/api/labs/%2e%2e/up']) {
    assert.equal((await post(p)).status, 404, p);
  }
  assert.equal(spawned.length, 0);
});

test('up runs make for the registered dir; a second one is refused with 409', async () => {
  const r = await post('/api/labs/bravo_lab/up');
  assert.equal(r.status, 202);
  assert.equal((await r.json()).operation.state, 'running');
  assert.deepEqual(spawned[0].args, ['-C', join(root, 'bravo_lab').replace(/^\/var\//, '/private/var/'), 'up', 'RUNTIME=podman']);
  const labs = await (await req('/api/labs', { headers: auth })).json();
  assert.equal(labs.labs.find((l) => l.id === 'bravo_lab').status, 'starting');
  // While make runs, a read older than 5 s asks podman again; a fresh one does not.
  const before = podmanCalls;
  clock += 6000;
  await req('/api/labs', { headers: auth });
  assert.equal(podmanCalls, before + 1, 'a look older than 5 s during an operation refreshes');
  clock += 1000;
  await req('/api/labs', { headers: auth });
  assert.equal(podmanCalls, before + 1, 'a look 1 s old is reused');
  const busy = await post('/api/labs/alpha_lab/down');
  assert.equal(busy.status, 409);
  assert.equal((await busy.json()).operation.lab, 'bravo_lab');
  spawned[0].child.stdout.end();
  spawned[0].child.emit('close', 1, null);
  const after = await (await req('/api/labs', { headers: auth })).json();
  assert.equal(after.labs.find((l) => l.id === 'bravo_lab').status, 'failed');
  assert.equal((await (await req('/api/operation', { headers: auth })).json()).operation.exitCode, 1);
});
