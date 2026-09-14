import { describe, expect, it } from 'vitest'
import {
  fitPsdSlopeDbPerOctave,
  welchPsd,
} from '../../src/audio/analysis/spectrum'
import { TenBandFilterBank } from '../../src/audio/dsp/filterBank'
import { Xoshiro128StarStar } from '../../src/audio/dsp/rng'
import { blockStatistics } from '../../src/audio/dsp/statistics'
import {
  BROWN_PSD_SLOPE_DB_PER_OCTAVE,
  PINK_PSD_SLOPE_DB_PER_OCTAVE,
  WHITE_PSD_SLOPE_DB_PER_OCTAVE,
  type SpectralPresetId,
  applySpectrumStateToFilterBank,
  createSpectrumState,
} from '../../src/audio/dsp/spectra'

const FIT_MINIMUM_HZ = 125
const FIT_MAXIMUM_HZ = 8000
const SLOPE_TOLERANCE_DB_PER_OCTAVE = 0.5

function renderPreset(
  presetId: SpectralPresetId,
  sampleRate: number,
  frameCount: number,
  seed: number,
): Float32Array {
  const bank = new TenBandFilterBank(sampleRate)
  applySpectrumStateToFilterBank(bank, createSpectrumState(presetId))
  const generator = new Xoshiro128StarStar(seed, sampleRate)
  const output = new Float32Array(frameCount)

  for (let index = 0; index < frameCount; index += 1) {
    output[index] = bank.processSample(generator.nextBipolar())
  }

  return output
}

function measuredSlope(
  presetId: SpectralPresetId,
  sampleRate: number,
  frameCount = 1 << 18,
): number {
  const output = renderPreset(presetId, sampleRate, frameCount, 0x51_0f_aa_17)
  const psd = welchPsd(output, sampleRate, 2048)
  return fitPsdSlopeDbPerOctave(psd, FIT_MINIMUM_HZ, FIT_MAXIMUM_HZ)
    .slopeDbPerOctave
}

describe('rendered preset PSD', () => {
  it.each([
    ['white', WHITE_PSD_SLOPE_DB_PER_OCTAVE],
    ['pink', PINK_PSD_SLOPE_DB_PER_OCTAVE],
    ['brown', BROWN_PSD_SLOPE_DB_PER_OCTAVE],
  ] as const)(
    '%s meets its PSD slope target at 44.1 and 48 kHz',
    (presetId, expectedSlope) => {
      for (const sampleRate of [44_100, 48_000]) {
        const slope = measuredSlope(presetId, sampleRate)
        expect(Math.abs(slope - expectedSlope)).toBeLessThan(
          SLOPE_TOLERANCE_DB_PER_OCTAVE,
        )
      }
    },
  )

  it.each([
    ['white', WHITE_PSD_SLOPE_DB_PER_OCTAVE],
    ['pink', PINK_PSD_SLOPE_DB_PER_OCTAVE],
    ['brown', BROWN_PSD_SLOPE_DB_PER_OCTAVE],
  ] as const)(
    '%s has 96 kHz spot coverage',
    (presetId, expectedSlope) => {
      const slope = measuredSlope(presetId, 96_000, 1 << 17)
      expect(Math.abs(slope - expectedSlope)).toBeLessThan(
        SLOPE_TOLERANCE_DB_PER_OCTAVE,
      )
    },
  )

  it('is exactly repeatable for the same seed, preset, and sample rate', () => {
    const first = renderPreset('pink', 48_000, 8192, 0x1234_abcd)
    const second = renderPreset('pink', 48_000, 8192, 0x1234_abcd)
    expect(second).toEqual(first)
  })

  it('keeps Brown / Red finite and bounded near DC rather than random-walking', () => {
    const output = renderPreset('brown', 48_000, 1 << 18, 0xb00b_1e55)
    const statistics = blockStatistics(output)
    const psd = welchPsd(output, 48_000, 8192)
    const nearDcSlope = fitPsdSlopeDbPerOctave(psd, 5, 30).slopeDbPerOctave

    expect(Math.abs(statistics.mean)).toBeLessThan(0.01)
    expect(Number.isFinite(statistics.rms)).toBe(true)
    expect(statistics.peakAbsolute).toBeLessThan(2)
    expect(nearDcSlope).toBeGreaterThan(-2)
  })
})
