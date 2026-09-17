import { limitInterchannelCorrectionDifference } from '../../audio/dsp/channelCalibration'
import { BAND_COUNT } from '../../audio/dsp/filterBank'
import { CALIBRATION_BAND_OFFSET_LIMIT_DB } from '../../audio/dsp/gainSafety'
import type {
  CalibrationApplicationMode,
  JsonValue,
  LocalProfileRecord,
} from '../../app/state/appState'

export const CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION = 3 as const
export const LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION = 1 as const
export const LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION_2 = 2 as const
export const DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX = 5
export const BALANCED_CALIBRATION_SCALE = 0.6
export const BALANCED_CALIBRATION_LIMIT_DB = 12
export const CALIBRATION_PROFILE_NAME_MAX_LENGTH = 120
export const CALIBRATION_PROFILE_NOTE_MAX_LENGTH = 300
export const GUIDED_CALIBRATION_MEASUREMENT_METHOD =
  'guided-narrow-band-v1' as const
export const GUIDED_CALIBRATION_MEASUREMENT_VERSION = 1 as const

export type CalibrationChannelMode = 'linked' | 'independent'
export type CalibrationMeasurementOutcome =
  | 'equal'
  | 'converged'
  | 'bounded'
  | 'skipped'
export type CalibrationMeasurementConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'skipped'

export interface CalibrationBandEvidence {
  readonly bandIndex: number
  readonly judgements: number
  readonly retests: number
  readonly outcome: CalibrationMeasurementOutcome
  readonly confidence: CalibrationMeasurementConfidence
  readonly skipped: boolean
}

export interface CalibrationMeasurementMetadata {
  readonly method: typeof GUIDED_CALIBRATION_MEASUREMENT_METHOD
  readonly wizardVersion: typeof GUIDED_CALIBRATION_MEASUREMENT_VERSION
  readonly seed: number
  readonly bandOrder: readonly number[]
  readonly bandEvidence: readonly CalibrationBandEvidence[]
}

export interface CalibrationProfilePayload {
  readonly sampleRateHz: number | null
  readonly referenceBandIndex: number
  readonly channelMode: CalibrationChannelMode
  readonly leftRawBandOffsetsDb: readonly (number | null)[]
  readonly rightRawBandOffsetsDb: readonly (number | null)[]
  readonly note: string
  readonly linkedMeasurement: CalibrationMeasurementMetadata | null
  readonly leftMeasurement: CalibrationMeasurementMetadata | null
  readonly rightMeasurement: CalibrationMeasurementMetadata | null
  readonly rawBandOffsetsDb: readonly (number | null)[]
  readonly measurement: CalibrationMeasurementMetadata | null
}

export interface CalibrationChannelOffsets {
  readonly leftBandOffsetsDb: readonly number[]
  readonly rightBandOffsetsDb: readonly number[]
}

export interface CalibrationProfileParseResult {
  readonly profile: CalibrationProfilePayload | null
  readonly messages: readonly string[]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function freezeOffsets(
  values: readonly (number | null)[],
): readonly (number | null)[] {
  return Object.freeze(Array.from(values))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBandIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < BAND_COUNT
  )
}

function isUint32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffff_ffff
  )
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isMeasurementOutcome(
  value: unknown,
): value is CalibrationMeasurementOutcome {
  return (
    value === 'equal' ||
    value === 'converged' ||
    value === 'bounded' ||
    value === 'skipped'
  )
}

function isMeasurementConfidence(
  value: unknown,
): value is CalibrationMeasurementConfidence {
  return (
    value === 'high' ||
    value === 'medium' ||
    value === 'low' ||
    value === 'skipped'
  )
}

function isCalibrationChannelMode(value: unknown): value is CalibrationChannelMode {
  return value === 'linked' || value === 'independent'
}

