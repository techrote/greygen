import {
  ANIMATION_DEPTH_MAX_DB,
  ANIMATION_DEPTH_MIN_DB,
  ANIMATION_SPEED_MAX,
  ANIMATION_SPEED_MIN,
  type AnimationState,
  createAnimationState,
  isAnimationMode,
} from '../../audio/dsp/animation'
import {
  DEFAULT_ENGINE_PRESET,
  DEFAULT_ENGINE_SEED,
} from '../../audio/dsp/engine'
import { BAND_COUNT } from '../../audio/dsp/filterBank'
import {
  DEFAULT_MASTER_GAIN_DB,
  MASTER_GAIN_MAX_DB,
  MASTER_GAIN_MIN_DB,
} from '../../audio/dsp/gainSafety'
import {
  SPECTRAL_PRESET_IDS,
  USER_BAND_OFFSET_MAX_DB,
  USER_BAND_OFFSET_MIN_DB,
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
} from '../../audio/dsp/spectra'
import {
  DEFAULT_STEREO_WIDTH,
  STEREO_WIDTH_MAX,
  STEREO_WIDTH_MIN,
  createStereoWidthState,
} from '../../audio/dsp/stereo'

export const APP_STORAGE_VERSION = 1 as const
export const SOUND_STATE_SCHEMA_VERSION = 3 as const
export const PROFILE_STATE_SCHEMA_VERSION = 1 as const
export const UI_STATE_SCHEMA_VERSION = 2 as const
export const PROFILE_RECORD_SCHEMA_VERSION = 1 as const

export interface StorageManifest {
  readonly schemaVersion: typeof APP_STORAGE_VERSION
}

export interface SoundState {
  readonly schemaVersion: typeof SOUND_STATE_SCHEMA_VERSION
  readonly seed: number
  readonly targetId: SpectralPresetId
  readonly userBandOffsetsDb: readonly number[]
  readonly masterGainDb: number
  readonly stereoWidth: number
  readonly animation: AnimationState
}

export type ProfileKind = 'calibration' | 'playback'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export interface LocalProfileRecord {
  readonly recordSchemaVersion: typeof PROFILE_RECORD_SCHEMA_VERSION
  readonly id: string
  readonly name: string
  readonly kind: ProfileKind
  readonly payloadSchemaVersion: number
  readonly payload: Readonly<Record<string, JsonValue>>
}

export interface ProfileState {
  readonly schemaVersion: typeof PROFILE_STATE_SCHEMA_VERSION
  readonly profiles: readonly LocalProfileRecord[]
}

export interface UiState {
  readonly schemaVersion: typeof UI_STATE_SCHEMA_VERSION
  readonly futureFeaturesVisible: boolean
  readonly analyzerVisible: boolean
}

export type StateParseCode =
  | 'ok'
  | 'migrated'
  | 'recovered'
  | 'malformed'
  | 'future-version'

export interface StateParseResult<T> {
  readonly state: T
  readonly code: StateParseCode
  readonly messages: readonly string[]
}

interface LegacySoundStateV0 {
  readonly schemaVersion: 0
  readonly seed?: unknown
  readonly preset?: unknown
  readonly bandsDb?: unknown
  readonly masterDb?: unknown
}

interface LegacySoundStateV1 {
  readonly schemaVersion: 1
  readonly seed?: unknown
  readonly targetId?: unknown
  readonly userBandOffsetsDb?: unknown
  readonly masterGainDb?: unknown
}

