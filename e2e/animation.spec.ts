import { expect, test } from '@playwright/test'

test('animation controls are real, keyboard operable, and do not autoplay', async ({
  page,
}) => {
  await page.goto('/')

  const mode = page.locator('#animation-mode')
  const depth = page.locator('#animation-depth')
  const speed = page.locator('#animation-speed')
  const energy = page.locator('#animation-energy')

  await expect(mode).toHaveValue('off')
  await mode.selectOption('drift')
  await expect(mode).toHaveValue('drift')

  await depth.focus()
  await page.keyboard.press('ArrowUp')
  await expect(depth).toHaveValue('4.5')

  await speed.focus()
  await page.keyboard.press('ArrowUp')
  await expect(speed).toHaveValue('1.25')

  await expect(energy).toBeChecked()
  await energy.uncheck()
  await expect(energy).not.toBeChecked()

  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
})

test('animation mode, depth, speed, and normalization persist without autoplay', async ({
  page,
}) => {
  await page.goto('/')

  await page.locator('#animation-mode').selectOption('wander')
  await page.locator('#animation-depth').fill('7.5')
  await page.locator('#animation-speed').fill('2.25')
  await page.locator('#animation-energy').uncheck()

  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await page.reload()

  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.locator('#animation-mode')).toHaveValue('wander')
  await expect(page.locator('#animation-depth')).toHaveValue('7.5')
  await expect(page.locator('#animation-speed')).toHaveValue('2.25')
  await expect(page.locator('#animation-energy')).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
})

test('real worklet accepts animation changes while running and meters continue', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()

  const meters = page.locator('dl[aria-label="Digital output meters"]')
  await expect(meters.getByText(/-?\d+\.\d dBFS/).first()).toBeVisible()

  await page.locator('#animation-mode').selectOption('orbit')
  await page.locator('#animation-depth').fill('12')
  await page.locator('#animation-speed').fill('4')
  await expect(page.locator('#animation-mode')).toHaveValue('orbit')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect(meters.getByText(/-?\d+\.\d dBFS/).first()).toBeVisible()

  await page.locator('#animation-mode').selectOption('off')
  await expect(page.locator('#animation-mode')).toHaveValue('off')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Stop audio' }).click()
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})