function canonicalMeasurement(
  value: unknown,
  referenceBandIndex: number,
): CalibrationMeasurementMetadata | null {
  if (value === null || value === undefined) {
    return null
  }
  if (
    !isRecord(value) ||
    value.method !== GUIDED_CALIBRATION_MEASUREMENT_METHOD ||
    value.wizardVersion !== GUIDED_CALIBRATION_MEASUREMENT_VERSION ||
    !isUint32(value.seed) ||
    !Array.isArray(value.bandOrder) ||
    !Array.isArray(value.bandEvidence)
  ) {
    throw new RangeError('guided calibration measurement metadata is malformed')
  }

  const bandOrder = value.bandOrder.map((entry) => {
    if (!isBandIndex(entry) || entry === referenceBandIndex) {
      throw new RangeError('guided calibration band order is invalid')
    }
    return entry
  })
  if (
    bandOrder.length !== BAND_COUNT - 1 ||
    new Set(bandOrder).size !== bandOrder.length
  ) {
    throw new RangeError(
      'guided calibration band order must cover each test band once',
    )
  }

  const evidence = value.bandEvidence.map((entry) => {
    if (
      !isRecord(entry) ||
      !isBandIndex(entry.bandIndex) ||
      entry.bandIndex === referenceBandIndex ||
      !isNonNegativeInteger(entry.judgements) ||
      !isNonNegativeInteger(entry.retests) ||
      !isMeasurementOutcome(entry.outcome) ||
      !isMeasurementConfidence(entry.confidence) ||
      typeof entry.skipped !== 'boolean'
    ) {
      throw new RangeError('guided calibration band evidence is invalid')
    }
    if (
      entry.skipped !== (entry.outcome === 'skipped') ||
      entry.skipped !== (entry.confidence === 'skipped')
    ) {
      throw new RangeError('guided calibration skip evidence is inconsistent')
    }
    return Object.freeze({
      bandIndex: entry.bandIndex,
      judgements: entry.judgements,
      retests: entry.retests,
      outcome: entry.outcome,
      confidence: entry.confidence,
      skipped: entry.skipped,
    })
  })
  if (
    evidence.length !== bandOrder.length ||
    new Set(evidence.map((entry) => entry.bandIndex)).size !==
      evidence.length ||
    bandOrder.some(
      (bandIndex) => !evidence.some((entry) => entry.bandIndex === bandIndex),
    )
  ) {
    throw new RangeError(
      'guided calibration evidence must cover the test order',
    )
  }

  return Object.freeze({
    method: GUIDED_CALIBRATION_MEASUREMENT_METHOD,
    wizardVersion: GUIDED_CALIBRATION_MEASUREMENT_VERSION,
    seed: value.seed,
    bandOrder: Object.freeze(bandOrder),
    bandEvidence: Object.freeze(evidence),
  })
}

function measurementToJson(
  measurement: CalibrationMeasurementMetadata | null,
): JsonValue {
  if (!measurement) {
    return null
  }
  return {
    method: measurement.method,
    wizardVersion: measurement.wizardVersion,
    seed: measurement.seed,
    bandOrder: Array.from(measurement.bandOrder),
    bandEvidence: measurement.bandEvidence.map((entry) => ({
      bandIndex: entry.bandIndex,
      judgements: entry.judgements,
      retests: entry.retests,
      outcome: entry.outcome,
      confidence: entry.confidence,
      skipped: entry.skipped,
    })),
  }
}

function sanitizeText(value: string, maxLength: number): string {
  const normalized = Array.from(value.normalize('NFKC'))
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return (
        code >= 0x20 &&
        code !== 0x7f &&
        character !== '<' &&
        character !== '>'
      )
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.slice(0, maxLength)
}

export function sanitizeCalibrationProfileName(value: string): string {
  return sanitizeText(value, CALIBRATION_PROFILE_NAME_MAX_LENGTH)
}

export function sanitizeCalibrationProfileNote(value: string): string {
  return sanitizeText(value, CALIBRATION_PROFILE_NOTE_MAX_LENGTH)
}

