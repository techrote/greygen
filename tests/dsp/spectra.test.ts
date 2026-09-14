import { describe, expect, it } from 'vitest'
import {
  BAND_COUNT,
  TenBandFilterBank,
} from '../../src/audio/dsp/filterBank'
import {
  BROWN_PSD_SLOPE_DB_PER_OCTAVE,
  PINK_PSD_SLOPE_DB_PER_OCTAVE,
  SPECTRAL_PRESET_IDS,
  USER_BAND_OFFSET_MAX_DB,
  applySpectrumStateToFilterBank,
  createSpectrumState,
  getSpectralTarget,
  resolveSpectrumState,
} from '../../src/audio/dsp/spectra'

describe('spectral target model', () => {
  it('keeps all preset target values finite and versioned', () => {
    for (const presetId of SPECTRAL_PRESET_IDS) {
      const target = getSpectralTarget(presetId)
      expect(target.schemaVersion).toBe(1)
      expect(target.targetDbByBand).toHaveLength(BAND_COUNT)
      expect(target.targetDbByBand.every(Number.isFinite)).toBe(true)
    }
  })

  it('defines pink and brown targets mathematically rather than as arbitrary labels', () => {
    const pink = getSpectralTarget('pink')
    const brown = getSpectralTarget('brown')

    expect(pink.expectedPsdSlopeDbPerOctave).toBe(
      PINK_PSD_SLOPE_DB_PER_OCTAVE,
    )
    expect(brown.expectedPsdSlopeDbPerOctave).toBe(
      BROWN_PSD_SLOPE_DB_PER_OCTAVE,
    )
    expect(pink.targetDbByBand[1] - pink.targetDbByBand[0]).toBeCloseTo(
      PINK_PSD_SLOPE_DB_PER_OCTAVE,
      10,
    )
    expect(brown.targetDbByBand[1] - brown.targetDbByBand[0]).toBeCloseTo(
      BROWN_PSD_SLOPE_DB_PER_OCTAVE,
      10,
    )
  })

  it('locks Grey Practical v1 provenance and target values', () => {
    const grey = getSpectralTarget('grey')
    const expected = [
      -0.0009424031462170745,
      -0.5999999999999996,
      -1.6233657087297182,
      -2.94211764020492,
      -4.11470450020652,
      -4.590517410026723,
      -3.9647045002065204,
      -2.6421176402049196,
      -1.173365708729718,
      0,
    ]

    expect(grey.provenance).toContain('original Greygen')
    expect(grey.provenance).toContain('not ISO 226')
    expect(grey.provenance).toContain('not a transcription of myNoise')
    for (let index = 0; index < expected.length; index += 1) {
      expect(grey.targetDbByBand[index]).toBeCloseTo(expected[index], 12)
    }
  })

  it('keeps user offsets separate from the immutable target definition', () => {
    const targetBefore = getSpectralTarget('pink').targetDbByBand
    const offsets = new Float64Array(BAND_COUNT)
    offsets[4] = 6
    const state = createSpectrumState('pink', offsets)
    const configuration = resolveSpectrumState(state)
    const baseline = resolveSpectrumState(createSpectrumState('pink'))

    expect(getSpectralTarget('pink').targetDbByBand).toBe(targetBefore)
    expect(configuration.bandGainsLinear[4]).toBeCloseTo(
      baseline.bandGainsLinear[4] * 10 ** (6 / 20),
      12,
    )
    expect(configuration.bandGainsLinear[3]).toBe(
      baseline.bandGainsLinear[3],
    )
  })

  it('validates user-offset shape and safety bounds', () => {
    expect(() => createSpectrumState('white', [0, 1])).toThrow(RangeError)
    const offsets = new Float64Array(BAND_COUNT)
    offsets[0] = USER_BAND_OFFSET_MAX_DB + 0.01
    expect(() => createSpectrumState('white', offsets)).toThrow(RangeError)
  })

  it('applies target state without exposing crossover internals to callers', () => {
    const bank = new TenBandFilterBank(96_000)
    applySpectrumStateToFilterBank(bank, createSpectrumState('brown'))
    const configuration = resolveSpectrumState(createSpectrumState('brown'))

    expect(bank.getBandGainLinear(0)).toBe(configuration.bandGainsLinear[0])
    expect(bank.ultrasonicResidualGainLinear).toBe(
      configuration.ultrasonicResidualGainLinear,
    )
  })
})
