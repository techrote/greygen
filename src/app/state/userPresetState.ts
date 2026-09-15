import type { SoundState, StateParseCode } from './appState'
import {
  createSoundState,
  parseSoundState,
  serializeSoundState,
} from './appState'

export const USER_PRESET_LIBRARY_SCHEMA_VERSION = 1 as const
export const USER_PRESET_RECORD_SCHEMA_VERSION = 1 as const
export const USER_PRESET_NAME_MAX_LENGTH = 80
export const USER_PRESET_LIBRARY_MAX_COUNT = 64

export interface UserSoundPreset {
  readonly recordSchemaVersion: typeof USER_PRESET_RECORD_SCHEMA_VERSION
  readonly id: string
  readonly name: string
  readonly sound: SoundState
}

export interface UserPresetLibraryState {
  readonly schemaVersion: typeof USER_PRESET_LIBRARY_SCHEMA_VERSION
  readonly presets: readonly UserSoundPreset[]
}

export interface UserPresetParseResult {
  readonly state: UserPresetLibraryState
  readonly code: StateParseCode
  readonly messages: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sanitizeUserPresetName(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, USER_PRESET_NAME_MAX_LENGTH)
}

function canonicalSound(state: SoundState): SoundState {
  return createSoundState({
    seed: state.seed,
    targetId: state.targetId,
    userBandOffsetsDb: state.userBandOffsetsDb,
    masterGainDb: state.masterGainDb,
    stereoWidth: state.stereoWidth,
    animation: state.animation,
  })
}

function canonicalPreset(record: UserSoundPreset): UserSoundPreset {
  const name = sanitizeUserPresetName(record.name)
  if (name.length === 0) {
    throw new RangeError('user preset name must contain visible text')
  }
  if (!/^user-[0-9]{4,}$/.test(record.id)) {
    throw new RangeError('user preset id is invalid')
  }
  return Object.freeze({
    recordSchemaVersion: USER_PRESET_RECORD_SCHEMA_VERSION,
    id: record.id,
    name,
    sound: canonicalSound(record.sound),
  })
}

export function createDefaultUserPresetLibraryState(): UserPresetLibraryState {
  return Object.freeze({
    schemaVersion: USER_PRESET_LIBRARY_SCHEMA_VERSION,
    presets: Object.freeze([]),
  })
}

export function createUserPresetLibraryState(
  presets: readonly UserSoundPreset[],
): UserPresetLibraryState {
  if (presets.length > USER_PRESET_LIBRARY_MAX_COUNT) {
    throw new RangeError(
      `user preset library cannot exceed ${USER_PRESET_LIBRARY_MAX_COUNT} presets`,
    )
  }
  const ids = new Set<string>()
  const canonical = presets.map((preset) => {
    const next = canonicalPreset(preset)
    if (ids.has(next.id)) {
      throw new RangeError(`duplicate user preset id ${next.id}`)
    }
    ids.add(next.id)
    return next
  })
  return Object.freeze({
    schemaVersion: USER_PRESET_LIBRARY_SCHEMA_VERSION,
    presets: Object.freeze(canonical),
  })
}

function nextPresetId(state: UserPresetLibraryState): string {
  let maximum = 0
  for (const preset of state.presets) {
    const match = /^user-([0-9]+)$/.exec(preset.id)
    if (match) {
      maximum = Math.max(maximum, Number(match[1]))
    }
  }
  return `user-${String(maximum + 1).padStart(4, '0')}`
}

export function saveUserSoundPreset(
  state: UserPresetLibraryState,
  rawName: string,
  sound: SoundState,
): {
  readonly state: UserPresetLibraryState
  readonly preset: UserSoundPreset
} {
  if (state.presets.length >= USER_PRESET_LIBRARY_MAX_COUNT) {
    throw new RangeError(
      `user preset library is limited to ${USER_PRESET_LIBRARY_MAX_COUNT} presets`,
    )
  }
  const name = sanitizeUserPresetName(rawName)
  if (name.length === 0) {
    throw new RangeError('Enter a preset name before saving.')
  }
  const preset = canonicalPreset({
    recordSchemaVersion: USER_PRESET_RECORD_SCHEMA_VERSION,
    id: nextPresetId(state),
    name,
    sound,
  })
  return Object.freeze({
    state: createUserPresetLibraryState([...state.presets, preset]),
    preset,
  })
}

