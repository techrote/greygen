import { describe, expect, it } from 'vitest'
import {
  BAND_COUNT,
  MAX_FILTER_BANK_GAIN_LINEAR,
  TenBandFilterBank,
} from '../../src/audio/dsp/filterBank'
import { Xoshiro128StarStar } from '../../src/audio/dsp/rng'
import { blockStatistics } from '../../src/audio/dsp/statistics'

const SAMPLE_RATES = [44_100, 48_000, 96_000]

describe('TenBandFilterBank topology and state', () => {
  it('exposes the runtime high-band degradation policy', () => {
    expect(new TenBandFilterBank(44_100).highBandMode).toBe(
      'degraded-high-shelf',
    )
    expect(new TenBandFilterBank(48_000).highBandMode).toBe(
      'degraded-high-shelf',
    )

    const highRateBank = new TenBandFilterBank(96_000)
    expect(highRateBank.highBandMode).toBe('bounded-bandpass')
    expect(highRateBank.highBandUpperEdgeHz).not.toBeNull()
  })

  it('validates band indices and gain values before mutating state', () => {
    const bank = new TenBandFilterBank(48_000)
    expect(bank.getBandGainLinear(0)).toBe(1)
    bank.setBandGainLinear(0, 2)
    expect(bank.getBandGainLinear(0)).toBe(2)

    expect(() => bank.setBandGainLinear(-1, 1)).toThrow(RangeError)
    expect(() => bank.setBandGainLinear(BAND_COUNT, 1)).toThrow(RangeError)
    expect(() => bank.setBandGainLinear(0, -1)).toThrow(RangeError)
    expect(() =>
      bank.setBandGainLinear(0, MAX_FILTER_BANK_GAIN_LINEAR + 1),
    ).toThrow(RangeError)
    expect(() => bank.setBandGainLinear(0, Number.NaN)).toThrow(RangeError)
    expect(() => bank.setBandGainsLinear([1, 2, 3])).toThrow(RangeError)
  })

  it.each(SAMPLE_RATES)(
    'reconstructs neutral input sample-for-sample at %d Hz',
    (sampleRate) => {
      const bank = new TenBandFilterBank(sampleRate)
      const generator = new Xoshiro128StarStar(0x5eed_1234, sampleRate)
      let maximumError = 0

      for (let index = 0; index < 16_384; index += 1) {
        const input = generator.nextBipolar()
        const output = bank.processSample(input)
        maximumError = Math.max(maximumError, Math.abs(output - input))
      }

      expect(maximumError).toBeLessThan(2e-12)
    },
  )

  it.each(SAMPLE_RATES)(
    'has finite decaying impulse components at %d Hz',
    (sampleRate) => {
      const bank = new TenBandFilterBank(sampleRate)
      const components = new Float64Array(BAND_COUNT)
      const frameCount = 32_768
      const tailStart = frameCount - 1024
      let tailPeak = 0

      for (let frame = 0; frame < frameCount; frame += 1) {
        const ultrasonicResidual = bank.processBandComponents(
          frame === 0 ? 1 : 0,
          components,
        )
        expect(Number.isFinite(ultrasonicResidual)).toBe(true)

        for (let band = 0; band < BAND_COUNT; band += 1) {
          expect(Number.isFinite(components[band])).toBe(true)
          if (frame >= tailStart) {
            tailPeak = Math.max(tailPeak, Math.abs(components[band]))
          }
        }
      }

      expect(tailPeak).toBeLessThan(1e-8)
    },
  )

  it.each(SAMPLE_RATES)(
    'reset reproduces a non-neutral deterministic render at %d Hz',
    (sampleRate) => {
      const bank = new TenBandFilterBank(sampleRate)
      bank.setBandGainsLinear([0.5, 1, 1.5, 2, 0.75, 1.25, 0.25, 3, 0.8, 1.2])
      const input = new Float32Array(4096)
      const generator = new Xoshiro128StarStar(0xabcd_1234)
      generator.fillBipolar(input)

      const first = Array.from(input, (sample) => bank.processSample(sample))
      bank.reset()
      const second = Array.from(input, (sample) => bank.processSample(sample))
      expect(second).toEqual(first)
    },
  )

  it.each(SAMPLE_RATES)(
    'remains finite over a long non-neutral deterministic render at %d Hz',
    (sampleRate) => {
      const bank = new TenBandFilterBank(sampleRate)
      bank.setBandGainsLinear([
        0.25, 0.5, 0.75, 1, 1.5, 2, 1.25, 0.5, 1.75, 0.8,
      ])
      const generator = new Xoshiro128StarStar(0xdeca_fbad, sampleRate)
      const output = new Float32Array(1 << 19)

      for (let index = 0; index < output.length; index += 1) {
        const sample = bank.processSample(generator.nextBipolar())
        expect(Number.isFinite(sample)).toBe(true)
        output[index] = sample
      }

      const statistics = blockStatistics(output)
      expect(Math.abs(statistics.mean)).toBeLessThan(0.01)
      expect(statistics.rms).toBeLessThan(2)
      expect(statistics.peakAbsolute).toBeLessThan(5)
    },
  )
})