interface LegacySoundStateV2 {
  readonly schemaVersion: 2
  readonly seed?: unknown
  readonly targetId?: unknown
  readonly userBandOffsetsDb?: unknown
  readonly masterGainDb?: unknown
  readonly stereoWidth?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function freezeNumbers(values: ArrayLike<number>): readonly number[] {
  return Object.freeze(Array.from(values))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function isPresetId(value: unknown): value is SpectralPresetId {
  return (
    typeof value === 'string' &&
    SPECTRAL_PRESET_IDS.includes(value as SpectralPresetId)
  )
}

function isAudioSeed(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffff_ffff
  )
}

function canonicalSoundState(
  seed: number,
  targetId: SpectralPresetId,
  userBandOffsetsDb: ArrayLike<number>,
  masterGainDb: number,
  stereoWidth: number,
  animationState: AnimationState,
): SoundState {
  const spectrum = createSpectrumState(targetId, userBandOffsetsDb)
  if (
    !Number.isFinite(masterGainDb) ||
    masterGainDb < MASTER_GAIN_MIN_DB ||
    masterGainDb > MASTER_GAIN_MAX_DB
  ) {
    throw new RangeError(
      `masterGainDb must be between ${MASTER_GAIN_MIN_DB} and ${MASTER_GAIN_MAX_DB} dB`,
    )
  }
  if (!isAudioSeed(seed)) {
    throw new RangeError('seed must be an unsigned 32-bit integer')
  }
  const stereo = createStereoWidthState(stereoWidth)
  const animation = createAnimationState(
    animationState.mode,
    animationState.seed,
    animationState.depthDb,
    animationState.speed,
    animationState.energyPreserving,
  )

  return Object.freeze({
    schemaVersion: SOUND_STATE_SCHEMA_VERSION,
    seed,
    targetId: spectrum.targetId,
    userBandOffsetsDb: freezeNumbers(spectrum.userBandOffsetsDb),
    masterGainDb,
    stereoWidth: stereo.width,
    animation,
  })
}

export function createDefaultSoundState(): SoundState {
  return canonicalSoundState(
    DEFAULT_ENGINE_SEED,
    DEFAULT_ENGINE_PRESET,
    new Float64Array(BAND_COUNT),
    DEFAULT_MASTER_GAIN_DB,
    DEFAULT_STEREO_WIDTH,
    createAnimationState(),
  )
}

export function createSoundState(input: {
  readonly seed: number
  readonly targetId: SpectralPresetId
  readonly userBandOffsetsDb: ArrayLike<number>
  readonly masterGainDb: number
  readonly stereoWidth?: number
  readonly animation?: AnimationState
}): SoundState {
  return canonicalSoundState(
    input.seed,
    input.targetId,
    input.userBandOffsetsDb,
    input.masterGainDb,
    input.stereoWidth ?? DEFAULT_STEREO_WIDTH,
    input.animation ?? createAnimationState(),
  )
}

export function soundStateToSpectrumState(state: SoundState): SpectrumState {
  return createSpectrumState(state.targetId, state.userBandOffsetsDb)
}

export function soundStateToAnimationState(state: SoundState): AnimationState {
  return createAnimationState(
    state.animation.mode,
    state.animation.seed,
    state.animation.depthDb,
    state.animation.speed,
    state.animation.energyPreserving,
  )
}

export function createDefaultProfileState(): ProfileState {
  return Object.freeze({
    schemaVersion: PROFILE_STATE_SCHEMA_VERSION,
    profiles: Object.freeze([]),
  })
}

export function createDefaultUiState(): UiState {
  return createUiState(true, false)
}

function normalizeSoundRecord(
  value: Record<string, unknown>,
): StateParseResult<SoundState> {
  const defaults = createDefaultSoundState()
  const messages: string[] = []

  const seed = isAudioSeed(value.seed) ? value.seed : defaults.seed
  if (seed !== value.seed) {
    messages.push('Invalid seed was replaced with the deterministic default.')
  }

  const targetId = isPresetId(value.targetId)
    ? value.targetId
    : defaults.targetId
  if (targetId !== value.targetId) {
    messages.push('Unknown spectral preset was replaced with Grey Practical.')
  }

  let offsets = Array.from(defaults.userBandOffsetsDb)
  if (
    Array.isArray(value.userBandOffsetsDb) &&
    value.userBandOffsetsDb.length === BAND_COUNT
  ) {
    offsets = value.userBandOffsetsDb.map((candidate, index) => {
      if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        messages.push(`Band ${index + 1} offset was invalid and reset to 0 dB.`)
        return 0
      }
      const bounded = clamp(
        candidate,
        USER_BAND_OFFSET_MIN_DB,
        USER_BAND_OFFSET_MAX_DB,
      )
      if (bounded !== candidate) {
        messages.push(
          `Band ${index + 1} offset was clamped to the supported range.`,
        )
      }
      return bounded
    })
  } else if (value.userBandOffsetsDb !== undefined) {
    messages.push('Band offsets had the wrong shape and were reset to neutral.')
  }

