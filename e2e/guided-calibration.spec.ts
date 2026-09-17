import { expect, test } from '@playwright/test'

async function startGuidedCalibration(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Guided perceived-level calibration' }),
  ).toBeVisible()
  await expect(
    page.getByText('this is not a medical hearing test', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText('never turn the system up aggressively', { exact: false }),
  ).toBeVisible()

  const begin = page.getByRole('button', { name: 'Begin guided calibration' })
  await expect(begin).toBeDisabled()
  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await page.locator('#calibration-comfort-confirm').check()
  await expect(begin).toBeEnabled()
  await begin.click()
  await expect(page.locator('.guided-calibration-active')).toBeVisible()
}

test('guided calibration completes deterministic mocked matches and saves only after explicit review', async ({
  page,
}) => {
  await startGuidedCalibration(page)

  const masterBefore = await page.locator('#master-gain').inputValue()
  let sawExtremeCaveat = false

  for (let index = 0; index < 9; index += 1) {
    const region = page.locator('.guided-calibration-active')
    await expect(region).toContainText(`Match ${index + 1} of 9`)
    if ((await region.locator('.calibration-caveat').count()) > 0) {
      sawExtremeCaveat = true
      await expect(region.locator('.calibration-caveat')).toContainText(
        'Skip it rather than increasing overall volume aggressively',
      )
    }

    if (index === 0) {
      await page.locator('#guided-keyboard-control').focus()
      await page.keyboard.press('Space')
      await expect(
        page.getByRole('button', { name: /^Hear test / }),
      ).toBeVisible()
      await page.keyboard.press('Space')
      await expect(region).toContainText(
        'Heard reference: yes · Heard test: yes',
      )
      await page.keyboard.press('ArrowDown')
    } else {
      await page.getByRole('button', { name: 'Hear 1 kHz reference' }).click()
      await page.getByRole('button', { name: /^Hear test / }).click()
      await page.getByRole('button', { name: 'About equal' }).click()
    }
  }

  expect(sawExtremeCaveat).toBe(true)
  await expect(
    page.getByRole('heading', { name: 'Guided calibration result' }),
  ).toBeVisible()
  await expect(page.locator('.calibration-review-band')).toHaveCount(10)
  await expect(page.locator('#master-gain')).toHaveValue(masterBefore)

  const beforeSave = await page.evaluate(() =>
    localStorage.getItem('greygen.profile-state'),
  )
  expect(beforeSave ?? '').not.toContain('Guided E2E')

  await page.locator('#guided-audition-mode').selectOption('balanced')
  await page.locator('#guided-audition-mode').selectOption('full')
  await page.locator('#guided-audition-mode').selectOption('off')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()

  await page.locator('#guided-profile-name').fill('Guided E2E')
  await page
    .getByRole('button', { name: 'Save local profile in Balanced mode' })
    .click()

  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )
  await expect(page.locator('#calibration-mode')).toHaveValue('balanced')
  const stored = await page.evaluate(() =>
    localStorage.getItem('greygen.profile-state'),
  )
  expect(stored ?? '').toContain('Guided E2E')
  expect(stored ?? '').toContain('guided-narrow-band-v1')
  expect(stored ?? '').toContain('"calibrationMode":"balanced"')
  await expect(page.locator('#master-gain')).toHaveValue(masterBefore)
})

test('guided calibration supports skip, silence, Stop, abort, and clean restart without saving', async ({
  page,
}) => {
  await startGuidedCalibration(page)

  await page
    .getByRole('button', { name: 'Skip / cannot comfortably match' })
    .click()
  await expect(page.locator('.guided-calibration-active')).toContainText(
    'Match 2 of 9',
  )

  await page.getByRole('button', { name: 'Hear 1 kHz reference' }).click()
  await page.getByRole('button', { name: 'Silence calibration' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Stop audio' }).click()
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Abort calibration' }).click()
  await expect(
    page.getByRole('heading', { name: 'Guided perceived-level calibration' }),
  ).toBeVisible()
  const abortedStorage = await page.evaluate(() =>
    localStorage.getItem('greygen.profile-state'),
  )
  expect(abortedStorage ?? '').not.toContain('guided-narrow-band-v1')

  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect(page.locator('#calibration-comfort-confirm')).not.toBeChecked()
  await page.locator('#calibration-comfort-confirm').check()
  await page.getByRole('button', { name: 'Begin guided calibration' }).click()
  await expect(page.locator('.guided-calibration-active')).toContainText(
    'Match 1 of 9',
  )
  await page.locator('#guided-keyboard-control').focus()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('heading', { name: 'Guided perceived-level calibration' }),
  ).toBeVisible()
})
