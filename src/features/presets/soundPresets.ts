import {
  SPECTRAL_PRESET_IDS,
  type SpectralPresetId,
  getSpectralTarget,
} from '../../audio/dsp/spectra'
import {
  type SoundState,
  createSoundState,
  serializeSoundState,
} from '../../app/state/appState'
import type {
  UserPresetLibraryState,
  UserSoundPreset,
} from '../../app/state/userPresetState'

export const BUILT_IN_PRESET_OWNED_FIELDS = Object.freeze([
  'targetId',
  'userBandOffsetsDb',
] as const)

export const USER_SOUND_PRESET_OWNED_FIELDS = Object.freeze([
  'seed',
  'targetId',
  'userBandOffsetsDb',
  'masterGainDb',
  'stereoWidth',
  'animation',
] as const)

export interface BuiltInSoundPresetDefinition {
  readonly id: SpectralPresetId
  readonly label: string
  readonly ownedFields: typeof BUILT_IN_PRESET_OWNED_FIELDS
}

export const BUILT_IN_SOUND_PRESETS: readonly BuiltInSoundPresetDefinition[] =
  Object.freeze(
    SPECTRAL_PRESET_IDS.map((id) =>
      Object.freeze({
        id,
        label: getSpectralTarget(id).label,
        ownedFields: BUILT_IN_PRESET_OWNED_FIELDS,
      }),
    ),
  )

export function applyBuiltInSoundPreset(
  state: SoundState,
  targetId: SpectralPresetId,
): SoundState {
  return createSoundState({
    seed: state.seed,
    targetId,
    userBandOffsetsDb: new Float64Array(state.userBandOffsetsDb.length),
    masterGainDb: state.masterGainDb,
    stereoWidth: state.stereoWidth,
    animation: state.animation,
  })
}

export function isBuiltInSoundPresetModified(state: SoundState): boolean {
  return state.userBandOffsetsDb.some((value) => value !== 0)
}

export function soundStatesEqual(left: SoundState, right: SoundState): boolean {
  return serializeSoundState(left) === serializeSoundState(right)
}

export function findMatchingSavedPreset(
  library: UserPresetLibraryState,
  sound: SoundState,
): UserSoundPreset | null {
  return (
    library.presets.find((preset) => soundStatesEqual(preset.sound, sound)) ??
    null
  )
}
