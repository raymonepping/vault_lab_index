// controller/lib/status.js: what podman says about each lab (D13). One
// `podman ps -a` for all labs, filtered by every lab's anchored prefix.
export function podmanArgs(labs) {
  return ['ps', '-a', '--format', 'json', ...labs.flatMap((l) => ['--filter', `name=^${l.prefix}`])];
}

export function classify(containers) {
  const relevant = containers.filter((c) => !c.IsInfra && !(c.State === 'exited' && c.ExitCode === 0));
  const running = relevant.filter((c) => c.State === 'running');
  const sick = running.filter((c) => /\(unhealthy\)/.test(c.Status ?? '')).length;
  const warming = running.some((c) => /\((health: )?starting\)/.test(c.Status ?? ''));
  // Counts show every container (a stopped lab keeps its exited ones); the
  // status ignores exited-0 one-shots.
  const all = containers.filter((c) => !c.IsInfra);
  const counts = { running: running.length, other: all.length - running.length, unhealthy: sick };
  if (running.length === 0) return { status: 'stopped', counts };
  if (sick || relevant.length > running.length) return { status: 'partial', counts };
  return { status: warming ? 'starting' : 'running', counts };
}

// observe(labs, run) -> Map(id -> { status, counts }). Throws if podman fails.
export async function observe(labs, run) {
  const out = new Map(labs.map((l) => [l.id, []]));
  if (labs.length) {
    const all = JSON.parse((await run('podman', podmanArgs(labs))) || '[]');
    for (const c of all) {
      const name = c.Names?.[0] ?? '';
      const lab = labs.find((l) => name.startsWith(l.prefix));
      if (lab) out.get(lab.id).push(c);
    }
  }
  return new Map([...out].map(([id, cs]) => [id, classify(cs)]));
}
