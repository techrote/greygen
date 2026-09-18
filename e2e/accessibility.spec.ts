/// <reference lib="dom" />

import { expect, test, type Page } from '@playwright/test'

interface SemanticAuditResult {
  readonly duplicateIds: readonly string[]
  readonly unnamedControls: readonly string[]
  readonly positiveTabIndexes: readonly string[]
}

async function runSemanticAudit(page: Page): Promise<SemanticAuditResult> {
  return page.evaluate(() => {
    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) {
        return false
      }
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }

    const accessibleName = (element: HTMLElement): string => {
      const ariaLabel = element.getAttribute('aria-label')?.trim()
      if (ariaLabel) {
        return ariaLabel
      }
      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ')
        if (text) {
          return text
        }
      }
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        const labelText = Array.from(element.labels ?? [])
          .map((label) => label.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ')
        if (labelText) {
          return labelText
        }
      }
      return element.textContent?.trim() ?? ''
    }

    const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map(
      (element) => element.id,
    )
    const duplicateIds = Array.from(
      new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
    )

    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, summary, a[href]',
      ),
    ).filter(visible)
    const unnamedControls = controls
      .filter((element) => accessibleName(element).length === 0)
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}`)

    const positiveTabIndexes = Array.from(
      document.querySelectorAll<HTMLElement>('[tabindex]'),
    )
      .filter((element) => Number(element.getAttribute('tabindex')) > 0)
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}`)

    return { duplicateIds, unnamedControls, positiveTabIndexes }
  })
}

async function startAudioFromKeyboard(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: 'Start audio' })
  await start.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
}

test('core controls expose semantic names, visible focus, and keyboard fine/coarse adjustment', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start audio' })).toBeEnabled()

  await page.keyboard.press('Tab')
  const start = page.getByRole('button', { name: 'Start audio' })
  await expect(start).toBeFocused()
  const outline = await start.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    }
  })
  expect(outline.style).not.toBe('none')
  expect(outline.width).toBeGreaterThanOrEqual(3)

  await page.keyboard.press('Enter')
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  const stop = page.getByRole('button', { name: 'Stop audio' })
  await expect(stop).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible()

  const preset = page.locator('#spectral-preset')
  await preset.focus()
  await page.keyboard.press('Home')
  const firstPreset = await preset.inputValue()
  await page.keyboard.press('ArrowDown')
  expect(await preset.inputValue()).not.toBe(firstPreset)

  const band = page.locator('#band-5')
  await band.focus()
  await page.keyboard.press('Home')
  expect(Number(await band.inputValue())).toBe(-24)
  await page.keyboard.press('ArrowUp')
  expect(Number(await band.inputValue())).toBe(-23)
  await page.keyboard.press('PageUp')
  expect(Number(await band.inputValue())).toBeGreaterThan(-23)
  await page.keyboard.press('End')
  await expect(band).toHaveAttribute('aria-valuetext', '+24.0 dB')

  const reset = page.getByRole('button', { name: 'Reset 1k band to 0 dB' })
  await expect(reset).toBeEnabled()
  const resetBox = await reset.boundingBox()
  expect(resetBox?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(resetBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  await reset.focus()
  await page.keyboard.press('Enter')
  await expect(band).toHaveValue('0')

  const audit = await runSemanticAudit(page)
  expect(audit.duplicateIds).toEqual([])
  expect(audit.unnamedControls).toEqual([])
  expect(audit.positiveTabIndexes).toEqual([])
})

test('profile selection and guided calibration can be completed and aborted from the keyboard with predictable focus', async ({
  page,
}) => {
  await page.goto('/')

  const manualName = page.locator('#calibration-profile-name')
  await manualName.focus()
  await page.keyboard.type('Keyboard profile')
  const saveManual = page.getByRole('button', { name: 'Save local profile' })
  await saveManual.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#calibration-profile-select')).toHaveValue(
    'calibration-1',
  )

  const profileSelect = page.locator('#calibration-profile-select')
  await profileSelect.focus()
  await page.keyboard.press('Home')
  await expect(profileSelect).toHaveValue('')
  await page.keyboard.press('ArrowDown')
  await expect(profileSelect).toHaveValue('calibration-1')

  await startAudioFromKeyboard(page)
  const comfort = page.locator('#calibration-comfort-confirm')
  await comfort.focus()
  await page.keyboard.press('Space')
  await expect(comfort).toBeChecked()
  const begin = page.getByRole('button', { name: 'Begin guided calibration' })
  await begin.focus()
  await page.keyboard.press('Enter')

  const active = page.locator('#guided-keyboard-control')
  await expect(active).toBeFocused()

  const silence = page.getByRole('button', { name: 'Silence calibration' })
  await silence.focus()
  await page.keyboard.press('Space')
  await expect(
    page.getByText('Heard reference: no · Heard test: no', { exact: true }),
  ).toBeVisible()
  await active.focus()

  for (let index = 0; index < 9; index += 1) {
    await expect(active).toContainText(`Match ${index + 1} of 9`)
    await page.keyboard.press('Space')
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
  }

  await expect(
    page.getByRole('heading', { name: 'Guided calibration result' }),
  ).toBeVisible()
  const review = page.locator('.guided-calibration-active')
  await expect(review).toBeFocused()

  const guidedName = page.locator('#guided-profile-name')
  await guidedName.focus()
  await page.keyboard.type('Keyboard guided profile')
  await page.keyboard.press('Escape')
  await expect(guidedName).toBeFocused()
  await expect(
    page.getByRole('heading', { name: 'Guided calibration result' }),
  ).toBeVisible()

  const saveGuided = page.getByRole('button', {
    name: 'Save local profile in Balanced mode',
  })
  await saveGuided.focus()
  await page.keyboard.press('Enter')
  const intro = page.locator('.guided-calibration').first()
  await expect(intro).toBeFocused()
  await expect(page.locator('#calibration-mode')).toHaveValue('balanced')

  await comfort.focus()
  await page.keyboard.press('Space')
  await begin.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#guided-keyboard-control')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(intro).toBeFocused()
  await expect(
    page.getByRole('heading', { name: 'Guided perceived-level calibration' }),
  ).toBeVisible()
})

test('narrow portrait and landscape layouts keep the ten-band scroller bounded and transport immediately reachable', async ({
  page,
}) => {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)

    const bandScroll = page.locator('.band-scroll')
    const scrollMetrics = await bandScroll.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowX: getComputedStyle(element).overflowX,
    }))
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth)
    expect(['auto', 'scroll']).toContain(scrollMetrics.overflowX)

    await startAudioFromKeyboard(page)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const stop = page.getByRole('button', { name: 'Stop audio' })
    await expect(stop).toBeVisible()
    const box = await stop.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width,
    )
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height,
    )
    await stop.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
  }
})

test('reduced-motion preference suppresses visual transitions without changing spectral animation state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true)

  const mode = page.locator('#animation-mode')
  await mode.focus()
  await page.keyboard.press('End')
  await expect(mode).toHaveValue('orbit')
  await page.reload()
  await expect(mode).toHaveValue('orbit')

  const transitionDurationMs = await page
    .getByRole('button', { name: 'Start audio' })
    .evaluate((element) => {
      const value = getComputedStyle(element).transitionDuration.trim()
      if (value.endsWith('ms')) {
        return Number.parseFloat(value)
      }
      if (value.endsWith('s')) {
        return Number.parseFloat(value) * 1000
      }
      return Number.POSITIVE_INFINITY
    })
  expect(transitionDurationMs).toBeLessThanOrEqual(0.02)
})
