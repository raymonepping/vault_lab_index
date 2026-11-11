// e2e/playwright.config.ts: against the fixture dashboard (`make test-ui`
// starts it). One worker: the fixture labs are shared state, like the real ones.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:18810', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
  ],
})
