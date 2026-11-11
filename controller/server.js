// controller/server.js: the host controller (D2 to D5). Loopback only; every
// route but /healthz needs the bearer token from .build/run/controller.token.
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from './lib/discover.js';
import { observe } from './lib/status.js';
import { createRunner, BusyError } from './lib/runner.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function readConf(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2];
    }
  } catch { /* optional */ }
  return out;
}

const log = (event, fields = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));

const run = (cmd, args) => new Promise((ok, fail) => {
  execFile(cmd, args, { timeout: 10_000, maxBuffer: 16 << 20 }, (err, stdout) => (err ? fail(err) : ok(stdout)));
});

export function createController({ root, port, refreshS, timeoutMs, overrides, self, token, spawnFn = spawn, runFn = run, now = Date.now }) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `host.containers.internal:${port}`]);
  const tokenBuf = Buffer.from(`Bearer ${token}`);
  let registry = { labs: [], excluded: [] };
  let observed = new Map();
  let observedAt = null;
  let inflight = null;

  const runner = createRunner({
    spawn: spawnFn, now, timeoutMs, log,
    onEnd: () => { refresh().catch(() => {}); },
  });

  async function rediscover() {
    registry = await discover(root, { overrides, self });
    return registry;
  }

  function refresh() {
    inflight ??= (async () => {
      try {
        await rediscover();
        try {
          observed = await observe(registry.labs, runFn);
          observedAt = now();
        } catch (e) {
          observed = new Map();
          log('podman_failed', { message: String(e.message).slice(0, 200) });
        }
      } finally { inflight = null; }
    })();
    return inflight;
  }

  function labView(l) {
    const op = runner.current();
    const lastOp = runner.lastFor(l.id);
    const o = observed.get(l.id);
    let status = o?.status ?? 'unknown';
    if (op?.lab === l.id) status = op.action === 'up' ? 'starting' : 'stopping';
    else if (lastOp && ['failed', 'timed-out'].includes(lastOp.state)) status = 'failed';
    return {
      id: l.id, name: l.title ?? l.id, description: l.description, prefix: l.prefix, prefixSource: l.prefixSource,
      urls: l.urls, readme: l.readme, status, observed: o?.status ?? 'unknown',
      stale: observedAt === null || now() - observedAt > 2 * refreshS * 1000,
      counts: o?.counts ?? { running: 0, other: 0, unhealthy: 0 }, observedAt, lastOperation: lastOp,
    };
  }

  const body = () => ({
    labs: registry.labs.map(labView), excluded: registry.excluded,
    operation: runner.current() ?? runner.latest(), refreshS, observedAt,
  });

  function send(res, code, obj) {
    const s = JSON.stringify(obj);
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(s);
  }
  const fail = (res, code, error, message) => send(res, code, { error, message });

  const authorized = (req) => {
    const got = Buffer.from(req.headers.authorization ?? '');
    return got.length === tokenBuf.length && timingSafeEqual(got, tokenBuf);
  };

  function readBody(req) {
    return new Promise((ok, bad) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 1024) { req.removeAllListeners('data'); req.resume(); bad(new Error('too-large')); } else chunks.push(c); });
      req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
      req.on('error', bad);
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://controller');
    if (!hosts.has(req.headers.host ?? '')) return fail(res, 400, 'bad-host', 'unexpected Host header');
    if (req.headers.origin !== undefined) return fail(res, 403, 'forbidden-origin', 'browsers do not call the controller');
    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (!authorized(req)) return fail(res, 401, 'unauthorized', 'missing or wrong token');

    if (req.method === 'POST') {
      if (!/^application\/json(;|$)/.test(req.headers['content-type'] ?? '')) return fail(res, 415, 'bad-request', 'send application/json');
      let raw;
      try { raw = await readBody(req); } catch { res.setHeader('connection', 'close'); return fail(res, 413, 'bad-request', 'body too large'); }
      if (raw.trim()) { try { JSON.parse(raw); } catch { return fail(res, 400, 'bad-request', 'body is not JSON'); } }
    }

    if (req.method === 'GET' && url.pathname === '/api/labs') {
      // While make runs, look again every 5 s so the rack lights follow it.
      if (observedAt === null || (runner.current() && now() - observedAt > 5000)) await refresh();
      return send(res, 200, body());
    }
    if (req.method === 'GET' && url.pathname === '/api/operation') return send(res, 200, { operation: runner.current() ?? runner.latest() });
    if (req.method === 'POST' && url.pathname === '/api/refresh') { await refresh(); return send(res, 200, body()); }

    const m = /^\/api\/labs\/([A-Za-z0-9_.-]+)\/(up|down)$/.exec(url.pathname);
    if (req.method === 'POST' && m) {
      await rediscover(); // D9: a changed lab loses its buttons
      const lab = registry.labs.find((l) => l.id === m[1]);
      if (!lab) return fail(res, 404, 'not-found', 'no such eligible lab');
      try {
        return send(res, 202, { operation: runner.start(lab, m[2] === 'up' ? 'up' : 'down') });
      } catch (e) {
        if (e instanceof BusyError) return send(res, 409, { error: 'busy', message: 'another operation is running', operation: e.operation });
        throw e;
      }
    }
    return fail(res, 404, 'not-found', 'no such route');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      log('request_failed', { message: String(e.message).slice(0, 200) });
      if (!res.headersSent) fail(res, 500, 'internal', 'the controller hit an error; see make logs');
    });
  });

  return { server, refresh, runner, rediscover, registry: () => registry };
}

async function main() {
  const conf = { ...readConf(join(project, 'config/defaults.conf')), ...readConf(join(project, '.env')), ...process.env };
  const port = Number(conf.VLIX_CONTROLLER_PORT ?? 18801);
  const refreshS = Number(conf.VLIX_REFRESH_S ?? 15);
  const runDir = resolve(project, conf.VLIX_RUN_DIR ?? '.build/run');
  const root = resolve(project, conf.VLIX_LABS_ROOT ?? '..');
  const overrides = JSON.parse(readFileSync(resolve(project, conf.VLIX_PREFIXES ?? 'config/prefixes.json'), 'utf8'));
  const token = randomBytes(32).toString('base64url');
  // Its own dir: vlix-ui mounts the dir, so a new file on restart is seen.
  const tokenDir = join(runDir, 'token');
  const tokenFile = join(tokenDir, 'controller.token');

  for (const d of [runDir, tokenDir]) { mkdirSync(d, { recursive: true, mode: 0o700 }); chmodSync(d, 0o700); }
  writeFileSync(tokenFile, token, { mode: 0o600 });
  chmodSync(tokenFile, 0o600);

  const c = createController({ root, port, refreshS, timeoutMs: Number(conf.VLIX_OP_TIMEOUT_S ?? 1800) * 1000, overrides, self: project, token });
  await c.refresh();
  log('labs_discovered', { eligible: c.registry().labs.length, excluded: c.registry().excluded.length });
  const timer = setInterval(() => c.refresh().catch(() => {}), refreshS * 1000);
  c.server.listen(port, '127.0.0.1', () => log('controller_started', { port, root }));

  let stopping = false;
  const stop = async (sig) => {
    if (stopping) return;
    stopping = true;
    log('controller_stopping', { signal: sig });
    clearInterval(timer);
    c.server.close();
    await c.runner.shutdown(30_000);
    rmSync(tokenFile, { force: true });
    log('controller_stopped');
    process.exit(0);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