function canonicalSampleRate(value: number | null | undefined): number | null {
  const sampleRateHz = value ?? null
  if (
    sampleRateHz !== null &&
    (!Number.isFinite(sampleRateHz) ||
      sampleRateHz < 8000 ||
      sampleRateHz > 384000)
  ) {
    throw new RangeError(
      'sampleRateHz must be null or a plausible finite sample rate',
    )
  }
  return sampleRateHz
}

function canonicalReferenceBand(value: number | undefined): number {
  const referenceBandIndex = value ?? DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX
  if (
    !Number.isInteger(referenceBandIndex) ||
    referenceBandIndex < 0 ||
    referenceBandIndex >= BAND_COUNT
  ) {
    throw new RangeError('referenceBandIndex is outside the ten-band model')
  }
  return referenceBandIndex
}

function canonicalRawOffsets(
  values: readonly (number | null)[],
  referenceBandIndex: number,
  label: string,
): readonly (number | null)[] {
  if (values.length !== BAND_COUNT) {
    throw new RangeError(`${label} must contain exactly ${BAND_COUNT} values`)
  }
  const result = values.map((value, index) => {
    if (value === null) {
      return null
    }
    if (!Number.isFinite(value)) {
      throw new RangeError(`${label}[${index}] must be finite or null`)
    }
    return clamp(
      value,
      -CALIBRATION_BAND_OFFSET_LIMIT_DB,
      CALIBRATION_BAND_OFFSET_LIMIT_DB,
    )
  })
  if (result[referenceBandIndex] === null) {
    throw new RangeError(`${label} reference band cannot be skipped`)
  }
  return freezeOffsets(result)
}

export function createCalibrationProfilePayload(input: {
  readonly sampleRateHz?: number | null
  readonly referenceBandIndex?: number
  readonly channelMode?: CalibrationChannelMode
  readonly rawBandOffsetsDb?: readonly (number | null)[]
  readonly leftRawBandOffsetsDb?: readonly (number | null)[]
  readonly rightRawBandOffsetsDb?: readonly (number | null)[]
  readonly note?: string
  readonly measurement?: CalibrationMeasurementMetadata | null
  readonly leftMeasurement?: CalibrationMeasurementMetadata | null
  readonly rightMeasurement?: CalibrationMeasurementMetadata | null
}): CalibrationProfilePayload {
  const referenceBandIndex = canonicalReferenceBand(input.referenceBandIndex)
  const channelMode = input.channelMode ?? 'linked'
  if (!isCalibrationChannelMode(channelMode)) {
    throw new RangeError('channelMode must be linked or independent')
  }
  const linkedRaw = input.rawBandOffsetsDb ?? input.leftRawBandOffsetsDb
  if (!linkedRaw) {
    throw new RangeError('calibration profile requires band-offset data')
  }
  const leftRawBandOffsetsDb = canonicalRawOffsets(
    input.leftRawBandOffsetsDb ?? linkedRaw,
    referenceBandIndex,
    'leftRawBandOffsetsDb',
  )
  const rightRawBandOffsetsDb = canonicalRawOffsets(
    channelMode === 'linked'
      ? leftRawBandOffsetsDb
      : (input.rightRawBandOffsetsDb ?? linkedRaw),
    referenceBandIndex,
    'rightRawBandOffsetsDb',
  )

  const linkedMeasurement =
    channelMode === 'linked'
      ? canonicalMeasurement(input.measurement ?? null, referenceBandIndex)
      : null
  const leftMeasurement =
    channelMode === 'independent'
      ? canonicalMeasurement(input.leftMeasurement ?? null, referenceBandIndex)
      : null
  const rightMeasurement =
    channelMode === 'independent'
      ? canonicalMeasurement(input.rightMeasurement ?? null, referenceBandIndex)
      : null

  return Object.freeze({
    sampleRateHz: canonicalSampleRate(input.sampleRateHz),
    referenceBandIndex,
    channelMode,
    leftRawBandOffsetsDb,
    rightRawBandOffsetsDb,
    note: sanitizeCalibrationProfileNote(input.note ?? ''),
    linkedMeasurement,
    leftMeasurement,
    rightMeasurement,
    rawBandOffsetsDb: leftRawBandOffsetsDb,
    measurement: linkedMeasurement,
  })
}

