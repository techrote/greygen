import { expect, test } from '@playwright/test'

test('analyzer opens lazily, reports deterministic diagnostics, and closes cleanly', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Analyzer & diagnostics' }),
  ).toBeVisible()
  await expect(page.locator('.analyzer-panel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open analyzer' }).click()
  await expect(page.locator('.analyzer-panel')).toBeVisible()
  await expect(
    page.getByRole('definition').filter({ hasText: 'v5' }).first(),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Private playback/calibration profile data is not included.',
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close analyzer' }).click()
  await expect(page.locator('.analyzer-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('running analyzer samples live spectrum and closing stops the render surface', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open analyzer' }).click()
  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect
    .poll(async () =>
      Number(
        await page.locator('.analyzer-panel').getAttribute('data-sample-count'),
      ),
    )
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Close analyzer' }).click()
  await expect(page.locator('.analyzer-panel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Stop audio' }).click()
})
