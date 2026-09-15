import { expect, test } from '@playwright/test'

test('loads the primary generator Ready and never auto-starts', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Greygen')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Greygen' }),
  ).toBeVisible()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
  await expect(page.locator('#spectral-preset')).toHaveValue('grey')
  await expect(page.locator('.band-control')).toHaveCount(10)
  await expect(
    page.locator('dl[aria-label="Digital output meters"]'),
  ).toContainText('— dBFS')

  await page.reload()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()
})

test('preset, keyboard band, reset, and master controls update without starting audio', async ({
  page,
}) => {
  await page.goto('/')

  await page.locator('#spectral-preset').selectOption('pink')
  await expect(page.locator('#spectral-preset')).toHaveValue('pink')
  await expect(page.locator('.preset-state strong')).toHaveText('Pink')
  await expect(page.locator('.preset-state span')).toHaveText('Preset')

  const band = page.locator('#band-2')
  await band.focus()
  await page.keyboard.press('ArrowUp')
  await expect(band).toHaveValue('1')
  await expect(page.locator('.preset-state span')).toHaveText('Modified')
  await expect(page.getByText('+1.0 dB', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Reset 125 band to 0 dB' }).click()
  await expect(band).toHaveValue('0')
  await expect(page.locator('.preset-state span')).toHaveText('Preset')

  const master = page.locator('#master-gain')
  const before = Number(await master.inputValue())
  await master.focus()
  await page.keyboard.press('ArrowUp')
  const after = Number(await master.inputValue())
  expect(after).toBeGreaterThan(before)

  await band.focus()
  await page.keyboard.press('ArrowUp')
  await page.locator('#spectral-preset').selectOption('brown')
  await expect(page.locator('#spectral-preset')).toHaveValue('brown')
  await expect(band).toHaveValue('0')
  await expect(page.locator('.preset-state strong')).toHaveText('Brown / Red')
  await expect(page.locator('.preset-state span')).toHaveText('Preset')

  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
})

test('starts real worklet audio, receives meters, discloses high-band mode, and stops cleanly', async ({
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
  await expect(meters.getByText(/-?\d+\.\d dBFS/).first()).toBeVisible()

  await expect(page.getByText('High shelf', { exact: true })).toBeVisible()
  await expect(
    page.getByText('16k control is a stable high shelf', { exact: false }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Stop audio' }).click()
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Audio context closed', { exact: false }),
  ).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('browser suspension exposes Stop and explicit Resume', async ({
  page,
}) => {
  await page.addInitScript(() => {
    type CapturedAudioContext = {
      suspend(): Promise<void>
    }
    type BrowserGlobal = typeof globalThis & {
      AudioContext: new (...args: never[]) => CapturedAudioContext
      __greygenCapturedContexts?: CapturedAudioContext[]
    }

    const browserGlobal = globalThis as BrowserGlobal
    const OriginalAudioContext = browserGlobal.AudioContext
    const capturedContexts: CapturedAudioContext[] = []
    const WrappedAudioContext = new Proxy(OriginalAudioContext, {
      construct(target, args, newTarget) {
        const context = Reflect.construct(
          target,
          args,
          newTarget,
        ) as CapturedAudioContext
        capturedContexts.push(context)
        return context
      },
    })
    Object.defineProperty(browserGlobal, 'AudioContext', {
      configurable: true,
      value: WrappedAudioContext,
    })
    Object.defineProperty(browserGlobal, '__greygenCapturedContexts', {
      configurable: true,
      value: capturedContexts,
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Start audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()

  await page.evaluate(async () => {
    type CapturedAudioContext = {
      suspend(): Promise<void>
    }
    const scope = globalThis as typeof globalThis & {
      __greygenCapturedContexts: CapturedAudioContext[]
    }
    await scope.__greygenCapturedContexts[0].suspend()
  })

  await expect(page.getByText('Suspended', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume audio' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop audio' })).toBeVisible()

  await page.getByRole('button', { name: 'Resume audio' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
})

test('processor construction failure is visible and offers Retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class BrokenAudioWorkletNode {
      constructor() {
        throw new Error('fixture processor creation failure')
      }
    }
    Object.defineProperty(globalThis, 'AudioWorkletNode', {
      configurable: true,
      value: BrokenAudioWorkletNode,
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Start audio' }).click()

  await expect(page.getByText('Error', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry audio' })).toBeVisible()
  await expect(
    page.getByText('fixture processor creation failure', { exact: false }),
  ).toBeVisible()
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
