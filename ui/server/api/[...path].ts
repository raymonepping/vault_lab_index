// ui/server/api/[...path].ts: forwards exactly three calls to the controller
// (prompt 02). Anything else is 404; a mutation from another origin is 403.
// The browser reads the operation from GET labs; GET operation stays on the
// controller for scripts and tests only.
import type { H3Event } from 'h3'

const ROUTES: Array<[string, RegExp]> = [
  ['GET', /^labs$/],
  ['POST', /^refresh$/],
  ['POST', /^labs\/(?!\.+\/)[A-Za-z0-9_.-]+\/(up|down)$/],
]

function refuse(event: H3Event, status: number, error: string, message: string) {
  setResponseStatus(event, status)
  return { error, message }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const path = event.context.params?.path ?? ''
  const method = event.method
  if (!ROUTES.some(([m, re]) => m === method && re.test(path))) return refuse(event, 404, 'not-found', 'no such route')
  if (method === 'POST') {
    const origin = getRequestHeader(event, 'origin')
    if (!origin || origin !== getRequestURL(event).origin) return refuse(event, 403, 'forbidden-origin', 'cross-site request refused')
    if (!/^application\/json(;|$)/.test(getRequestHeader(event, 'content-type') ?? '')) return refuse(event, 415, 'bad-request', 'send application/json')
  }
  try {
    const r = await controllerFetch(`/api/${path}`, { method, auth: true })
    setResponseStatus(event, r.status)
    return await r.json()
  } catch (e) {
    if (e instanceof ControllerOffline) return refuse(event, 503, 'controller-offline', 'the host controller is not running; run make up')
    return refuse(event, 502, 'bad-gateway', 'the controller sent an unreadable answer')
  }
})
