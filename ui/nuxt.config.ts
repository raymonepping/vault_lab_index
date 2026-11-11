// ui/nuxt.config.ts: the Lab Index dashboard (prompt 02). The Nitro server is
// the only thing the browser talks to; it holds the controller token (D4, D5).
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/css/main.css', '~/assets/css/index.css'],
  // Fonts ship as files, not data: URIs, so font-src stays 'self'.
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
  // Styles ship as files so the CSP can stay style-src 'self'.
  features: { inlineStyles: false },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Lab Index',
      meta: [
        { name: 'color-scheme', content: 'light' },
        { name: 'description', content: 'Start, stop and watch the Podman labs next to this one.' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
