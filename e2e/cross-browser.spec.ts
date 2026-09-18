import { expect, type Page, test } from '@playwright/test'

const browserName = (projectName: string): string =>
  projectName.replace(/-core$/u, '')

const startAudioFromKeyboard = async (page: Page): Promise<void> => {
  const start = page.getByRole('button', { name: 'Start audio' })
  await expect(start).toBeEnabled()
  await start.press('Enter')
  await expect(page.locator('.status-value')).toHaveText('Running', {
    timeout: 10_000,
  })
  await expect(
    page.getByText('Audio engine active', { exact: false }),
  ).toBeVisible()
}

test('core generator state and persistence are interoperable', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await expect(page).toHaveTitle('Greygen')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.locator('.band-control')).toHaveCount(10)

  await page.locator('#spectral-preset').selectOption('pink')
  await page.locator('#band-2').fill('3')
  await page.locator('#master-gain').fill('-20')
  await page.locator('#stereo-width').fill('0.73')
  await page.locator('#animation-mode').selectOption('breathe')
  await page.locator('#animation-depth').fill('5')
  await page.locator('#animation-speed').fill('1.25')

  await page.reload()

  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.locator('#spectral-preset')).toHaveValue('pink')
  await expect(page.locator('#band-2')).toHaveValue('3')
  await expect(page.locator('#master-gain')).toHaveValue('-20')
  await expect(page.locator('#stereo-width')).toHaveValue('0.73')
  await expect(page.locator('#animation-mode')).toHaveValue('breathe')
  await expect(page.locator('#animation-depth')).toHaveValue('5')
  await expect(page.locator('#animation-speed')).toHaveValue('1.25')
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()

  expect(
    pageErrors,
    `${browserName(testInfo.project.name)} page errors`,
  ).toEqual([])
})

test('real AudioWorklet lifecycle survives repeated start/stop and analyzer teardown', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')

  for (let cycle = 0; cycle < 3; cycle += 1) {
    // Keyboard activation remains a genuine user gesture while avoiding a
    // stale service-worker update banner intercepting pointer events.
    await startAudioFromKeyboard(page)

    if (cycle === 0) {
      await page.getByRole('button', { name: 'Open analyzer' }).click()
      await expect(page.locator('.analyzer-panel')).toBeVisible()
      await expect
        .poll(async () =>
          Number(
            await page
              .locator('.analyzer-panel')
              .getAttribute('data-sample-count'),
          ),
        )
        .toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Close analyzer' }).click()
      await expect(page.locator('.analyzer-panel')).toHaveCount(0)
    }

    const stop = page.getByRole('button', { name: 'Stop audio' })
    await stop.press('Enter')
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Audio context closed', { exact: false }),
    ).toBeVisible()
  }

  expect(
    pageErrors,
    `${browserName(testInfo.project.name)} page errors`,
  ).toEqual([])
})

test('normal share URLs exclude private profile data and never auto-start', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'greygen.profile-state',
      JSON.stringify({
        schemaVersion: 1,
        profiles: [
          {
            recordSchemaVersion: 1,
            id: 'cross-browser-secret-profile',
            name: 'CROSS_BROWSER_SECRET headphones',
            kind: 'calibration',
            payloadSchemaVersion: 1,
            payload: { note: 'CROSS_BROWSER_SECRET note' },
          },
        ],
      }),
    )
  })
  await page.reload()

  await page.locator('#spectral-preset').selectOption('brown')
  await page.locator('#band-4').fill('-2')
  await page.locator('#stereo-width').fill('0.88')
  const shareUrl = await page.locator('#share-url').inputValue()

  expect(shareUrl).toContain('#s=')
  expect(shareUrl).not.toContain('CROSS_BROWSER_SECRET')
  const decoded = await page.evaluate((url) => {
    const encoded = new URL(url).hash.slice(1).split('=')[1]
    const padding = '='.repeat((4 - (encoded.length % 4)) % 4)
    return atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + padding)
  }, shareUrl)
  expect(decoded).not.toContain('CROSS_BROWSER_SECRET')
  expect(decoded).not.toContain('cross-browser-secret-profile')
  expect(decoded).not.toContain('calibration')

  await page.goto(shareUrl)
  await expect(page.locator('#spectral-preset')).toHaveValue('brown')
  await expect(page.locator('#band-4')).toHaveValue('-2')
  await expect(page.locator('#stereo-width')).toHaveValue('0.88')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
  expect(page.url()).not.toContain('#s=')
})
