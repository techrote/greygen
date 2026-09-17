import { BAND_COUNT } from '../../audio/dsp/filterBank'
import { CALIBRATION_BAND_OFFSET_LIMIT_DB } from '../../audio/dsp/gainSafety'
import type {
  CalibrationApplicationMode,
  JsonValue,
  LocalProfileRecord,
} from '../../app/state/appState'

export const CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION = 2 as const
export const LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION = 1 as const
export const DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX = 5
export const BALANCED_CALIBRATION_SCALE = 0.6
export const BALANCED_CALIBRATION_LIMIT_DB = 12
export const CALIBRATION_PROFILE_NAME_MAX_LENGTH = 120
export const GUIDED_CALIBRATION_MEASUREMENT_METHOD =
  'guided-narrow-band-v1' as const
export const GUIDED_CALIBRATION_MEASUREMENT_VERSION = 1 as const

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
  readonly rawBandOffsetsDb: readonly (number | null)[]
  readonly measurement: CalibrationMeasurementMetadata | null
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

export function sanitizeCalibrationProfileName(value: string): string {
  let normalized = value.normalize('NFKC')
  normalized = Array.from(normalized)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return (
        code >= 0x20 && code !== 0x7f && character !== '<' && character !== '>'
      )
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.slice(0, CALIBRATION_PROFILE_NAME_MAX_LENGTH)
}

export function createCalibrationProfilePayload(input: {
  readonly sampleRateHz?: number | null
  readonly referenceBandIndex?: number
  readonly rawBandOffsetsDb: readonly (number | null)[]
  readonly measurement?: CalibrationMeasurementMetadata | null
}): CalibrationProfilePayload {
  if (input.rawBandOffsetsDb.length !== BAND_COUNT) {
    throw new RangeError(
      `rawBandOffsetsDb must contain exactly ${BAND_COUNT} values`,
    )
  }
  const referenceBandIndex =
    input.referenceBandIndex ?? DEFAULT_CALIBRATION_REFERENCE_BAND_INDEX
  if (
    !Number.isInteger(referenceBandIndex) ||
    referenceBandIndex < 0 ||
    referenceBandIndex >= BAND_COUNT
  ) {
    throw new RangeError('referenceBandIndex is outside the ten-band model')
  }

  const sampleRateHz = input.sampleRateHz ?? null
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

  const rawBandOffsetsDb = input.rawBandOffsetsDb.map((value, index) => {
    if (value === null) {
      return null
    }
    if (!Number.isFinite(value)) {
      throw new RangeError(`rawBandOffsetsDb[${index}] must be finite or null`)
    }
    return clamp(
      value,
      -CALIBRATION_BAND_OFFSET_LIMIT_DB,
      CALIBRATION_BAND_OFFSET_LIMIT_DB,
    )
  })

  if (rawBandOffsetsDb[referenceBandIndex] === null) {
    throw new RangeError('the reference band cannot be skipped')
  }

  const measurement = canonicalMeasurement(
    input.measurement ?? null,
    referenceBandIndex,
  )

  return Object.freeze({
    sampleRateHz,
    referenceBandIndex,
    rawBandOffsetsDb: freezeOffsets(rawBandOffsetsDb),
    measurement,
  })
}

export function createCalibrationProfileRecord(input: {
  readonly id: string
  readonly name: string
  readonly sampleRateHz?: number | null
  readonly referenceBandIndex?: number
  readonly rawBandOffsetsDb: readonly (number | null)[]
  readonly measurement?: CalibrationMeasurementMetadata | null
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
      rawBandOffsetsDb: profile.rawBandOffsetsDb,
      measurement: measurementToJson(profile.measurement),
    }),
  })
}

export function parseCalibrationProfileRecord(
  record: LocalProfileRecord,
): CalibrationProfileParseResult {
  if (
    record.kind !== 'calibration' ||
    (record.payloadSchemaVersion !==
      LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION &&
      record.payloadSchemaVersion !==
        CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION) ||
    !isRecord(record.payload)
  ) {
    return {
      profile: null,
      messages: Object.freeze([
        'Profile is not a supported calibration payload.',
      ]),
    }
  }
  const payload = record.payload
  if (!Array.isArray(payload.rawBandOffsetsDb)) {
    return {
      profile: null,
      messages: Object.freeze([
        'Calibration profile band data is missing or malformed.',
      ]),
    }
  }
  try {
    const raw = payload.rawBandOffsetsDb.map((value) =>
      value === null ? null : typeof value === 'number' ? value : Number.NaN,
    )
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
      rawBandOffsetsDb: raw,
      measurement:
        record.payloadSchemaVersion ===
        LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION
          ? null
          : (payload.measurement as CalibrationMeasurementMetadata | null),
    })
    return {
      profile,
      messages:
        record.payloadSchemaVersion ===
        LEGACY_CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION
          ? Object.freeze([
              'Calibration payload v1 loaded without guided measurement evidence.',
            ])
          : Object.freeze([]),
    }
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
  profile: CalibrationProfilePayload,
): readonly (number | null)[] {
  const reference = profile.rawBandOffsetsDb[profile.referenceBandIndex]
  if (reference === null) {
    return Object.freeze(Array(BAND_COUNT).fill(null))
  }
  return Object.freeze(
    profile.rawBandOffsetsDb.map((value) =>
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

export function resolveCalibrationBandOffsetsDb(
  profile: CalibrationProfilePayload | null,
  mode: CalibrationApplicationMode,
): readonly number[] {
  if (!profile || mode === 'off') {
    return Object.freeze(Array(BAND_COUNT).fill(0))
  }
  const full = normalizedFullOffsets(profile)
  if (mode === 'full') {
    return Object.freeze(full.map((value) => value ?? 0))
  }

  const scaled = full.map((value) =>
    value === null ? null : value * BALANCED_CALIBRATION_SCALE,
  )
  const smoothed = smoothKnown(scaled)
  const reference = smoothed[profile.referenceBandIndex]
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

export function resolveCalibrationRecordOffsetsDb(
  record: LocalProfileRecord | null,
  mode: CalibrationApplicationMode,
): readonly number[] {
  if (!record) {
    return resolveCalibrationBandOffsetsDb(null, mode)
  }
  const parsed = parseCalibrationProfileRecord(record)
  return resolveCalibrationBandOffsetsDb(parsed.profile, mode)
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

export function isCalibrationApplicationMode(
  value: unknown,
): value is CalibrationApplicationMode {
  return value === 'off' || value === 'balanced' || value === 'full'
}
