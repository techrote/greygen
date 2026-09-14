import { describe, expect, it } from 'vitest'
import {
  CROSSOVER_FREQUENCIES_HZ,
  HIGH_BAND_UPPER_CROSSOVER_HZ,
} from '../../src/audio/dsp/filterBank'
import {
  BilinearOnePoleLowPass,
  designBilinearOnePoleLowPass,
  isOnePoleCutoffSupported,
} from '../../src/audio/dsp/onePole'

const SAMPLE_RATES = [44_100, 48_000, 96_000]

describe('bilinear one-pole low-pass design', () => {
  it.each(SAMPLE_RATES)(
    'produces finite stable lower crossover coefficients at %d Hz',
    (sampleRate) => {
      for (const cutoffHz of CROSSOVER_FREQUENCIES_HZ) {
        const coefficients = designBilinearOnePoleLowPass(cutoffHz, sampleRate)
        expect(Number.isFinite(coefficients.b0)).toBe(true)
        expect(Number.isFinite(coefficients.b1)).toBe(true)
        expect(Number.isFinite(coefficients.a1)).toBe(true)
        expect(Math.abs(coefficients.a1)).toBeLessThan(1)
      }
    },
  )

  it('applies the explicit 90%-of-Nyquist safety margin to the top edge', () => {
    expect(isOnePoleCutoffSupported(HIGH_BAND_UPPER_CROSSOVER_HZ, 44_100)).toBe(
      false,
    )
    expect(isOnePoleCutoffSupported(HIGH_BAND_UPPER_CROSSOVER_HZ, 48_000)).toBe(
      false,
    )
    expect(isOnePoleCutoffSupported(HIGH_BAND_UPPER_CROSSOVER_HZ, 96_000)).toBe(
      true,
    )
  })

  it('rejects invalid or unsafe design inputs', () => {
    expect(() => designBilinearOnePoleLowPass(Number.NaN, 48_000)).toThrow(
      RangeError,
    )
    expect(() => designBilinearOnePoleLowPass(1000, 0)).toThrow(RangeError)
    expect(() => designBilinearOnePoleLowPass(23_000, 48_000)).toThrow(
      RangeError,
    )
  })

  it('has deterministic reset semantics', () => {
    const filter = new BilinearOnePoleLowPass(1000, 48_000)
    const input = [1, 0.5, -0.25, 0, 0.75]
    const first = input.map((sample) => filter.processSample(sample))
    filter.reset()
    const second = input.map((sample) => filter.processSample(sample))
    expect(second).toEqual(first)
  })
})