export function createCalibrationProfileRecord(input: {
  readonly id: string
  readonly name: string
  readonly sampleRateHz?: number | null
  readonly referenceBandIndex?: number
  readonly channelMode?: CalibrationChannelMode
  readonly rawBandOffsetsDb?: readonly (number | null)[]
  readonly leftRawBandOffsetsDb?: readonly (number | null)[]
  readonly rightRawBandOffsetsDb?: readonly (number | null)[]
  readonly note?: string
  readonly measurement?: CalibrationMeasurementMetadata | null
  readonly leftMeasurement?: CalibrationMeasurementMetadata | null
  readonly rightMeasurement?: CalibrationMeasurementMetadata | null
}): LocalProfileRecord {
  const name = sanitizeCalibrationProfileName(input.name)
  if (name.length === 0) {
    throw new RangeError('profile name must contain visible text')
  }
  if (input.id.length === 0 || input.id.length > 128) {
    throw new RangeError('profile id must contain 1-128 characters')
  }
  const profile = createCalibrationProfilePayload(input)
  return Object.freeze({
    recordSchemaVersion: 1,
    id: input.id,
    name,
    kind: 'calibration',
    payloadSchemaVersion: CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
    payload: Object.freeze({
      sampleRateHz: profile.sampleRateHz,
      referenceBandIndex: profile.referenceBandIndex,
      channelMode: profile.channelMode,
      note: profile.note,
      leftRawBandOffsetsDb: profile.leftRawBandOffsetsDb,
      rightRawBandOffsetsDb: profile.rightRawBandOffsetsDb,
      linkedMeasurement: measurementToJson(profile.linkedMeasurement),
      leftMeasurement: measurementToJson(profile.leftMeasurement),
      rightMeasurement: measurementToJson(profile.rightMeasurement),
    }),
  })
}

function jsonOffsets(value: unknown): readonly (number | null)[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  return value.map((entry) =>
    entry === null ? null : typeof entry === 'number' ? entry : Number.NaN,
  )
}

export function parseCalibrationProfileRecord(
  record: LocalProfileRecord,
): CalibrationProfileParseResult {
  if (record.kind !== 'calibration' || !isRecord(record.payload)) {
    return {
      profile: null,
      messages: Object.freeze([
        'Profile is not a supported calibration payload.',
      ]),
    }
  }
  const payload = record.payload
  const version = record.payloadSchemaVersion
  try {
    if (
      version === LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION ||
      version === LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION_2
    ) {
      const raw = jsonOffsets(payload.rawBandOffsetsDb)
      if (!raw) {
        throw new RangeError(
          'Calibration profile band data is missing or malformed.',
        )
      }
      const profile = createCalibrationProfilePayload({
        sampleRateHz:
          payload.sampleRateHz === null ||
          typeof payload.sampleRateHz === 'number'
            ? payload.sampleRateHz
            : null,
        referenceBandIndex:
          typeof payload.referenceBandIndex === 'number'
            ? payload.referenceBandIndex
            : DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX,
        channelMode: 'linked',
        rawBandOffsetsDb: raw,
        measurement:
          version === LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION_2
            ? (payload.measurement as CalibrationMeasurementMetadata | null)
            : null,
      })
      return {
        profile,
        messages: Object.freeze([
          `Calibration payload v${version} migrated in memory to linked channel mode.`,
        ]),
      }
    }

    if (version !== CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION) {
      return {
        profile: null,
        messages: Object.freeze([
          'Profile is not a supported calibration payload.',
        ]),
      }
    }
    if (!isCalibrationChannelMode(payload.channelMode)) {
      throw new RangeError('Calibration channel mode is missing or malformed.')
    }
    const left = jsonOffsets(payload.leftRawBandOffsetsDb)
    const right = jsonOffsets(payload.rightRawBandOffsetsDb)
    if (!left || !right) {
      throw new RangeError(
        'Calibration profile channel band data is missing or malformed.',
      )
    }
    const profile = createCalibrationProfilePayload({
      sampleRateHz:
        payload.sampleRateHz === null || typeof payload.sampleRateHz === 'number'
          ? payload.sampleRateHz
          : null,
      referenceBandIndex:
        typeof payload.referenceBandIndex === 'number'
          ? payload.referenceBandIndex
          : DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX,
      channelMode: payload.channelMode,
      leftRawBandOffsetsDb: left,
      rightRawBandOffsetsDb: right,
      note: typeof payload.note === 'string' ? payload.note : '',
      measurement: payload.linkedMeasurement as CalibrationMeasurementMetadata | null,
      leftMeasurement:
        payload.leftMeasurement as CalibrationMeasurementMetadata | null,
      rightMeasurement:
        payload.rightMeasurement as CalibrationMeasurementMetadata | null,
    })
    return { profile, messages: Object.freeze([]) }
  } catch (error) {
    return {
      profile: null,
      messages: Object.freeze([
        error instanceof Error
          ? error.message
          : 'Calibration profile could not be interpreted safely.',
      ]),
    }
  }
}

