import { expect, test } from '@playwright/test'

async function waitForServiceWorkerControl(
  page: import('@playwright/test').Page,
) {
  await page.evaluate(async () => {
    const serviceWorker = (
      navigator as unknown as {
        readonly serviceWorker: {
          readonly ready: Promise<unknown>
          readonly controller: unknown
          addEventListener(
            type: 'controllerchange',
            listener: () => void,
            options: { once: boolean },
          ): void
        }
      }
    ).serviceWorker

    await serviceWorker.ready
    if (serviceWorker.controller) {
      return
    }

    await new Promise<void>((resolve) => {
      serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      })
    })
  })
}

test('reopens the cached app shell offline and remains Ready', async ({
  context,
  page,
}) => {
  await page.goto('/')
  await waitForServiceWorkerControl(page)

  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await page.locator('#spectral-preset').selectOption('pink')
  await expect(page.locator('#spectral-preset')).toHaveValue('pink')

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(
    page.getByRole('heading', { level: 1, name: 'Greygen' }),
  ).toBeVisible()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
  await expect(page.locator('#spectral-preset')).toHaveValue('pink')
})
