// ui/server/middleware/host.ts: only answer to the names this dashboard is
// served under. A page on another name that rebinds to 127.0.0.1 sends its own
// Host, and its Origin would match it; this refuses it before any route.
const ALLOWED = new Set((process.env.VLIX_ALLOWED_HOSTS ?? '127.0.0.1:18800,localhost:18800,127.0.0.1:3000').split(',').map((h) => h.trim()))

export default defineEventHandler((event) => {
  if (!ALLOWED.has(getRequestHeader(event, 'host') ?? '')) {
    setResponseStatus(event, 400)
    setResponseHeader(event, 'cache-control', 'no-store')
    return { error: 'bad-host', message: 'unexpected Host header' }
  }
})
