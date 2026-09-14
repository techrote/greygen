import { describe, expect, it } from 'vitest'
import {
  fitPsdSlopeDbPerOctave,
  type WelchPsdResult,
  welchPsd,
} from '../../src/audio/analysis/spectrum'

describe('spectral analysis', () => {
  it('places a deterministic sine peak within one FFT bin', () => {
    const sampleRate = 48_000
    const frequencyHz = 1000
    const samples = new Float64Array(8192)

    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin(
        (2 * Math.PI * frequencyHz * index) / sampleRate,
      )
    }

    const psd = welchPsd(samples, sampleRate, 2048)
    let peakBin = 1
    for (let bin = 2; bin < psd.power.length; bin += 1) {
      if (psd.power[bin] > psd.power[peakBin]) {
        peakBin = bin
      }
    }

    const peakFrequencyHz = peakBin * psd.binWidthHz
    expect(Math.abs(peakFrequencyHz - frequencyHz)).toBeLessThanOrEqual(
      psd.binWidthHz,
    )
    expect(psd.segmentCount).toBe(7)
  })

  it('recovers an exact synthetic log-frequency PSD slope', () => {
    const sampleRate = 48_000
    const segmentLength = 2048
    const binWidthHz = sampleRate / segmentLength
    const power = new Float64Array(segmentLength / 2 + 1)
    const expectedSlope = -3.0103

    for (let bin = 1; bin < power.length; bin += 1) {
      const frequencyHz = bin * binWidthHz
      power[bin] = 10 ** ((expectedSlope * Math.log2(frequencyHz / 1000)) / 10)
    }

    const psd: WelchPsdResult = {
      sampleRate,
      segmentLength,
      segmentCount: 1,
      binWidthHz,
      power,
    }
    const fit = fitPsdSlopeDbPerOctave(psd, 125, 8000)

    expect(fit.slopeDbPerOctave).toBeCloseTo(expectedSlope, 10)
    expect(fit.rSquared).toBeCloseTo(1, 10)
    expect(fit.binCount).toBeGreaterThan(100)
  })

  it('rejects invalid PSD fixture parameters deterministically', () => {
    const samples = new Float64Array(4096)
    expect(() => welchPsd(samples, 48_000, 1000)).toThrow(RangeError)
    expect(() => welchPsd(new Float64Array(32), 48_000, 2048)).toThrow(
      RangeError,
    )

    const psd = welchPsd(samples, 48_000, 2048)
    expect(() => fitPsdSlopeDbPerOctave(psd, 1000, 1000)).toThrow(RangeError)
    expect(() => fitPsdSlopeDbPerOctave(psd, 1000, 30_000)).toThrow(RangeError)
  })
})
