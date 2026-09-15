import { describe, expect, it } from 'vitest'
import { createSpectrumState } from '../../src/audio/dsp/spectra'
import {
  GENERATOR_BANDS,
  GENERATOR_PRESETS,
  applyNamedPreset,
  bandAccessibleName,
  formatSignedDb,
  isModifiedPreset,
  resetAllUserBandOffsets,
  resetUserBandOffset,
  setUserBandOffset,
} from '../../src/features/generator/uiModel'

describe('primary generator UI model', () => {
  it('exposes the ten human-readable spectral bands', () => {
    expect(GENERATOR_BANDS.map((band) => band.label)).toEqual([
      '31',
      '62',
      '125',
      '250',
      '500',
      '1k',
      '2k',
      '4k',
      '8k',
      '16k',
    ])
  })

  it('derives preset labels from the canonical spectral target registry', () => {
    expect(GENERATOR_PRESETS).toEqual([
      { id: 'white', label: 'White' },
      { id: 'pink', label: 'Pink' },
      { id: 'brown', label: 'Brown / Red' },
      { id: 'grey', label: 'Grey (Practical)' },
    ])
  })

  it('marks user band edits as Modified and lets reset actions clear them', () => {
    const base = createSpectrumState('grey')
    const edited = setUserBandOffset(base, 2, 4)

    expect(base.userBandOffsetsDb[2]).toBe(0)
    expect(edited.userBandOffsetsDb[2]).toBe(4)
    expect(isModifiedPreset(edited)).toBe(true)
    expect(isModifiedPreset(resetUserBandOffset(edited, 2))).toBe(false)
    expect(isModifiedPreset(resetAllUserBandOffsets(edited))).toBe(false)
  })

  it('applying a named preset produces a clean preset state', () => {
    const preset = applyNamedPreset('pink')
    expect(preset.targetId).toBe('pink')
    expect(preset.userBandOffsetsDb).toEqual(Array(10).fill(0))
    expect(isModifiedPreset(preset)).toBe(false)
  })

  it('formats explicit numeric and accessible gain readouts', () => {
    expect(formatSignedDb(3)).toBe('+3.0 dB')
    expect(formatSignedDb(-2.5)).toBe('-2.5 dB')
    expect(formatSignedDb(0)).toBe('0.0 dB')
    expect(bandAccessibleName(GENERATOR_BANDS[9], 2)).toBe(
      '16k band gain, +2.0 dB',
    )
  })
})
