import { expect, test } from '@playwright/test'

test('loads Ready and remains silent until the explicit Start action', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Greygen')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Greygen' }),
  ).toBeVisible()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()

  const startButton = page.getByRole('button', { name: 'Start audio' })
  await expect(startButton).toBeEnabled()
  await expect(
    page.getByText('Audio stays silent until you choose Start', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(page.locator('.meter-strip')).toHaveCount(0)
})

test('starts the worklet, receives bounded digital meters, and closes cleanly', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await page.getByRole('button', { name: 'Start audio' }).click()

  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Audio engine active', { exact: false }),
  ).toBeVisible()
  await expect(page.locator('.status-dot[data-status="running"]')).toBeVisible()

  const meters = page.locator('dl[aria-label="Digital output meters"]')
  await expect(meters).toBeVisible()
  await expect(meters.getByText('Peak', { exact: true })).toBeVisible()
  await expect(meters.getByText('RMS', { exact: true })).toBeVisible()
  await expect(
    meters.getByText('Safety pre-gain', { exact: true }),
  ).toBeVisible()
  await expect(meters.getByText('dBFS', { exact: false }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Stop audio' }).click()
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Audio context closed', { exact: false }),
  ).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('surfaces missing AudioWorklet capability instead of swallowing it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'AudioWorkletNode', {
      configurable: true,
      value: undefined,
    })
  })

  await page.goto('/')

  await expect(page.getByText('Unsupported', { exact: true })).toBeVisible()
  await expect(
    page.getByText('AudioWorkletNode support', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeDisabled()
})
