import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRunner, commandFor, BusyError } from '../lib/runner.js';

function fakeSpawn() {
  const calls = [];
  const fn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    calls.push({ cmd, args, opts, child });
    return child;
  };
  fn.calls = calls;
  return fn;
}
const lab = { id: 'vault_pipeline', dir: '/labs/vault_pipeline' };
const end = (child, code, signal = null) => { child.stdout.end(); child.stderr.end(); setImmediate(() => child.emit('close', code, signal)); };

test('the command is fixed: make -C <dir> up|down RUNTIME=podman', () => {
  assert.deepEqual(commandFor('/d', 'up'), ['make', ['-C', '/d', 'up', 'RUNTIME=podman']]);
  assert.deepEqual(commandFor('/d', 'down'), ['make', ['-C', '/d', 'down', 'RUNTIME=podman']]);
  for (const bad of ['reset', 'clean-slate', 'up; rm -rf /', '', undefined]) assert.throws(() => commandFor('/d', bad));
});

test('spawn: no shell, pinned cwd, stdin closed, VLIX_ and make env dropped', async () => {
  const spawn = fakeSpawn();
  const r = createRunner({ spawn, env: { PATH: '/bin', HOME: '/h', VLIX_TOKEN: 'x', MAKEFLAGS: 'w -- RUNTIME=podman', MAKELEVEL: '1', RUNTIME: 'podman' } });
  r.start(lab, 'up');
  const { cmd, args, opts, child } = spawn.calls[0];
  assert.equal(cmd, 'make');
  assert.deepEqual(args, ['-C', lab.dir, 'up', 'RUNTIME=podman']);
  assert.equal(opts.shell, false);
  assert.equal(opts.cwd, lab.dir);
  assert.equal(opts.stdio[0], 'ignore');
  assert.equal(opts.detached, true);
  assert.deepEqual(opts.env, { PATH: '/bin', HOME: '/h' });
  end(child, 0);
});

test('one operation at a time; lines are redacted; exit code decides the state', async () => {
  const spawn = fakeSpawn();
  const ended = [];
  const r = createRunner({ spawn, onEnd: (op) => ended.push(op) });
  r.start(lab, 'up');
  assert.throws(() => r.start({ id: 'other', dir: '/o' }, 'down'), (e) => e instanceof BusyError && e.operation.lab === 'vault_pipeline');
  const { child } = spawn.calls[0];
  child.stdout.write('phase seal: ok\ntoken hvs.CAESIFAKEFAKEFAKEFAKEFAKE0123\n\x1b[32mup: done\x1b[0m\npart');
  child.stderr.write('ial\n');
  end(child, 2);
  await new Promise((ok) => setTimeout(ok, 10));
  const op = r.latest();
  assert.equal(op.state, 'failed');
  assert.equal(op.exitCode, 2);
  assert.ok(op.lines.includes('phase seal: ok'));
  assert.ok(op.lines.includes('up: done'), 'ANSI colour codes are stripped');
  assert.ok(op.lines.some((l) => l.includes('hvs.[redacted]')) && !op.lines.join().includes('FAKEFAKE'));
  assert.equal(ended.length, 1);
  assert.equal(r.current(), null);
  r.start(lab, 'down'); // free again
  end(spawn.calls[1].child, 0);
  await new Promise((ok) => setTimeout(ok, 10));
  assert.equal(r.lastFor('vault_pipeline').state, 'succeeded');
});

test('a timeout stops the whole process group, then kills it', async () => {
  const spawn = fakeSpawn();
  const sent = [];
  const r = createRunner({ spawn, timeoutMs: 20, killGraceMs: 20, kill: (pid, sig) => sent.push([pid, sig]) });
  r.start(lab, 'up');
  await new Promise((ok) => setTimeout(ok, 60));
  assert.deepEqual(sent, [[-4242, 'SIGTERM'], [-4242, 'SIGKILL']]);
  end(spawn.calls[0].child, null, 'SIGKILL');
  await new Promise((ok) => setTimeout(ok, 10));
  assert.equal(r.latest().state, 'timed-out');
});

test('only the last 200 lines are kept', async () => {
  const spawn = fakeSpawn();
  const r = createRunner({ spawn });
  r.start(lab, 'up');
  const { child } = spawn.calls[0];
  child.stdout.write(Array.from({ length: 250 }, (_, i) => `line ${i}`).join('\n') + '\n');
  end(child, 0);
  await new Promise((ok) => setTimeout(ok, 10));
  const { lines } = r.latest();
  assert.equal(lines.length, 200);
  assert.equal(lines[0], 'line 50');
});

test('make missing: the operation fails with a reason', async () => {
  const spawn = fakeSpawn();
  const r = createRunner({ spawn });
  r.start(lab, 'up');
  spawn.calls[0].child.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }));
  await new Promise((ok) => setTimeout(ok, 10));
  assert.equal(r.latest().state, 'failed');
  assert.match(r.latest().lines.at(-1), /could not start make \(ENOENT\)/);
});

test('shutdown refuses new work', async () => {
  const r = createRunner({ spawn: fakeSpawn() });
  await r.shutdown(10);
  assert.throws(() => r.start(lab, 'up'), BusyError);
});