  let masterGainDb = defaults.masterGainDb
  if (
    typeof value.masterGainDb === 'number' &&
    Number.isFinite(value.masterGainDb)
  ) {
    masterGainDb = clamp(
      value.masterGainDb,
      MASTER_GAIN_MIN_DB,
      MASTER_GAIN_MAX_DB,
    )
    if (masterGainDb !== value.masterGainDb) {
      messages.push('Master level was clamped to the supported digital range.')
    }
  } else if (value.masterGainDb !== undefined) {
    messages.push(
      'Invalid master level was replaced with the conservative default.',
    )
  }

  let stereoWidth = defaults.stereoWidth
  if (
    typeof value.stereoWidth === 'number' &&
    Number.isFinite(value.stereoWidth)
  ) {
    stereoWidth = clamp(value.stereoWidth, STEREO_WIDTH_MIN, STEREO_WIDTH_MAX)
    if (stereoWidth !== value.stereoWidth) {
      messages.push('Stereo width was clamped to the supported range.')
    }
  } else if (value.stereoWidth !== undefined) {
    messages.push('Invalid stereo width was replaced with the Normal default.')
  }

  const defaultAnimation = createAnimationState()
  let animation = defaultAnimation
  if (isRecord(value.animation)) {
    const mode = isAnimationMode(value.animation.mode)
      ? value.animation.mode
      : defaultAnimation.mode
    const animationSeed = isAudioSeed(value.animation.seed)
      ? value.animation.seed
      : defaultAnimation.seed
    const depthDb =
      typeof value.animation.depthDb === 'number' &&
      Number.isFinite(value.animation.depthDb)
        ? clamp(
            value.animation.depthDb,
            ANIMATION_DEPTH_MIN_DB,
            ANIMATION_DEPTH_MAX_DB,
          )
        : defaultAnimation.depthDb
    const speed =
      typeof value.animation.speed === 'number' &&
      Number.isFinite(value.animation.speed)
        ? clamp(value.animation.speed, ANIMATION_SPEED_MIN, ANIMATION_SPEED_MAX)
        : defaultAnimation.speed
    const energyPreserving =
      typeof value.animation.energyPreserving === 'boolean'
        ? value.animation.energyPreserving
        : defaultAnimation.energyPreserving
    if (
      mode !== value.animation.mode ||
      animationSeed !== value.animation.seed ||
      depthDb !== value.animation.depthDb ||
      speed !== value.animation.speed ||
      energyPreserving !== value.animation.energyPreserving
    ) {
      messages.push(
        'Invalid animation settings were recovered to supported bounds.',
      )
    }
    animation = createAnimationState(
      mode,
      animationSeed,
      depthDb,
      speed,
      energyPreserving,
    )
  } else if (value.animation !== undefined) {
    messages.push('Invalid animation state was replaced with Off defaults.')
  }

  return {
    state: canonicalSoundState(
      seed,
      targetId,
      offsets,
      masterGainDb,
      stereoWidth,
      animation,
    ),
    code: messages.length === 0 ? 'ok' : 'recovered',
    messages: Object.freeze(messages),
  }
}

export function migrateSoundStateV2(
  legacy: LegacySoundStateV2,
): StateParseResult<SoundState> {
  const normalized = normalizeSoundRecord({
    schemaVersion: SOUND_STATE_SCHEMA_VERSION,
    seed: legacy.seed,
    targetId: legacy.targetId,
    userBandOffsetsDb: legacy.userBandOffsetsDb,
    masterGainDb: legacy.masterGainDb,
    stereoWidth: legacy.stereoWidth,
    animation: createAnimationState('off'),
  })
  return {
    state: normalized.state,
    code: 'migrated',
    messages: Object.freeze([
      'Sound state schema v2 was migrated to v3 with spectral animation Off to preserve the previous renderer.',
      ...normalized.messages,
    ]),
  }
}

export function migrateSoundStateV1(
  legacy: LegacySoundStateV1,
): StateParseResult<SoundState> {
  const normalized = normalizeSoundRecord({
    schemaVersion: SOUND_STATE_SCHEMA_VERSION,
    seed: legacy.seed,
    targetId: legacy.targetId,
    userBandOffsetsDb: legacy.userBandOffsetsDb,
    masterGainDb: legacy.masterGainDb,
    stereoWidth: 0,
    animation: createAnimationState('off'),
  })
  return {
    state: normalized.state,
    code: 'migrated',
    messages: Object.freeze([
      'Sound state schema v1 was migrated to v3 with Mono width and animation Off to preserve the previous renderer.',
      ...normalized.messages,
    ]),
  }
}

