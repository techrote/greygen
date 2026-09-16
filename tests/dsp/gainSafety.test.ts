import { describe, expect, it } from 'vitest'
import {
  ANIMATION_BAND_OFFSET_LIMIT_DB,
  CALIBRATION_BAND_OFFSET_LIMIT_DB,
  FINAL_GUARD_LIMIT_LINEAR,
  MASTER_GAIN_MAX_DB,
  applyFinalGuard,
  computeSafetyPreGainLinear,
  createGainStageState,
  estimateFilterBankPeakGain,
  resolveGainTargets,
} from '../../src/audio/dsp/gainSafety'
import { gainToDecibels } from '../../src/audio/dsp/numbers'
import {
  USER_BAND_OFFSET_MAX_DB,
  createSpectrumState,
  resolveSpectrumState,
} from '../../src/audio/dsp/spectra'

function filled(value: number): Float64Array {
  return new Float64Array(10).fill(value)
}

describe('gain safety model', () => {
  it.each([44_100, 48_000, 96_000])(
    'recognizes neutral white reconstruction as unity gain at %i Hz',
    (sampleRate) => {
      const spectral = resolveSpectrumState(createSpectrumState('white'))
      const estimate = estimateFilterBankPeakGain(
        sampleRate,
        spectral.bandGainsLinear,
        spectral.ultrasonicResidualGainLinear,
      )

      expect(estimate).toBeCloseTo(1, 10)
      expect(gainToDecibels(computeSafetyPreGainLinear(estimate))).toBeCloseTo(
        -1,
        10,
      )
    },
  )

  it.each([44_100, 48_000, 96_000])(
    'derives finite conservative pre-gain for maximum accepted layers at %i Hz',
    (sampleRate) => {
      const spectrum = createSpectrumState(
        'white',
        filled(USER_BAND_OFFSET_MAX_DB),
      )
      const spectral = resolveSpectrumState(spectrum)
      const gainStage = createGainStageState(
        MASTER_GAIN_MAX_DB,
        filled(ANIMATION_BAND_OFFSET_LIMIT_DB),
        filled(CALIBRATION_BAND_OFFSET_LIMIT_DB),
      )
      const targets = resolveGainTargets(sampleRate, spectral, gainStage)

      expect(targets.bandGainsLinear.every(Number.isFinite)).toBe(true)
      expect(targets.estimatedShapedPeakLinear).toBeGreaterThan(100)
      expect(targets.safetyPreGainLinear).toBeGreaterThan(0)
      expect(targets.safetyPreGainLinear).toBeLessThan(0.02)
    },
  )

  it('accounts for positive calibration correction before master gain', () => {
    const spectral = resolveSpectrumState(createSpectrumState('white'))
    const neutral = resolveGainTargets(
      48_000,
      spectral,
      createGainStageState(0),
    )
    const correction = new Float64Array(10)
    correction[2] = 24
    correction[3] = 24
    correction[4] = 24
    const corrected = resolveGainTargets(
      48_000,
      spectral,
      createGainStageState(0, filled(0), correction),
    )

    expect(corrected.estimatedShapedPeakLinear).toBeGreaterThan(
      neutral.estimatedShapedPeakLinear,
    )
    expect(corrected.safetyPreGainLinear).toBeLessThan(
      neutral.safetyPreGainLinear,
    )
    expect(gainToDecibels(corrected.safetyPreGainLinear)).toBeLessThan(-10)
  })

  it('keeps dynamic and calibration layers explicitly bounded and versioned', () => {
    const animation = filled(0)
    const calibration = filled(0)
    animation[2] = ANIMATION_BAND_OFFSET_LIMIT_DB
    calibration[7] = -CALIBRATION_BAND_OFFSET_LIMIT_DB

    const state = createGainStageState(-12, animation, calibration)
    expect(state.schemaVersion).toBe(1)
    expect(state.masterGainDb).toBe(-12)
    expect(state.animationBandOffsetsDb[2]).toBe(ANIMATION_BAND_OFFSET_LIMIT_DB)
    expect(state.calibrationBandOffsetsDb[7]).toBe(
      -CALIBRATION_BAND_OFFSET_LIMIT_DB,
    )

    animation[0] = ANIMATION_BAND_OFFSET_LIMIT_DB + 0.01
    expect(() => createGainStageState(-12, animation, calibration)).toThrow(
      RangeError,
    )
  })

  it('makes the final guard a strict last-resort legal-output boundary', () => {
    expect(applyFinalGuard(2)).toBe(FINAL_GUARD_LIMIT_LINEAR)
    expect(applyFinalGuard(-2)).toBe(-FINAL_GUARD_LIMIT_LINEAR)
    expect(applyFinalGuard(Number.NaN)).toBe(0)
    expect(applyFinalGuard(0.25)).toBe(0.25)
  })
})