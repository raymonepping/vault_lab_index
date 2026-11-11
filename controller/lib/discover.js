// controller/lib/discover.js: which sibling directories are labs (D6 to D9).
// Reads files only; never runs make or a lab script.
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';

export const ID_RE = /^[A-Za-z0-9_.-]+$/;
export const PREFIX_RE = /^[a-z][a-z0-9_]*-$/;
const DOCS = ['.claude/CLAUDE.md', 'CLAUDE.md', 'AGENTS.md'];
const COMPOSE = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'];
const MAX_BYTES = 1 << 20;

// A regular file's text, or null (missing, a symlink, a dir, too big).
async function text(path) {
  try {
    const st = await lstat(path);
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    return await readFile(path, 'utf8');
  } catch { return null; }
}

// Explicit rule targets: `up:`, `up down:`, `up::`; not `up :=` or recipe lines.
export function targets(makefile) {
  const out = new Set();
  for (const line of makefile.split('\n')) {
    const m = /^([^\s:#=][^:#=]*?)\s*::?(?![:=])/.exec(line);
    if (m) for (const t of m[1].split(/\s+/)) out.add(t);
  }
  return out;
}

export function recordedPrefix(docs) {
  const m = /prefix[^`\n<]{0,12}`([a-z][a-z0-9_]*-)`/i.exec(docs);
  return m ? m[1] : null;
}

export function describe(readme) {
  if (!readme) return { title: null, description: '', urls: [] };
  const lines = readme.split('\n');
  const title = lines.find((l) => /^# /.test(l))?.slice(2).replace(/`|\*\*/g, '').trim() ?? null;
  let para = [];
  let fence = false;
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const l = raw.trim();
    if (!l) { if (para.length) break; continue; }
    if (/^(#|>|!\[|\[!\[|<|\||[-*+] |\d+\. |<!--)/.test(l)) { if (para.length) break; continue; }
    para.push(l);
  }
  let description = para.join(' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`|\*\*/g, '')
    .replace(/\s+/g, ' ').trim();
  if (description.length > 200) description = `${description.slice(0, 199).replace(/\s+\S*$/, '')}…`;
  const urls = [...new Set((readme.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{2,5})?(?:\/[^\s)<>\]"'`]*)?/g) ?? [])
    .map((u) => u.replace(/[.,;:]+$/, '')))].slice(0, 4);
  return { title, description, urls };
}

async function inspect(root, name, overrides) {
  const dir = join(root, name);
  const st = await lstat(dir);
  if (st.isSymbolicLink()) return { reason: 'is a symlink' };
  if (!st.isDirectory()) return null;
  const real = await realpath(dir);
  if (!real.startsWith(root + sep)) return { reason: 'resolves outside the labs root' };
  const mkStat = await lstat(join(dir, 'Makefile')).catch(() => null);
  if (!mkStat) return { reason: 'no Makefile' };
  if (!mkStat.isFile()) return { reason: 'Makefile is not a regular file' };
  const makefile = await text(join(dir, 'Makefile'));
  if (makefile === null) return { reason: 'Makefile is not readable' };
  const t = targets(makefile);
  if (!t.has('up') && !t.has('down')) return { reason: 'no up or down target' };
  if (!t.has('up')) return { reason: 'no up target' };
  if (!t.has('down')) return { reason: 'no down target' };

  const scriptDir = await readdir(join(dir, 'scripts'), { withFileTypes: true }).catch(() => []);
  const scripts = await Promise.all(scriptDir.filter((e) => e.isFile() && e.name.endsWith('.sh')).map((e) => text(join(dir, 'scripts', e.name))));
  const code = [makefile, ...scripts].join('\n');
  if (/\b(multipass|crc)\b/.test(code)) return { reason: 'runs on Multipass or OpenShift Local, not Podman' };
  const hasCompose = (await Promise.all(COMPOSE.map((f) => text(join(dir, f))))).some((t) => t !== null)
    || (await readdir(join(dir, 'compose')).catch(() => [])).length > 0;
  if (!hasCompose && !/\bpodman\b/.test(code)) return { reason: 'no Podman use found' };

  const docs = (await Promise.all(DOCS.map((f) => text(join(dir, f))))).filter(Boolean).join('\n');
  let prefix = recordedPrefix(docs);
  let prefixSource = 'lab';
  if (!prefix && typeof overrides[name] === 'string') { prefix = overrides[name]; prefixSource = 'portal'; }
  if (!prefix) return { reason: 'no recorded prefix (add one to its AGENTS.md or config/prefixes.json)' };
  if (!PREFIX_RE.test(prefix)) return { reason: `prefix ${prefix} is not a valid name prefix` };

  const readmeText = await text(join(dir, 'README.md'));
  return { lab: { id: name, dir: real, prefix, prefixSource, readme: readmeText === null ? null : join(real, 'README.md'), ...describe(readmeText) } };
}

// discover(root, { overrides, self }) -> { labs, excluded }, both sorted by id.
export async function discover(rootPath, { overrides = {}, self = null } = {}) {
  const root = await realpath(rootPath);
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((e) => !e.name.startsWith('.') && ID_RE.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const me = self ? await realpath(self).catch(() => self) : null;
  const labs = [];
  const excluded = [];
  for (const e of entries) {
    if (me && join(root, e.name) === me) { excluded.push({ id: e.name, reason: 'this portal' }); continue; }
    const r = await inspect(root, e.name, overrides).catch(() => ({ reason: 'could not be read' }));
    if (!r) continue;
    if (r.lab) labs.push(r.lab); else excluded.push({ id: e.name, reason: r.reason });
  }
  // Prefixes must not overlap, or one lab's filter would see the other's
  // containers. With PREFIX_RE (one dash, at the end) that means equal.
  const clash = new Map();
  for (const a of labs) for (const b of labs) {
    if (a !== b && a.prefix.startsWith(b.prefix)) { clash.set(a.id, b.id); clash.set(b.id, a.id); }
  }
  for (const [id, other] of clash) excluded.push({ id, reason: `prefix overlaps ${other}` });
  excluded.sort((a, b) => a.id.localeCompare(b.id));
  return { labs: labs.filter((l) => !clash.has(l.id)), excluded };
}