export function migrateSoundStateV0(
  legacy: LegacySoundStateV0,
): StateParseResult<SoundState> {
  const normalized = normalizeSoundRecord({
    schemaVersion: SOUND_STATE_SCHEMA_VERSION,
    seed: legacy.seed,
    targetId: legacy.preset,
    userBandOffsetsDb: legacy.bandsDb,
    masterGainDb: legacy.masterDb,
    stereoWidth: 0,
    animation: createAnimationState('off'),
  })
  return {
    state: normalized.state,
    code: 'migrated',
    messages: Object.freeze([
      'Sound state schema v0 was migrated to v3 with Mono width and animation Off to preserve the previous renderer.',
      ...normalized.messages,
    ]),
  }
}

function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown
}

export function parseSoundState(raw: string): StateParseResult<SoundState> {
  let value: unknown
  try {
    value = parseJson(raw)
  } catch {
    return {
      state: createDefaultSoundState(),
      code: 'malformed',
      messages: Object.freeze([
        'Sound state JSON was malformed; safe defaults were used.',
      ]),
    }
  }

  if (
    !isRecord(value) ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion)
  ) {
    return {
      state: createDefaultSoundState(),
      code: 'recovered',
      messages: Object.freeze([
        'Sound state had no valid schema version; safe defaults were used.',
      ]),
    }
  }

  if (value.schemaVersion === 0) {
    return migrateSoundStateV0(value as unknown as LegacySoundStateV0)
  }
  if (value.schemaVersion === 1) {
    return migrateSoundStateV1(value as unknown as LegacySoundStateV1)
  }
  if (value.schemaVersion === 2) {
    return migrateSoundStateV2(value as unknown as LegacySoundStateV2)
  }
  if (value.schemaVersion > SOUND_STATE_SCHEMA_VERSION) {
    return {
      state: createDefaultSoundState(),
      code: 'future-version',
      messages: Object.freeze([
        `Sound state schema v${value.schemaVersion} is newer than this build; it was left untouched and safe defaults were loaded.`,
      ]),
    }
  }
  if (value.schemaVersion !== SOUND_STATE_SCHEMA_VERSION) {
    return {
      state: createDefaultSoundState(),
      code: 'recovered',
      messages: Object.freeze([
        'Unsupported sound-state schema was replaced with safe defaults.',
      ]),
    }
  }

  return normalizeSoundRecord(value)
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 12) {
    return false
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, depth + 1))
  }
  if (isRecord(value)) {
    return Object.values(value).every((entry) => isJsonValue(entry, depth + 1))
  }
  return false
}

function parseProfileRecord(value: unknown): LocalProfileRecord | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.recordSchemaVersion !== PROFILE_RECORD_SCHEMA_VERSION) {
    return null
  }
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    value.name.length > 120
  ) {
    return null
  }
  if (value.kind !== 'calibration' && value.kind !== 'playback') {
    return null
  }
  if (
    typeof value.payloadSchemaVersion !== 'number' ||
    !Number.isSafeInteger(value.payloadSchemaVersion) ||
    value.payloadSchemaVersion < 1
  ) {
    return null
  }
  if (!isRecord(value.payload) || !isJsonValue(value.payload)) {
    return null
  }

  return Object.freeze({
    recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
    id: value.id,
    name: value.name,
    kind: value.kind,
    payloadSchemaVersion: value.payloadSchemaVersion,
    payload: Object.freeze({ ...value.payload }) as Readonly<
      Record<string, JsonValue>
    >,
  })
}

export function createProfileState(
  profiles: readonly LocalProfileRecord[],
): ProfileState {
  const canonical = profiles.map((profile) => {
    const parsed = parseProfileRecord(profile)
    if (!parsed) {
      throw new RangeError('profile record is invalid')
    }
    return parsed
  })
  return Object.freeze({
    schemaVersion: PROFILE_STATE_SCHEMA_VERSION,
    profiles: Object.freeze(canonical),
  })
}

