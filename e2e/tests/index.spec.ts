// The Lab Index on fixture labs (fake make and podman; brief D16 keeps real
// labs out of tests). Order matters: operations change the fixture state.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const card = (page: Page, id: string) => page.locator(`[data-lab="${id}"]`)
const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([])
}
const noSideScroll = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
const waitIdle = (page: Page) => expect(page.getByTestId('hero-op')).toHaveCount(0, { timeout: 15_000 })

test.describe.configure({ mode: 'serial' })

test.afterEach(() => { expect(errors).toEqual([]) })

// Fresh fixture labs for each project (desktop, then phone).
test.beforeAll(() => {
  execFileSync(`${ROOT}scripts/fixture.sh`, ['start'], { cwd: ROOT, env: { ...process.env, FAKE_MAKE_MS: '1500' }, stdio: 'ignore' })
})

// A blocked font or script (CSP) or a crash shows up as a console error. A 503
// the offline test fakes is a network message, not a page error.
const errors: string[] = []
test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()) })
  await page.goto('/')
  await expect(page.getByTestId('controller')).toHaveText(/Controller connected/)
})

test('every status has its word and icon; counts never treat unknown as stopped', async ({ page }) => {
  await expect(card(page, 'alpha_lab').getByTestId('status')).toHaveText('Running')
  await expect(card(page, 'charlie_lab').getByTestId('status')).toHaveText('Partial')
  await expect(card(page, 'delta_lab').getByTestId('counts')).toHaveText('2 running, 1 unhealthy')
  await expect(card(page, 'bravo_lab').getByTestId('status')).toHaveText('Stopped')
  for (const pill of await page.getByTestId('status').all()) await expect(pill.locator('svg')).toHaveCount(1)
  await expect(page.getByTestId('count-running')).toHaveText('1')
  await expect(page.getByTestId('count-attention')).toHaveText('2')
  await expect(card(page, 'portal_prefixed')).toContainText('prefix set by the portal')
  await page.getByTestId('excluded').locator('summary').click()
  await expect(page.getByTestId('excluded')).toContainText('runs on Multipass')
  await expect(page.getByTestId('excluded')).toContainText('prefix overlaps')
  await noSideScroll(page)
  await axe(page)
})

test('search and status filter, kept in the URL', async ({ page }) => {
  await page.getByTestId('search').fill('chr-')
  await expect(page.getByTestId('shown')).toHaveText('1 of 6')
  await expect(page).toHaveURL(/q=chr-/)
  await page.getByTestId('search').fill('')
  await page.getByTestId('filter').selectOption('attention')
  await expect(page).toHaveURL(/status=attention/)
  await expect(page.locator('[data-lab]')).toHaveCount(2)
  await page.reload()
  await expect(page.getByTestId('filter')).toHaveValue('attention')
  await expect(page.locator('[data-lab]')).toHaveCount(2)
  await page.getByTestId('search').fill('nothing-like-this')
  await expect(page.getByText('No lab matches this search and filter.')).toBeVisible()
})

test('start: live lines with secrets redacted, then running', async ({ page }) => {
  await card(page, 'bravo_lab').getByTestId('start').click()
  const op = page.getByTestId('operation')
  await expect(op).toContainText('Start of bravo_lab is running')
  await expect(card(page, 'bravo_lab').getByTestId('status')).toHaveText('Starting')
  await expect(card(page, 'alpha_lab').getByTestId('stop')).toBeDisabled()
  await expect(card(page, 'alpha_lab')).toContainText('Wait: bravo_lab is starting.')
  await axe(page)
  await expect(op).toContainText('hvs.[redacted]', { timeout: 10_000 })
  await expect(op).not.toContainText('FAKEFAKE')
  await expect(op).toContainText('Start of bravo_lab finished', { timeout: 15_000 })
  await expect(page.getByTestId('announce')).toHaveText('Start of bravo_lab finished.')
  await expect(card(page, 'bravo_lab').getByTestId('status')).toHaveText('Running', { timeout: 10_000 })
})

test('stop asks first, by keyboard only, and says data is kept', async ({ page }) => {
  await waitIdle(page)
  const stop = card(page, 'bravo_lab').getByTestId('stop')
  await stop.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('keeps their volumes and data')
  await expect(dialog.getByRole('button', { name: 'Keep it running' })).toBeFocused()
  await axe(page)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await stop.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(dialog.getByTestId('confirm-stop')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('operation')).toContainText('Stop of bravo_lab', { timeout: 5_000 })
  await expect(card(page, 'bravo_lab').getByTestId('status')).toHaveText('Stopped', { timeout: 15_000 })
})

test('a failing make up shows its exit code and offers a retry', async ({ page }) => {
  await waitIdle(page)
  await card(page, 'echo_lab').getByTestId('start').click()
  await expect(page.getByTestId('operation')).toContainText('failed (exit code 2)', { timeout: 15_000 })
  await expect(card(page, 'echo_lab').getByTestId('status')).toHaveText('Failed')
  await expect(card(page, 'echo_lab')).toContainText('make up failed with exit code 2')
  await expect(card(page, 'echo_lab').getByTestId('start')).toHaveText(/Retry start/)
  await expect(page.getByTestId('announce')).toHaveText('Start of echo_lab failed with exit code 2.')
  await axe(page)
})

test('controller offline: says what to run and marks the last answer stale', async ({ page }) => {
  await page.route('**/api/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"controller-offline"}' }))
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByTestId('offline')).toContainText('make up RUNTIME=podman')
  await expect(page.getByTestId('controller')).toHaveText(/Controller offline/)
  await expect(page.getByTestId('stale').first()).toBeVisible()
  await expect(card(page, 'alpha_lab').getByTestId('stop')).toBeDisabled()
  await axe(page)
})

test('no eligible labs: explains what makes a lab show up', async ({ page }) => {
  await page.route('**/api/labs', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ labs: [], excluded: [], operation: null, refreshS: 15, observedAt: null }) }))
  await page.reload()
  await expect(page.getByTestId('empty')).toContainText('records its resource prefix')
  await axe(page)
})

test('reduced motion stops the spinners', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Refresh' }).click()
  const anim = await page.evaluate(() => {
    const el = document.createElement('span')
    el.className = 'spin'
    document.body.append(el)
    return getComputedStyle(el).animationName
  })
  expect(anim).toBe('none')
})