function normalizedFullOffsets(
  values: readonly (number | null)[],
  referenceBandIndex: number,
): readonly (number | null)[] {
  const reference = values[referenceBandIndex]
  if (reference === null) {
    return Object.freeze(Array(BAND_COUNT).fill(null))
  }
  return Object.freeze(
    values.map((value) =>
      value === null
        ? null
        : clamp(
            value - reference,
            -CALIBRATION_BAND_OFFSET_LIMIT_DB,
            CALIBRATION_BAND_OFFSET_LIMIT_DB,
          ),
    ),
  )
}

function smoothKnown(
  values: readonly (number | null)[],
): readonly (number | null)[] {
  return Object.freeze(
    values.map((value, index) => {
      if (value === null) {
        return null
      }
      let weighted = value * 0.5
      let weight = 0.5
      const lower = values[index - 1]
      const upper = values[index + 1]
      if (typeof lower === 'number') {
        weighted += lower * 0.25
        weight += 0.25
      }
      if (typeof upper === 'number') {
        weighted += upper * 0.25
        weight += 0.25
      }
      return weighted / weight
    }),
  )
}

function resolveOneChannelOffsetsDb(
  values: readonly (number | null)[],
  referenceBandIndex: number,
  mode: CalibrationApplicationMode,
): readonly number[] {
  if (mode === 'off') {
    return Object.freeze(Array(BAND_COUNT).fill(0))
  }
  const full = normalizedFullOffsets(values, referenceBandIndex)
  if (mode === 'full') {
    return Object.freeze(full.map((value) => value ?? 0))
  }
  const scaled = full.map((value) =>
    value === null ? null : value * BALANCED_CALIBRATION_SCALE,
  )
  const smoothed = smoothKnown(scaled)
  const reference = smoothed[referenceBandIndex]
  const anchor = typeof reference === 'number' ? reference : 0
  return Object.freeze(
    smoothed.map((value) =>
      value === null
        ? 0
        : clamp(
            value - anchor,
            -BALANCED_CALIBRATION_LIMIT_DB,
            BALANCED_CALIBRATION_LIMIT_DB,
          ),
    ),
  )
}

export function resolveCalibrationChannelOffsetsDb(
  profile: CalibrationProfilePayload | null,
  mode: CalibrationApplicationMode,
): CalibrationChannelOffsets {
  if (!profile || mode === 'off') {
    const neutral = Object.freeze(Array(BAND_COUNT).fill(0))
    return Object.freeze({
      leftBandOffsetsDb: neutral,
      rightBandOffsetsDb: neutral,
    })
  }
  const left = resolveOneChannelOffsetsDb(
    profile.leftRawBandOffsetsDb,
    profile.referenceBandIndex,
    mode,
  )
  const rightRequested =
    profile.channelMode === 'linked'
      ? left
      : resolveOneChannelOffsetsDb(
          profile.rightRawBandOffsetsDb,
          profile.referenceBandIndex,
          mode,
        )
  const [leftLimited, rightLimited] = limitInterchannelCorrectionDifference(
    left,
    rightRequested,
  )
  return Object.freeze({
    leftBandOffsetsDb: leftLimited,
    rightBandOffsetsDb: rightLimited,
  })
}

