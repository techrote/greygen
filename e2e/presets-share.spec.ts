import { expect, test } from '@playwright/test'

test('saves, loads, sanitizes, and deletes full user sound presets while built-ins remain spectral-only', async ({
  page,
}) => {
  await page.goto('/')

  await page.locator('#spectral-preset').selectOption('pink')
  const band = page.locator('#band-2')
  await band.focus()
  await page.keyboard.press('ArrowUp')
  await expect(band).toHaveValue('1')
  await page.locator('#master-gain').fill('-17')
  await page.locator('#stereo-width').fill('0.82')
  await page.locator('#animation-mode').selectOption('orbit')
  await page.locator('#animation-depth').fill('7.5')
  await page.locator('#animation-speed').fill('1.75')
  await page.locator('#animation-energy').uncheck()

  await page
    .locator('#user-preset-name')
    .fill('<img src=x onerror=boom> My\nPreset')
  await page.getByRole('button', { name: 'Save preset' }).click()

  const list = page.getByRole('list', { name: 'Saved sound presets' })
  await expect(list).toContainText('img src=x onerror=boom My Preset')
  await expect(list.locator('img')).toHaveCount(0)
  await expect(page.locator('.preset-state strong')).toHaveText(
    'img src=x onerror=boom My Preset',
  )
  await expect(page.locator('.preset-state span')).toHaveText('Saved preset')

  await page.locator('#spectral-preset').selectOption('brown')
  await expect(page.locator('#band-2')).toHaveValue('0')
  await expect(page.locator('#master-gain')).toHaveValue('-17')
  await expect(page.locator('#stereo-width')).toHaveValue('0.82')
  await expect(page.locator('#animation-mode')).toHaveValue('orbit')
  await expect(page.locator('#animation-depth')).toHaveValue('7.5')
  await expect(page.locator('#animation-speed')).toHaveValue('1.75')
  await expect(page.locator('#animation-energy')).not.toBeChecked()
  await expect(page.locator('.preset-state strong')).toHaveText('Brown / Red')
  await expect(page.locator('.preset-state span')).toHaveText('Preset')

  await list.getByRole('button', { name: 'Load' }).click()
  await expect(page.locator('#spectral-preset')).toHaveValue('pink')
  await expect(page.locator('#band-2')).toHaveValue('1')
  await expect(page.locator('#master-gain')).toHaveValue('-17')
  await expect(page.locator('#stereo-width')).toHaveValue('0.82')
  await expect(page.locator('#animation-mode')).toHaveValue('orbit')
  await expect(page.locator('#animation-depth')).toHaveValue('7.5')
  await expect(page.locator('#animation-speed')).toHaveValue('1.75')
  await expect(page.locator('#animation-energy')).not.toBeChecked()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.locator('.preset-state span')).toHaveText('Saved preset')

  await page
    .getByRole('button', {
      name: 'Delete saved preset img src=x onerror=boom My Preset',
    })
    .click()
  await expect(list).toHaveCount(0)
  await expect(
    page.getByText('No local sound presets saved yet.'),
  ).toBeVisible()
})

