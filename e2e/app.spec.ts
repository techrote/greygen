import { expect, test } from '@playwright/test'

test('loads the Greygen foundation shell without pretending audio is available', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Greygen')
  await expect(page.getByRole('heading', { level: 1, name: 'Greygen' })).toBeVisible()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()

  const startButton = page.getByRole('button', { name: 'Start audio' })
  await expect(startButton).toBeDisabled()
  await expect(
    page.getByText('Audio synthesis is intentionally not implemented', {
      exact: false,
    }),
  ).toBeVisible()
})
