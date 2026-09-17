import { expect, test } from '@playwright/test'

async function startIndependentGuidedCalibration(
  page: import('@playwright/test').Page,
) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await page.getByLabel('Independent left / right').check()
  await page.locator('#calibration-comfort-confirm').check()
  await page.getByRole('button', { name: 'Begin guided calibration' }).click()
}

test('independent guided calibration measures left then right, keeps master fixed, and saves private v3 evidence', async ({
  page,
}) => {
  await startIndependentGuidedCalibration(page)
  const masterBefore = await page.locator('#master-gain').inputValue()

  for (let index = 0; index < 18; index += 1) {
    const region = page.locator('.guided-calibration-active')
    await expect(region).toContainText(`Match ${index + 1} of 18`)
    await expect(region).toHaveAttribute(
      'data-channel',
      index < 9 ? 'left' : 'right',
    )
    await page.getByRole('button', { name: 'Hear 1 kHz reference' }).click()
    await page.getByRole('button', { name: /^Hear test / }).click()
    await page.getByRole('button', { name: 'About equal' }).click()
  }

  await expect(
    page.getByRole('heading', { name: 'Guided calibration result' }),
  ).toBeVisible()
  await expect(page.locator('.guided-calibration-active')).toContainText(
    'Independent L/R',
  )
  await expect(page.locator('.guided-calibration-active')).toContainText(
    'asymmetry is not a diagnosis',
  )
  await expect(page.locator('#master-gain')).toHaveValue(masterBefore)

  const beforeSave = await page.evaluate(() =>
    localStorage.getItem('greygen.profile-state'),
  )
  expect(beforeSave ?? '').not.toContain('Independent Guided E2E')

  await page.locator('#guided-audition-mode').selectOption('balanced')
  await page.locator('#guided-audition-mode').selectOption('full')
  await page.locator('#guided-audition-mode').selectOption('off')
  await page.locator('#guided-profile-name').fill('Independent Guided E2E')
  await page.locator('#guided-profile-note').fill('L/R test headphones')
  await page
    .getByRole('button', { name: 'Save local profile in Balanced mode' })
    .click()

  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
  await expect(page.locator('#calibration-mode')).toHaveValue('balanced')
  await expect(page.locator('#master-gain')).toHaveValue(masterBefore)
  const stored = await page.evaluate(() =>
    localStorage.getItem('greygen.profile-state'),
  )
  expect(stored ?? '').toContain('Independent Guided E2E')
  expect(stored ?? '').toContain('L/R test headphones')
  expect(stored ?? '').toContain('"payloadSchemaVersion":3')
  expect(stored ?? '').toContain('"channelMode":"independent"')
  expect(stored ?? '').toContain('"leftMeasurement"')
  expect(stored ?? '').toContain('"rightMeasurement"')
})

test('profile rename, duplicate, explicit personal export/import, and malformed import stay local and silent', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()

  await page.locator('#calibration-profile-name').fill('Portable L/R')
  await page.locator('#calibration-profile-note').fill('Private device note')
  await page.locator('#manual-channel-mode').selectOption('independent')
  await page.locator('#calibration-left-band-0').fill('12')
  await page.locator('#calibration-right-band-0').fill('-12')
  await page.getByRole('button', { name: 'Save local profile' }).click()
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )

  await page.locator('#active-calibration-name').fill('Portable L/R renamed')
  await page
    .locator('#active-calibration-note')
    .fill('Renamed private device note')
  await page.getByRole('button', { name: 'Save name / note' }).click()
  await expect(
    page.getByRole('list', { name: 'Calibration profiles' }),
  ).toContainText('Portable L/R renamed')

  await page.getByRole('button', { name: 'Duplicate profile' }).click()
  await expect(
    page
      .getByRole('list', { name: 'Calibration profiles' })
      .getByRole('listitem'),
  ).toHaveCount(2)
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )

  await page.locator('.profile-portability-details summary').click()
  await page
    .getByRole('button', { name: 'Prepare active profile export' })
    .click()
  const exported = await page.locator('#calibration-export-json').inputValue()
  expect(exported).toContain('greygen-personal-calibration-profile')
  expect(exported).toContain('personal-playback-calibration')
  expect(exported).toContain('Portable L/R renamed')
  expect(exported).toContain('Renamed private device note')
  expect(exported).not.toContain('calibration-1')

  const shareUrl = await page.locator('#share-url').inputValue()
  const decodedShare = await page.evaluate((url) => {
    const value = new URL(url).hash.slice(1).split('=')[1]
    const padding = '='.repeat((4 - (value.length % 4)) % 4)
    return atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  }, shareUrl)
  expect(decodedShare).not.toContain('Portable L/R renamed')
  expect(decodedShare).not.toContain('Renamed private device note')
  expect(decodedShare).not.toContain('greygen-personal-calibration-profile')

  await page.locator('#calibration-import-json').fill(exported)
  await page.getByRole('button', { name: 'Validate & import locally' }).click()
  await expect(page.getByRole('status')).toContainText('Imported')
  await expect(
    page
      .getByRole('list', { name: 'Calibration profiles' })
      .getByRole('listitem'),
  ).toHaveCount(3)
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()

  await page.locator('#calibration-import-json').fill('{broken')
  await page.getByRole('button', { name: 'Validate & import locally' }).click()
  await expect(page.getByRole('status')).toContainText('malformed')
  await expect(
    page
      .getByRole('list', { name: 'Calibration profiles' })
      .getByRole('listitem'),
  ).toHaveCount(3)
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
})
