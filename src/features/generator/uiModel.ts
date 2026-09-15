import { BAND_COUNT, NOMINAL_BAND_CENTERS_HZ } from '../../audio/dsp/filterBank'
import {
  SPECTRAL_PRESET_IDS,
  USER_BAND_OFFSET_MAX_DB,
  USER_BAND_OFFSET_MIN_DB,
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
  getSpectralTarget,
} from '../../audio/dsp/spectra'

export const BAND_STEP_DB = 1
export const MASTER_STEP_DB = 1

export interface GeneratorBandDefinition {
  readonly index: number
  readonly frequencyHz: number
  readonly label: string
}

function formatFrequency(frequencyHz: number): string {
  if (frequencyHz >= 1000) {
    return `${frequencyHz / 1000}k`
  }
  return `${Math.round(frequencyHz)}`
}

export const GENERATOR_BANDS: readonly GeneratorBandDefinition[] =
  Object.freeze(
    NOMINAL_BAND_CENTERS_HZ.map((frequencyHz, index) =>
      Object.freeze({
        index,
        frequencyHz,
        label: formatFrequency(frequencyHz),
      }),
    ),
  )

if (GENERATOR_BANDS.length !== BAND_COUNT) {
  throw new Error('generator band model must match DSP band count')
}

export const GENERATOR_PRESETS = Object.freeze(
  SPECTRAL_PRESET_IDS.map((id) => {
    const target = getSpectralTarget(id)
    return Object.freeze({
      id,
      label: target.label,
    })
  }),
)

export function applyNamedPreset(targetId: SpectralPresetId): SpectrumState {
  return createSpectrumState(targetId)
}

export function setUserBandOffset(
  state: SpectrumState,
  index: number,
  valueDb: number,
): SpectrumState {
  if (!Number.isInteger(index) || index < 0 || index >= BAND_COUNT) {
    throw new RangeError(`band index must be between 0 and ${BAND_COUNT - 1}`)
  }

  const offsets = Array.from(state.userBandOffsetsDb)
  offsets[index] = valueDb
  return createSpectrumState(state.targetId, offsets)
}

export function resetUserBandOffset(
  state: SpectrumState,
  index: number,
): SpectrumState {
  return setUserBandOffset(state, index, 0)
}

export function resetAllUserBandOffsets(state: SpectrumState): SpectrumState {
  return createSpectrumState(state.targetId)
}

export function isModifiedPreset(state: SpectrumState): boolean {
  return state.userBandOffsetsDb.some((value) => value !== 0)
}

export function formatSignedDb(value: number): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} dB`
}

export function bandAccessibleName(
  band: GeneratorBandDefinition,
  valueDb: number,
): string {
  return `${band.label} band gain, ${formatSignedDb(valueDb)}`
}

export const USER_BAND_UI_MIN_DB = USER_BAND_OFFSET_MIN_DB
export const USER_BAND_UI_MAX_DB = USER_BAND_OFFSET_MAX_DB