export function resolveCalibrationBandOffsetsDb(
  profile: CalibrationProfilePayload | null,
  mode: CalibrationApplicationMode,
): readonly number[] {
  return resolveCalibrationChannelOffsetsDb(profile, mode).leftBandOffsetsDb
}

export function resolveCalibrationRecordChannelOffsetsDb(
  record: LocalProfileRecord | null,
  mode: CalibrationApplicationMode,
): CalibrationChannelOffsets {
  if (!record) {
    return resolveCalibrationChannelOffsetsDb(null, mode)
  }
  return resolveCalibrationChannelOffsetsDb(
    parseCalibrationProfileRecord(record).profile,
    mode,
  )
}

export function resolveCalibrationRecordOffsetsDb(
  record: LocalProfileRecord | null,
  mode: CalibrationApplicationMode,
): readonly number[] {
  return resolveCalibrationRecordChannelOffsetsDb(record, mode).leftBandOffsetsDb
}

export function findCalibrationProfile(
  profiles: readonly LocalProfileRecord[],
  id: string | null,
): LocalProfileRecord | null {
  if (!id) {
    return null
  }
  const record = profiles.find((candidate) => candidate.id === id) ?? null
  if (!record) {
    return null
  }
  return parseCalibrationProfileRecord(record).profile ? record : null
}

export function calibrationProfileIsGuided(
  profile: CalibrationProfilePayload,
): boolean {
  return (
    profile.linkedMeasurement !== null ||
    profile.leftMeasurement !== null ||
    profile.rightMeasurement !== null
  )
}

export function updateCalibrationProfileMetadata(
  record: LocalProfileRecord,
  input: { readonly name: string; readonly note: string },
): LocalProfileRecord {
  const parsed = parseCalibrationProfileRecord(record)
  if (!parsed.profile) {
    throw new RangeError('cannot edit an invalid calibration profile')
  }
  const profile = parsed.profile
  return createCalibrationProfileRecord({
    id: record.id,
    name: input.name,
    sampleRateHz: profile.sampleRateHz,
    referenceBandIndex: profile.referenceBandIndex,
    channelMode: profile.channelMode,
    leftRawBandOffsetsDb: profile.leftRawBandOffsetsDb,
    rightRawBandOffsetsDb: profile.rightRawBandOffsetsDb,
    note: input.note,
    measurement: profile.linkedMeasurement,
    leftMeasurement: profile.leftMeasurement,
    rightMeasurement: profile.rightMeasurement,
  })
}

export function duplicateCalibrationProfileRecord(
  record: LocalProfileRecord,
  id: string,
  name = `${record.name} copy`,
): LocalProfileRecord {
  const parsed = parseCalibrationProfileRecord(record)
  if (!parsed.profile) {
    throw new RangeError('cannot duplicate an invalid calibration profile')
  }
  const profile = parsed.profile
  return createCalibrationProfileRecord({
    id,
    name,
    sampleRateHz: profile.sampleRateHz,
    referenceBandIndex: profile.referenceBandIndex,
    channelMode: profile.channelMode,
    leftRawBandOffsetsDb: profile.leftRawBandOffsetsDb,
    rightRawBandOffsetsDb: profile.rightRawBandOffsetsDb,
    note: profile.note,
    measurement: profile.linkedMeasurement,
    leftMeasurement: profile.leftMeasurement,
    rightMeasurement: profile.rightMeasurement,
  })
}

export function isCalibrationApplicationMode(
  value: unknown,
): value is CalibrationApplicationMode {
  return value === 'off' || value === 'balanced' || value === 'full'
}
