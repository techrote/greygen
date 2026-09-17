import { describe, expect, it } from 'vitest'
import {
  MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB,
  createChannelCalibrationState,
} from '../../src/audio/dsp/channelCalibration'
import { GreygenDspEngine } from '../../src/audio/dsp/engine'
import { createGainStageState } from '../../src/audio/dsp/gainSafety'
import { createSpectrumState } from '../../src/audio/dsp/spectra'
import { createStereoWidthState } from '../../src/audio/dsp/stereo'

function rms(values: Float32Array): number {
  let sum = 0
  for (const value of values) {
    sum += value * value
  }
  return Math.sqrt(sum / values.length)
}

describe('channel calibration', () => {
  it('keeps linked neutral state exactly symmetric', () => {
    const state = createChannelCalibrationState()
    expect(state.leftBandOffsetsDb).toEqual(Array(10).fill(0))
    expect(state.rightBandOffsetsDb).toEqual(Array(10).fill(0))
  })

  it('caps every applied inter-channel correction difference to a 2:1 amplitude ratio', () => {
    const state = createChannelCalibrationState(
      [24, 12, 0, 0, 0, 0, 0, 0, 0, 0],
      [-24, -12, 0, 0, 0, 0, 0, 0, 0, 0],
    )
    for (let index = 0; index < 10; index += 1) {
      expect(
        Math.abs(
          state.leftBandOffsetsDb[index] - state.rightBandOffsetsDb[index],
        ),
      ).toBeLessThanOrEqual(MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB + 1e-12)
    }
    expect(
      state.leftBandOffsetsDb[0] - state.rightBandOffsetsDb[0],
    ).toBeCloseTo(MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB, 12)
  })

  it('rejects non-finite/out-of-range channel data', () => {
    expect(() =>
      createChannelCalibrationState(
        [25, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        Array(10).fill(0),
      ),
    ).toThrow(/between -24 and 24/)
    expect(() =>
      createChannelCalibrationState(
        [Number.NaN, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        Array(10).fill(0),
      ),
    ).toThrow(/finite/)
  })

  it('applies correction to actual output channels rather than decorrelation source streams', () => {
    const left = Array(10).fill(3)
    const right = Array(10).fill(-3)
    const engine = new GreygenDspEngine({
      sampleRate: 48000,
      seed: 0x1234_5678,
      spectrumState: createSpectrumState('white'),
      gainStageState: createGainStageState(0),
      stereoWidthState: createStereoWidthState(0),
      channelCalibrationState: createChannelCalibrationState(left, right),
    })
    const leftOutput = new Float32Array(65536)
    const rightOutput = new Float32Array(65536)
    engine.renderStereo(leftOutput, rightOutput)
    const ratio = rms(leftOutput) / rms(rightOutput)
    expect(ratio).toBeGreaterThan(1.9)
    expect(ratio).toBeLessThan(2.1)
  })

  it('uses the more demanding output channel for deterministic safety pre-gain', () => {
    const neutral = new GreygenDspEngine({
      sampleRate: 48000,
      spectrumState: createSpectrumState('white'),
      gainStageState: createGainStageState(0),
      channelCalibrationState: createChannelCalibrationState(),
    })
    const asymmetric = new GreygenDspEngine({
      sampleRate: 48000,
      spectrumState: createSpectrumState('white'),
      gainStageState: createGainStageState(0),
      channelCalibrationState: createChannelCalibrationState(
        Array(10).fill(6),
        Array(10).fill(0),
      ),
    })
    expect(asymmetric.safetyPreGainTargetLinear).toBeLessThan(
      neutral.safetyPreGainTargetLinear,
    )
  })

  it('keeps the legacy linked gain-stage calibration constructor equivalent to explicit linked channel state', () => {
    const correction = [2, 1, 0, -1, -2, 0, 1, 2, 1, 0]
    const legacy = new GreygenDspEngine({
      sampleRate: 48000,
      seed: 99,
      spectrumState: createSpectrumState('grey'),
      gainStageState: createGainStageState(0, new Float64Array(10), correction),
      stereoWidthState: createStereoWidthState(0.5),
    })
    const explicit = new GreygenDspEngine({
      sampleRate: 48000,
      seed: 99,
      spectrumState: createSpectrumState('grey'),
      gainStageState: createGainStageState(0),
      stereoWidthState: createStereoWidthState(0.5),
      channelCalibrationState: createChannelCalibrationState(correction),
    })
    const legacyLeft = new Float32Array(4096)
    const legacyRight = new Float32Array(4096)
    const explicitLeft = new Float32Array(4096)
    const explicitRight = new Float32Array(4096)
    legacy.renderStereo(legacyLeft, legacyRight)
    explicit.renderStereo(explicitLeft, explicitRight)
    expect(legacyLeft).toEqual(explicitLeft)
    expect(legacyRight).toEqual(explicitRight)
  })
})
