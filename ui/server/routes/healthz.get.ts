// ui/server/routes/healthz.get.ts: the container's health check. The UI is ok
// on its own; the controller's state rides along.
export default defineEventHandler(async () => {
  const controller = await controllerFetch('/healthz', { method: 'GET', auth: false, ms: 3000 })
    .then((r) => (r.ok ? 'up' : 'down'))
    .catch(() => 'down')
  return { ok: true, controller }
})
