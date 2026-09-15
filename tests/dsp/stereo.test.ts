import { describe, expect, it } from 'vitest'
import { GreygenDspEngine } from '../../src/audio/dsp/engine'
import { createGainStageState } from '../../src/audio/dsp/gainSafety'
import { gainToDecibels } from '../../src/audio/dsp/numbers'
import { blockStatistics, isFiniteBlock } from '../../src/audio/dsp/statistics'
import {
  DEFAULT_STEREO_WIDTH,
  createStereoWidthState,
  stereoWidthLabel,
  stereoWidthToCorrelation,
} from '../../src/audio/dsp/stereo'
import { createSpectrumState } from '../../src/audio/dsp/spectra'

const SAMPLE_RATE = 48_000
const FIXTURE_FRAMES = 1 << 18

function pearsonCorrelation(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): number {
  if (left.length !== right.length || left.length === 0) {
    throw new RangeError('correlation fixtures must have equal non-zero length')
  }

  let leftMean = 0
  let rightMean = 0
  for (let index = 0; index < left.length; index += 1) {
    leftMean += left[index]
    rightMean += right[index]
  }
  leftMean /= left.length
  rightMean /= right.length

  let covariance = 0
  let leftSquares = 0
  let rightSquares = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    covariance += leftDelta * rightDelta
    leftSquares += leftDelta * leftDelta
    rightSquares += rightDelta * rightDelta
  }

  return covariance / Math.sqrt(leftSquares * rightSquares)
}

function renderStereoFixture(width: number, seed = 0x1357_9bdf) {
  const engine = new GreygenDspEngine({
    sampleRate: SAMPLE_RATE,
    seed,
    spectrumState: createSpectrumState('white'),
    gainStageState: createGainStageState(-12),
    stereoWidthState: createStereoWidthState(width),
  })
  const left = new Float32Array(FIXTURE_FRAMES)
  const right = new Float32Array(FIXTURE_FRAMES)
  engine.renderStereo(left, right)
  return { engine, left, right }
}

describe('stereo width model', () => {
  it('maps the normalized control to a safe non-negative correlation range', () => {
    expect(createStereoWidthState().width).toBe(DEFAULT_STEREO_WIDTH)
    expect(stereoWidthToCorrelation(0)).toBeCloseTo(1, 12)
    expect(stereoWidthToCorrelation(0.5)).toBeCloseTo(Math.SQRT1_2, 12)
    expect(stereoWidthToCorrelation(1)).toBeCloseTo(0, 12)
    expect(stereoWidthLabel(0)).toBe('Mono')
    expect(stereoWidthLabel(0.2)).toBe('Narrow')
    expect(stereoWidthLabel(0.5)).toBe('Normal')
    expect(stereoWidthLabel(0.9)).toBe('Wide')
    expect(() => createStereoWidthState(-0.01)).toThrow(RangeError)
    expect(() => createStereoWidthState(1.01)).toThrow(RangeError)
  })

  it.each([0, 0.5, 1])(
    'tracks requested correlation and channel power at width %s',
    (width) => {
      const { left, right } = renderStereoFixture(width)
      const correlation = pearsonCorrelation(left, right)
      const target = stereoWidthToCorrelation(width)
      const leftStats = blockStatistics(left)
      const rightStats = blockStatistics(right)
      const rmsDifferenceDb = Math.abs(
        gainToDecibels(leftStats.rms / rightStats.rms),
      )

      expect(isFiniteBlock(left)).toBe(true)
      expect(isFiniteBlock(right)).toBe(true)
      expect(correlation).toBeCloseTo(target, 1)
      expect(Math.abs(correlation - target)).toBeLessThanOrEqual(0.03)
      expect(rmsDifferenceDb).toBeLessThanOrEqual(0.25)
    },
  )

  it('keeps combined nominal RMS stable across normal width settings', () => {
    const widths = [0, 0.25, 0.5, 0.75, 1]
    const combinedDb = widths.map((width) => {
      const { left, right } = renderStereoFixture(width)
      const leftRms = blockStatistics(left).rms
      const rightRms = blockStatistics(right).rms
      return gainToDecibels(
        Math.sqrt((leftRms * leftRms + rightRms * rightRms) * 0.5),
      )
    })
    const spread = Math.max(...combinedDb) - Math.min(...combinedDb)
    expect(spread).toBeLessThanOrEqual(0.5)
  })

  it('reproduces stereo output exactly for the same seed and state', () => {
    const first = renderStereoFixture(0.73, 0x2468_ace0)
    const second = renderStereoFixture(0.73, 0x2468_ace0)

    expect(first.left).toEqual(second.left)
    expect(first.right).toEqual(second.right)
  })

  it('smooths width changes rather than snapping the correlation matrix', () => {
    const engine = new GreygenDspEngine({
      sampleRate: SAMPLE_RATE,
      stereoWidthState: createStereoWidthState(0),
    })
    const left = new Float32Array(1)
    const right = new Float32Array(1)

    engine.setStereoWidthState(createStereoWidthState(1))
    expect(engine.appliedStereoWidth).toBe(0)
    engine.renderStereo(left, right)
    expect(engine.appliedStereoWidth).toBeGreaterThan(0)
    expect(engine.appliedStereoWidth).toBeLessThan(1)

    engine.renderStereo(
      new Float32Array(SAMPLE_RATE),
      new Float32Array(SAMPLE_RATE),
    )
    expect(engine.appliedStereoWidth).toBeGreaterThan(0.99)
  })

  it('remains finite under rapid accepted width changes', () => {
    const engine = new GreygenDspEngine({ sampleRate: 96_000 })
    const left = new Float32Array(128)
    const right = new Float32Array(128)

    for (let iteration = 0; iteration < 256; iteration += 1) {
      engine.setStereoWidthState(
        createStereoWidthState(iteration % 2 === 0 ? 0 : 1),
      )
      engine.renderStereo(left, right)
      expect(isFiniteBlock(left)).toBe(true)
      expect(isFiniteBlock(right)).toBe(true)
    }
  })
})