export function parseProfileState(raw: string): StateParseResult<ProfileState> {
  let value: unknown
  try {
    value = parseJson(raw)
  } catch {
    return {
      state: createDefaultProfileState(),
      code: 'malformed',
      messages: Object.freeze([
        'Private profile JSON was malformed; profiles were not loaded and original storage was left untouched.',
      ]),
    }
  }

  if (
    !isRecord(value) ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion)
  ) {
    return {
      state: createDefaultProfileState(),
      code: 'recovered',
      messages: Object.freeze([
        'Private profile state had no valid schema version; profiles were not loaded.',
      ]),
    }
  }
  if (value.schemaVersion > PROFILE_STATE_SCHEMA_VERSION) {
    return {
      state: createDefaultProfileState(),
      code: 'future-version',
      messages: Object.freeze([
        `Private profile schema v${value.schemaVersion} is newer than this build; original storage was left untouched.`,
      ]),
    }
  }
  if (
    value.schemaVersion !== PROFILE_STATE_SCHEMA_VERSION ||
    !Array.isArray(value.profiles)
  ) {
    return {
      state: createDefaultProfileState(),
      code: 'recovered',
      messages: Object.freeze([
        'Private profile state was invalid and was not loaded.',
      ]),
    }
  }

  const profiles: LocalProfileRecord[] = []
  for (const candidate of value.profiles) {
    const parsed = parseProfileRecord(candidate)
    if (!parsed) {
      return {
        state: createDefaultProfileState(),
        code: 'recovered',
        messages: Object.freeze([
          'At least one private profile record was invalid; no profiles were loaded and original storage was left untouched.',
        ]),
      }
    }
    profiles.push(parsed)
  }

  return {
    state: createProfileState(profiles),
    code: 'ok',
    messages: Object.freeze([]),
  }
}

export function createUiState(
  futureFeaturesVisible: boolean,
  analyzerVisible = false,
): UiState {
  return Object.freeze({
    schemaVersion: UI_STATE_SCHEMA_VERSION,
    futureFeaturesVisible,
    analyzerVisible,
  })
}

export function parseUiState(raw: string): StateParseResult<UiState> {
  let value: unknown
  try {
    value = parseJson(raw)
  } catch {
    return {
      state: createDefaultUiState(),
      code: 'malformed',
      messages: Object.freeze([
        'UI state JSON was malformed; presentation defaults were used.',
      ]),
    }
  }

  if (
    !isRecord(value) ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion)
  ) {
    return {
      state: createDefaultUiState(),
      code: 'recovered',
      messages: Object.freeze([
        'UI state had no valid schema version; presentation defaults were used.',
      ]),
    }
  }
  if (value.schemaVersion === 1) {
    if (
      typeof value.futureFeaturesVisible !== 'boolean' ||
      typeof value.analyzerVisible !== 'boolean'
    ) {
      return {
        state: createDefaultUiState(),
        code: 'recovered',
        messages: Object.freeze([
          'Invalid legacy UI preference was replaced with the default presentation.',
        ]),
      }
    }
    return {
      state: createUiState(value.futureFeaturesVisible, false),
      code: 'migrated',
      messages: Object.freeze([
        'UI state schema v1 was migrated to v2 with the analyzer closed.',
      ]),
    }
  }
  if (value.schemaVersion > UI_STATE_SCHEMA_VERSION) {
    return {
      state: createDefaultUiState(),
      code: 'future-version',
      messages: Object.freeze([
        `UI state schema v${value.schemaVersion} is newer than this build; defaults were used without overwriting it.`,
      ]),
    }
  }
  if (value.schemaVersion !== UI_STATE_SCHEMA_VERSION) {
    return {
      state: createDefaultUiState(),
      code: 'recovered',
      messages: Object.freeze([
        'Unsupported UI-state schema was replaced with presentation defaults.',
      ]),
    }
  }

  if (typeof value.futureFeaturesVisible !== 'boolean') {
    return {
      state: createDefaultUiState(),
      code: 'recovered',
      messages: Object.freeze([
        'Invalid UI preference was replaced with the default presentation.',
      ]),
    }
  }

  return {
    state: createUiState(
      value.futureFeaturesVisible,
      value.analyzerVisible as boolean,
    ),
    code: 'ok',
    messages: Object.freeze([]),
  }
}

export function serializeStorageManifest(): string {
  return JSON.stringify({
    schemaVersion: APP_STORAGE_VERSION,
  } satisfies StorageManifest)
}

export function serializeSoundState(state: SoundState): string {
  const canonical = createSoundState(state)
  return JSON.stringify(canonical)
}

export function serializeProfileState(state: ProfileState): string {
  const canonical = createProfileState(state.profiles)
  return JSON.stringify(canonical)
}

export function serializeUiState(state: UiState): string {
  return JSON.stringify(
    createUiState(state.futureFeaturesVisible, state.analyzerVisible),
  )
}
