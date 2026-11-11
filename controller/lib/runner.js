// controller/lib/runner.js: one make up or make down at a time (D10, D11).
import { createRedactor } from './redact.js';

export const MAX_LINES = 200;

export class BusyError extends Error {
  constructor(operation) { super('another operation is running'); this.operation = operation; }
}

// The only two commands the portal can run. The action is chosen here, never
// copied from a request.
export function commandFor(dir, action) {
  switch (action) {
    case 'up': return ['make', ['-C', dir, 'up', 'RUNTIME=podman']];
    case 'down': return ['make', ['-C', dir, 'down', 'RUNTIME=podman']];
    default: throw new Error(`no such action: ${action}`);
  }
}

// The portal's own settings and its make's flags (the controller is started
// by `make up`) must not reach a lab's make.
const MAKE_VARS = new Set(['MAKEFLAGS', 'MAKELEVEL', 'MFLAGS', 'MAKEOVERRIDES', 'MAKE_TERMOUT', 'MAKE_TERMERR', 'RUNTIME']);
export const childEnv = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('VLIX_') && !MAKE_VARS.has(k)));

export function createRunner({ spawn, kill = process.kill, now = Date.now, timeoutMs = 1_800_000, killGraceMs = 10_000, env = process.env, onEnd = () => {}, log = () => {} }) {
  let seq = 0;
  let current = null; // the running operation
  let closing = false;
  const last = new Map(); // lab id -> its latest operation
  let latest = null;

  const view = (op, withLines = false) => op && {
    id: op.id, lab: op.lab, action: op.action, state: op.state, startedAt: op.startedAt,
    durationMs: (op.endedAt ?? now()) - op.startedAt, exitCode: op.exitCode,
    ...(withLines ? { lines: [...op.lines] } : {}),
  };

  function start(lab, action) {
    if (closing) throw new BusyError(null);
    if (current) throw new BusyError(view(current));
    const [cmd, args] = commandFor(lab.dir, action);
    const op = { id: ++seq, lab: lab.id, action, state: 'running', startedAt: now(), endedAt: null, exitCode: null, lines: [], done: null };
    const redact = createRedactor();
    const push = (line) => {
      const safe = redact(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')); // colour codes are noise in a <pre>
      if (safe === null) return;
      op.lines.push(safe.slice(0, 500));
      if (op.lines.length > MAX_LINES) op.lines.shift();
    };
    const child = spawn(cmd, args, { cwd: lab.dir, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: childEnv(env) });
    current = op;
    last.set(lab.id, op);
    latest = op;
    log('operation_started', { lab: lab.id, action, op: op.id });

    for (const stream of [child.stdout, child.stderr]) {
      let buf = '';
      stream?.setEncoding?.('utf8');
      stream?.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { push(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
      });
      stream?.on('end', () => { if (buf) push(buf); buf = ''; });
    }

    const group = (sig) => { try { kill(-child.pid, sig); } catch { /* already gone */ } };
    let timedOut = false;
    let hardKill = null;
    const timer = setTimeout(() => {
      timedOut = true;
      push(`[portal] no exit after ${Math.round(timeoutMs / 1000)} s: stopping make`);
      group('SIGTERM');
      hardKill = setTimeout(() => group('SIGKILL'), killGraceMs);
    }, timeoutMs);

    op.done = new Promise((resolve) => {
      const finish = (code, failure) => {
        if (op.endedAt) return;
        clearTimeout(timer);
        clearTimeout(hardKill);
        op.endedAt = now();
        op.exitCode = code;
        if (failure) push(`[portal] ${failure}`);
        op.state = timedOut ? 'timed-out' : code === 0 ? 'succeeded' : 'failed';
        current = null;
        log('operation_ended', { lab: lab.id, action, op: op.id, state: op.state, exit_code: code, duration_ms: op.endedAt - op.startedAt });
        onEnd(view(op));
        resolve();
      };
      child.on('error', (e) => finish(null, `could not start make (${e.code ?? 'error'})`));
      child.on('close', (code, signal) => finish(code, signal ? `make ended by ${signal}` : null));
    });
    op.kill = group;
    return view(op);
  }

  // Refuse new work; let a running operation finish for graceMs, then stop it.
  async function shutdown(graceMs = 30_000) {
    closing = true;
    const op = current;
    if (!op) return;
    const t = setTimeout(() => { op.lines.push('[portal] the portal is stopping: stopping make'); op.kill('SIGTERM'); setTimeout(() => op.kill('SIGKILL'), killGraceMs).unref(); }, graceMs);
    await op.done;
    clearTimeout(t);
  }

  return {
    start,
    shutdown,
    current: () => view(current, true),
    latest: () => view(latest, true),
    lastFor: (id) => view(last.get(id)),
  };
}
