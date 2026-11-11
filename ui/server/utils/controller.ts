// ui/server/utils/controller.ts: the one way to reach the host controller.
// The token is read per request, so a controller restart (new token) needs
// no UI restart (D4).
import { readFile } from 'node:fs/promises'

const BASE = process.env.VLIX_CONTROLLER_URL ?? 'http://host.containers.internal:18801'
const TOKEN_FILE = process.env.VLIX_TOKEN_FILE ?? '/run/vlix/controller.token'

export class ControllerOffline extends Error {}

// fetch with a referenced timer: AbortSignal.timeout can fail to fire.
export async function controllerFetch(path: string, init: { method: string; auth: boolean; ms?: number }) {
  const headers: Record<string, string> = {}
  if (init.auth) {
    const token = (await readFile(TOKEN_FILE, 'utf8').catch(() => '')).trim()
    if (!token) throw new ControllerOffline('no token file')
    headers.authorization = `Bearer ${token}`
  }
  if (init.method === 'POST') headers['content-type'] = 'application/json'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), init.ms ?? 15_000)
  try {
    return await fetch(`${BASE}${path}`, { method: init.method, headers, body: init.method === 'POST' ? '{}' : undefined, signal: ac.signal })
  } catch {
    throw new ControllerOffline('unreachable')
  } finally {
    clearTimeout(timer)
  }
}