test('manual and direct share imports restore only sound state and never auto-start audio', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(
            globalThis as typeof globalThis & { __copiedGreygenShare?: string }
          ).__copiedGreygenShare = text
        },
      },
    })
  })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem(
      'greygen.profile-state',
      JSON.stringify({
        schemaVersion: 1,
        profiles: [
          {
            recordSchemaVersion: 1,
            id: 'secret-profile',
            name: 'SECRET private headphones',
            kind: 'calibration',
            payloadSchemaVersion: 1,
            payload: { note: 'SECRET profile note' },
          },
        ],
      }),
    )
  })
  await page.reload()

  await page.locator('#spectral-preset').selectOption('pink')
  const band = page.locator('#band-2')
  await band.focus()
  await page.keyboard.press('ArrowUp')
  await page.locator('#master-gain').fill('-19')
  await page.locator('#stereo-width').fill('0.91')
  await page.locator('#animation-mode').selectOption('wander')
  await page.locator('#animation-depth').fill('6.5')
  await page.locator('#animation-speed').fill('1.5')

  const shareUrl = await page.locator('#share-url').inputValue()
  expect(shareUrl).toContain('#s=')
  expect(shareUrl).not.toContain('SECRET')
  const decoded = await page.evaluate((url) => {
    const value = new URL(url).hash.slice(1).split('=')[1]
    const padding = '='.repeat((4 - (value.length % 4)) % 4)
    return atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  }, shareUrl)
  expect(decoded).not.toContain('SECRET')
  expect(decoded).not.toContain('secret-profile')
  expect(decoded).not.toContain('calibration')

  await page.getByRole('button', { name: 'Copy share link' }).click()
  await expect(
    page.getByText('Share link copied. It contains sound settings only.'),
  ).toBeVisible()
  const copiedShare = await page.evaluate(
    () =>
      (globalThis as typeof globalThis & { __copiedGreygenShare?: string })
        .__copiedGreygenShare,
  )
  expect(copiedShare).toBe(shareUrl)

  await page.getByRole('button', { name: 'Reset sound settings' }).click()
  await expect(page.locator('#spectral-preset')).toHaveValue('grey')

  const directPage = await page.context().newPage()
  await directPage.goto(shareUrl)
  await expect(directPage.locator('#spectral-preset')).toHaveValue('pink')
  await expect(directPage.locator('#band-2')).toHaveValue('1')
  await expect(directPage.locator('#master-gain')).toHaveValue('-19')
  await expect(directPage.locator('#stereo-width')).toHaveValue('0.91')
  await expect(directPage.locator('#animation-mode')).toHaveValue('wander')
  await expect(directPage.getByText('Ready', { exact: true })).toBeVisible()
  await expect(
    directPage.getByRole('button', { name: 'Start audio' }),
  ).toBeEnabled()
  await expect(
    directPage.getByText('Audio remains Ready until you choose Start', {
      exact: false,
    }),
  ).toBeVisible()
  expect(directPage.url()).not.toContain('#s=')
  await directPage.close()

  await page.locator('#share-import-url').fill(shareUrl)
  await page.getByRole('button', { name: 'Load shared sound' }).click()
  await expect(page.locator('#spectral-preset')).toHaveValue('pink')
  await expect(page.locator('#band-2')).toHaveValue('1')
  await expect(page.locator('#master-gain')).toHaveValue('-19')
  await expect(page.locator('#stereo-width')).toHaveValue('0.91')
  await expect(page.locator('#animation-mode')).toHaveValue('wander')
  await expect(page.locator('#animation-depth')).toHaveValue('6.5')
  await expect(page.locator('#animation-speed')).toHaveValue('1.5')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
  await expect(
    page.getByText('Loading did not start audio', { exact: false }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Reset sound settings' }).click()
  await expect(page.locator('#spectral-preset')).toHaveValue('grey')
  await page.goto(shareUrl)

  await expect(page.locator('#spectral-preset')).toHaveValue('pink')
  await expect(page.locator('#band-2')).toHaveValue('1')
  await expect(page.locator('#master-gain')).toHaveValue('-19')
  await expect(page.locator('#stereo-width')).toHaveValue('0.91')
  await expect(page.locator('#animation-mode')).toHaveValue('wander')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
  await expect(
    page.getByText('Loading did not start audio', { exact: false }),
  ).toBeVisible()
  expect(page.url()).not.toContain('#s=')
})

test('future share versions fail visibly and safely without replacing local sound or starting audio', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('#spectral-preset').selectOption('brown')
  const validUrl = await page.locator('#share-url').inputValue()
  const futureUrl = await page.evaluate((url) => {
    const parsed = new URL(url)
    const value = parsed.hash.slice(1).split('=')[1]
    const padding = '='.repeat((4 - (value.length % 4)) % 4)
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
    const payload = JSON.parse(decoded) as unknown[]
    payload[0] = 99
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    parsed.hash = `s=${encoded}`
    return parsed.toString()
  }, validUrl)

  await page.goto(futureUrl)
  await expect(page.locator('#spectral-preset')).toHaveValue('brown')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
  await expect(
    page.getByText('newer than this Greygen build', { exact: false }),
  ).toBeVisible()
})
