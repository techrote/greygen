import { describe, expect, it } from 'vitest'
import { createDefaultSoundState } from '../../src/app/state/appState'
import { INITIAL_AUDIO_SNAPSHOT } from '../../src/app/App'
import {
  buildDiagnostics,
  buildSpectrumBars,
  clampAnalyzerDb,
} from '../../src/features/analyzer/analyzerModel'
import { GREYGEN_APP_VERSION } from '../../src/version'

describe('analyzer model', () => {
  it('clamps non-finite and out-of-range spectrum values', () => {
    expect(clampAnalyzerDb(Number.NaN, -120, 0)).toBe(-120)
    expect(clampAnalyzerDb(20, -120, 0)).toBe(0)
    expect(clampAnalyzerDb(-140, -120, 0)).toBe(-120)
  })

  it('builds bounded frequency bars without exposing bins past Nyquist', () => {
    const values = Float32Array.from(
      { length: 1024 },
      (_, index) => -120 + (index % 120),
    )
    const bars = buildSpectrumBars(values, 48000, 2048, -120, 0, 64)
    expect(bars).toHaveLength(64)
    expect(bars[0]?.startHz).toBe(0)
    expect(bars.at(-1)?.endHz).toBeLessThanOrEqual(24000)
    expect(bars.every((bar) => bar.level >= 0 && bar.level <= 1)).toBe(true)
  })

  it('formats private-safe versioned runtime diagnostics', () => {
    const rows = buildDiagnostics(
      INITIAL_AUDIO_SNAPSHOT,
      createDefaultSoundState(),
      false,
    )
    expect(rows).toContainEqual({
      label: 'Greygen',
      value: `v${GREYGEN_APP_VERSION}`,
    })
    expect(rows.some((row) => row.label === 'DSP engine')).toBe(true)
    expect(rows.some((row) => row.label === 'Audio protocol')).toBe(true)
    expect(rows.some((row) => row.label === 'Seed')).toBe(true)
    expect(rows.map((row) => row.label).join(' ')).not.toMatch(
      /profile|calibration/i,
    )
  })
})
