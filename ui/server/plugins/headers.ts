// ui/server/plugins/headers.ts: security headers on every page, and a nonce
// on Nuxt's own inline scripts so the CSP needs no 'unsafe-inline'.
import { randomBytes } from 'node:crypto'

const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
}

const csp = (nonce: string) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'`,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    for (const [k, v] of Object.entries(BASE_HEADERS)) setResponseHeader(event, k, v)
  })
  nitro.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(16).toString('base64')
    const tag = (parts: string[]) => parts.map((p) => p.replace(/<script(?![^>]*\snonce=)/g, `<script nonce="${nonce}"`))
    html.head = tag(html.head)
    html.bodyPrepend = tag(html.bodyPrepend)
    html.body = tag(html.body)
    html.bodyAppend = tag(html.bodyAppend)
    setResponseHeader(event, 'content-security-policy', csp(nonce))
  })
})