export function deleteUserSoundPreset(
  state: UserPresetLibraryState,
  id: string,
): UserPresetLibraryState {
  return createUserPresetLibraryState(
    state.presets.filter((preset) => preset.id !== id),
  )
}

export function findUserSoundPreset(
  state: UserPresetLibraryState,
  id: string,
): UserSoundPreset | null {
  return state.presets.find((preset) => preset.id === id) ?? null
}

export function findMatchingUserSoundPreset(
  state: UserPresetLibraryState,
  sound: SoundState,
): UserSoundPreset | null {
  const serialized = serializeSoundState(sound)
  return (
    state.presets.find(
      (preset) => serializeSoundState(preset.sound) === serialized,
    ) ?? null
  )
}

export function serializeUserPresetLibraryState(
  state: UserPresetLibraryState,
): string {
  return JSON.stringify(createUserPresetLibraryState(state.presets))
}

export function parseUserPresetLibraryState(raw: string): UserPresetParseResult {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return {
      state: createDefaultUserPresetLibraryState(),
      code: 'malformed',
      messages: Object.freeze([
        'User preset library JSON was malformed; saved presets were not loaded.',
      ]),
    }
  }

  if (
    !isRecord(value) ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion)
  ) {
    return {
      state: createDefaultUserPresetLibraryState(),
      code: 'recovered',
      messages: Object.freeze([
        'User preset library had no valid schema version; no saved presets were loaded.',
      ]),
    }
  }

  if (value.schemaVersion > USER_PRESET_LIBRARY_SCHEMA_VERSION) {
    return {
      state: createDefaultUserPresetLibraryState(),
      code: 'future-version',
      messages: Object.freeze([
        `User preset library schema v${value.schemaVersion} is newer than this build; it was left untouched.`,
      ]),
    }
  }

  if (
    value.schemaVersion !== USER_PRESET_LIBRARY_SCHEMA_VERSION ||
    !Array.isArray(value.presets)
  ) {
    return {
      state: createDefaultUserPresetLibraryState(),
      code: 'recovered',
      messages: Object.freeze([
        'User preset library was invalid; no saved presets were loaded.',
      ]),
    }
  }

  const messages: string[] = []
  const presets: UserSoundPreset[] = []
  const ids = new Set<string>()
  for (const candidate of value.presets.slice(0, USER_PRESET_LIBRARY_MAX_COUNT)) {
    if (!isRecord(candidate)) {
      messages.push('An invalid user preset record was skipped.')
      continue
    }
    if (
      candidate.recordSchemaVersion !== USER_PRESET_RECORD_SCHEMA_VERSION ||
      typeof candidate.id !== 'string' ||
      !/^user-[0-9]{4,}$/.test(candidate.id) ||
      ids.has(candidate.id) ||
      typeof candidate.name !== 'string' ||
      !isRecord(candidate.sound)
    ) {
      messages.push('An invalid user preset record was skipped.')
      continue
    }

    const name = sanitizeUserPresetName(candidate.name)
    if (name.length === 0) {
      messages.push('A user preset with an empty display name was skipped.')
      continue
    }
    if (name !== candidate.name) {
      messages.push(`User preset ${candidate.id} name was sanitized for display.`)
    }

    const parsedSound = parseSoundState(JSON.stringify(candidate.sound))
    if (parsedSound.code === 'future-version') {
      messages.push(
        `User preset ${candidate.id} uses a newer sound schema and was skipped.`,
      )
      continue
    }
    if (parsedSound.code !== 'ok') {
      messages.push(
        `User preset ${candidate.id} sound values were recovered to supported bounds.`,
      )
    }

    const preset = canonicalPreset({
      recordSchemaVersion: USER_PRESET_RECORD_SCHEMA_VERSION,
      id: candidate.id,
      name,
      sound: parsedSound.state,
    })
    ids.add(preset.id)
    presets.push(preset)
  }

  if (value.presets.length > USER_PRESET_LIBRARY_MAX_COUNT) {
    messages.push(
      `Only the first ${USER_PRESET_LIBRARY_MAX_COUNT} user presets were loaded.`,
    )
  }

  return {
    state: createUserPresetLibraryState(presets),
    code: messages.length === 0 ? 'ok' : 'recovered',
    messages: Object.freeze(messages),
  }
}
