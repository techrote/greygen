import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_STIMULUS_BASE_GAIN_DB,
  CALIBRATION_STIMULUS_TRANSITION_SECONDS,
  calibrationStimulusGainLinear,
  createCalibrationStimulusState,
} from '../../src/audio/dsp/calibrationStimulus'
import { GreygenDspEngine } from '../../src/audio/dsp/engine'

describe('transient calibration stimulus', () => {
  it('is versioned, finite, and hard-bounded to the calibration correction range', () => {
    expect(createCalibrationStimulusState()).toEqual({
      schemaVersion: 1,
      mode: 'inactive',
      bandIndex: 5,
      levelOffsetDb: 0,
    })
    expect(CALIBRATION_STIMULUS_BASE_GAIN_DB).toBe(-18)
    expect(CALIBRATION_STIMULUS_TRANSITION_SECONDS).toBe(0.04)
    expect(
      calibrationStimulusGainLinear(
        createCalibrationStimulusState('band', 0, 24),
      ),
    ).toBeCloseTo(10 ** (6 / 20), 12)
    expect(() => createCalibrationStimulusState('band', 10, 0)).toThrow(
      RangeError,
    )
    expect(() => createCalibrationStimulusState('band', 0, 24.01)).toThrow(
      RangeError,
    )
  })

  it('accounts for the maximum probe in deterministic safety pre-gain', () => {
    const engine = new GreygenDspEngine({ sampleRate: 48_000, seed: 1234 })
    const normalSafety = engine.safetyPreGainTargetLinear
    engine.setCalibrationStimulusState(
      createCalibrationStimulusState('band', 5, 24),
    )
    expect(engine.safetyPreGainTargetLinear).toBeLessThan(normalSafety)
  })

  it('fades to explicit calibration silence rather than hard-switching normal audio', () => {
    const engine = new GreygenDspEngine({ sampleRate: 48_000, seed: 1234 })
    const warmup = new Float32Array(48_000)
    engine.renderMono(warmup)

    engine.setCalibrationStimulusState(
      createCalibrationStimulusState('silent', 5, 0),
    )
    const transition = new Float32Array(1)
    engine.renderMono(transition)
    expect(Math.abs(transition[0])).toBeGreaterThan(0)

    const settle = new Float32Array(48_000)
    engine.renderMono(settle)
    const tail = settle.subarray(settle.length - 1024)
    const peak = tail.reduce(
      (maximum, value) => Math.max(maximum, Math.abs(value)),
      0,
    )
    expect(peak).toBeLessThan(1e-6)
  })

  it('restores normal deterministic output smoothly after ending stimulus mode', () => {
    const engine = new GreygenDspEngine({ sampleRate: 48_000, seed: 77 })
    engine.renderMono(new Float32Array(8192))
    engine.setCalibrationStimulusState(
      createCalibrationStimulusState('band', 2, 6),
    )
    engine.renderMono(new Float32Array(4096))
    engine.setCalibrationStimulusState(createCalibrationStimulusState())
    const restored = new Float32Array(48_000)
    engine.renderMono(restored)
    expect(restored.every(Number.isFinite)).toBe(true)
    expect(engine.calibrationStimulusState.mode).toBe('inactive')
  })
})
