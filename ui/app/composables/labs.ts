// ui/app/composables/labs.ts: the controller's answers, and how the page reads them.
export type Status = 'running' | 'stopped' | 'starting' | 'stopping' | 'partial' | 'failed' | 'unknown'
export interface Operation {
  id: number; lab: string; action: 'up' | 'down'; state: 'running' | 'succeeded' | 'failed' | 'timed-out'
  startedAt: number; durationMs: number; exitCode: number | null; lines?: string[]
}
export interface Lab {
  id: string; name: string; description: string; prefix: string; prefixSource: 'lab' | 'portal'
  urls: string[]; readme: string | null; status: Status; observed: Status; stale: boolean
  counts: { running: number; other: number; unhealthy: number }; observedAt: number | null; lastOperation: Operation | null
}
export interface LabsAnswer { labs: Lab[]; excluded: { id: string; reason: string }[]; operation: Operation | null; refreshS: number; observedAt: number | null }

// Partial, failed, stale and unknown need a look; unknown never counts as stopped.
export const needsAttention = (l: Lab) => l.stale || ['partial', 'failed', 'unknown'].includes(l.status)

export const STATUS: Record<Status, { word: string; tone: string }> = {
  running: { word: 'Running', tone: 'healthy' },
  stopped: { word: 'Stopped', tone: 'neutral' },
  starting: { word: 'Starting', tone: 'busy' },
  stopping: { word: 'Stopping', tone: 'busy' },
  partial: { word: 'Partial', tone: 'warn' },
  failed: { word: 'Failed', tone: 'critical' },
  unknown: { word: 'Unknown', tone: 'dim' },
}

export function ago(ms: number | null, now: number) {
  if (ms === null) return 'never'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export const seconds = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`)

export async function callApi<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<{ status: number; body: T & { error?: string; message?: string } }> {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
    body: method === 'POST' ? '{}' : undefined,
    cache: 'no-store',
  })
  return { status: r.status, body: await r.json().catch(() => ({ error: 'bad-gateway', message: 'unreadable answer' })) }
}
