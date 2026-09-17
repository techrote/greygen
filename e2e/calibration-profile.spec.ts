import { expect, test } from '@playwright/test'

test('saves, applies, persists, bypasses, and deliberately deletes a private calibration profile without autoplay', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Playback calibration' }),
  ).toBeVisible()

  await page.locator('#calibration-profile-name').fill('Desk headphones')
  await page.locator('#calibration-profile-note').fill('USB DAC private note')
  await page.locator('#calibration-left-band-2').fill('10')
  await page.locator('#calibration-left-band-4').fill('-6')
  await page.locator('#calibration-left-band-7').fill('')
  await page.getByRole('button', { name: 'Save local profile' }).click()

  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
  await expect(page.locator('#calibration-mode')).toHaveValue('balanced')
  await expect(
    page.getByRole('list', { name: 'Calibration profiles' }),
  ).toContainText('Desk headphones')
  await expect(
    page.getByRole('list', { name: 'Calibration profiles' }),
  ).toContainText('USB DAC private note')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()

  const stored = await page.evaluate(() =>
    localStorage.getItem('greygen.profile-state'),
  )
  expect(stored).not.toBeNull()
  expect(stored).toContain('Desk headphones')
  expect(stored).toContain('USB DAC private note')
  expect(stored).toContain('"calibrationMode":"balanced"')
  expect(stored).toContain('null')

  const shareUrl = await page.locator('#share-url').inputValue()
  expect(shareUrl).not.toContain('Desk headphones')
  const decodedShare = await page.evaluate((url) => {
    const value = new URL(url).hash.slice(1).split('=')[1]
    const padding = '='.repeat((4 - (value.length % 4)) % 4)
    return atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  }, shareUrl)
  expect(decodedShare).not.toContain('Desk headphones')
  expect(decodedShare).not.toContain('USB DAC private note')
  expect(decodedShare).not.toContain('calibration-1')
  expect(decodedShare).not.toContain('calibrationMode')

  await page.locator('#calibration-mode').selectOption('full')
  await expect(page.locator('#calibration-mode')).toHaveValue('full')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
  await expect(page.locator('#calibration-mode')).toHaveValue('full')
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()

  await page.getByRole('button', { name: 'Bypass profile' }).click()
  await expect(page.locator('#calibration-mode')).toHaveValue('off')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()

  await page
    .getByRole('button', {
      name: 'Delete calibration profile Desk headphones',
    })
    .click()
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
  await page
    .getByRole('button', {
      name: 'Confirm delete calibration profile Desk headphones',
    })
    .click()
  await expect(page.locator('#calibration-profile-select')).toHaveValue('')
  await expect(page.locator('#calibration-mode')).toHaveValue('off')
  await expect(
    page.getByRole('list', { name: 'Calibration profiles' }),
  ).toHaveCount(0)

  await page.locator('#calibration-profile-name').fill('Temporary profile')
  await page.getByRole('button', { name: 'Save local profile' }).click()
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
  await page.getByRole('button', { name: 'Delete local profiles' }).click()
  await expect(page.locator('#calibration-profile-select')).toHaveValue('')
  await expect(page.locator('#calibration-mode')).toHaveValue('off')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() =>
        localStorage.getItem('greygen.profile-state'),
      )
      return raw ? JSON.parse(raw) : null
    })
    .toEqual({
      schemaVersion: 2,
      profiles: [],
      activeProfileId: null,
      calibrationMode: 'off',
    })
})

test('corrupt profile storage recovers safely and stays silent', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('greygen.profile-state', '{broken profile json')
  })
  await page.reload()

  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.locator('#calibration-profile-select')).toHaveValue('')
  await expect(page.locator('#calibration-mode')).toHaveValue('off')
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
  await expect(
    page.getByText('Private profile JSON was malformed', { exact: false }),
  ).toBeVisible()
})
