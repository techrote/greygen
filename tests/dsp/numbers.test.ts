import { describe, expect, it } from 'vitest'
import {
  MAX_DECIBELS,
  MIN_DECIBELS,
  clampFinite,
  decibelsToGain,
  gainToDecibels,
} from '../../src/audio/dsp/numbers'

describe('finite numeric helpers', () => {
  it('clamps finite values and rejects invalid bounds or inputs', () => {
    expect(clampFinite(5, 0, 10)).toBe(5)
    expect(clampFinite(-2, 0, 10)).toBe(0)
    expect(clampFinite(12, 0, 10)).toBe(10)
    expect(() => clampFinite(Number.NaN, 0, 1)).toThrow(RangeError)
    expect(() => clampFinite(0, 2, 1)).toThrow(RangeError)
  })
})

describe('decibel conversion', () => {
  it.each([-120, -24, -6, 0, 12, 60, 120])(
    'round-trips %d dB through linear gain',
    (decibels) => {
      expect(gainToDecibels(decibelsToGain(decibels))).toBeCloseTo(
        decibels,
        10,
      )
    },
  )

  it('clamps extreme dB inputs to finite documented bounds', () => {
    expect(decibelsToGain(-1000)).toBe(decibelsToGain(MIN_DECIBELS))
    expect(decibelsToGain(1000)).toBe(decibelsToGain(MAX_DECIBELS))
    expect(Number.isFinite(decibelsToGain(1000))).toBe(true)
  })

  it('maps zero gain to the floor and rejects negative/non-finite gain', () => {
    expect(gainToDecibels(0)).toBe(MIN_DECIBELS)
    expect(gainToDecibels(0, -96)).toBe(-96)
    expect(() => gainToDecibels(-1)).toThrow(RangeError)
    expect(() => gainToDecibels(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})
