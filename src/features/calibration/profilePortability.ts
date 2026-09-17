import type { JsonValue, LocalProfileRecord } from '../../app/state/appState'
import {
  CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
  createCalibrationProfileRecord,
  parseCalibrationProfileRecord,
} from './calibrationProfile'

export const CALIBRATION_EXPORT_SCHEMA_VERSION = 1 as const
export const CALIBRATION_EXPORT_KIND =
  'greygen-personal-calibration-profile' as const
export const CALIBRATION_EXPORT_DATA_CLASS =
  'personal-playback-calibration' as const

export interface CalibrationProfileExportEnvelope {
  readonly schemaVersion: typeof CALIBRATION_EXPORT_SCHEMA_VERSION
  readonly kind: typeof CALIBRATION_EXPORT_KIND
  readonly dataClass: typeof CALIBRATION_EXPORT_DATA_CLASS
  readonly profile: {
    readonly name: string
    readonly payloadSchemaVersion: number
    readonly payload: Readonly<Record<string, JsonValue>>
  }
}

export interface CalibrationProfileImportResult {
  readonly record: LocalProfileRecord | null
  readonly messages: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalRecord(
  record: LocalProfileRecord,
  id: string,
): LocalProfileRecord {
  const parsed = parseCalibrationProfileRecord(record)
  if (!parsed.profile) {
    throw new RangeError(
      parsed.messages.join(' ') || 'Calibration profile is invalid.',
    )
  }
  const profile = parsed.profile
  return createCalibrationProfileRecord({
    id,
    name: record.name,
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

export function serializeCalibrationProfileExport(
  record: LocalProfileRecord,
): string {
  const canonical = canonicalRecord(record, 'export-only')
  const envelope: CalibrationProfileExportEnvelope = Object.freeze({
    schemaVersion: CALIBRATION_EXPORT_SCHEMA_VERSION,
    kind: CALIBRATION_EXPORT_KIND,
    dataClass: CALIBRATION_EXPORT_DATA_CLASS,
    profile: Object.freeze({
      name: canonical.name,
      payloadSchemaVersion: CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
      payload: canonical.payload,
    }),
  })
  return JSON.stringify(envelope)
}

export function parseCalibrationProfileExport(
  raw: string,
  localId: string,
): CalibrationProfileImportResult {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return {
      record: null,
      messages: Object.freeze(['Personal calibration export JSON is malformed.']),
    }
  }

  if (!isRecord(value) || typeof value.schemaVersion !== 'number') {
    return {
      record: null,
      messages: Object.freeze([
        'Personal calibration export has no valid schema version.',
      ]),
    }
  }
  if (value.schemaVersion > CALIBRATION_EXPORT_SCHEMA_VERSION) {
    return {
      record: null,
      messages: Object.freeze([
        `Personal calibration export schema v${value.schemaVersion} is newer than this build and was not imported.`,
      ]),
    }
  }
  if (
    value.schemaVersion !== CALIBRATION_EXPORT_SCHEMA_VERSION ||
    value.kind !== CALIBRATION_EXPORT_KIND ||
    value.dataClass !== CALIBRATION_EXPORT_DATA_CLASS ||
    !isRecord(value.profile) ||
    typeof value.profile.name !== 'string' ||
    typeof value.profile.payloadSchemaVersion !== 'number' ||
    !Number.isInteger(value.profile.payloadSchemaVersion) ||
    !isRecord(value.profile.payload)
  ) {
    return {
      record: null,
      messages: Object.freeze([
        'Personal calibration export envelope is unsupported or malformed.',
      ]),
    }
  }

  const temporary: LocalProfileRecord = Object.freeze({
    recordSchemaVersion: 1,
    id: 'import-validation',
    name: value.profile.name,
    kind: 'calibration',
    payloadSchemaVersion: value.profile.payloadSchemaVersion,
    payload: value.profile.payload as Readonly<Record<string, JsonValue>>,
  })
  try {
    return {
      record: canonicalRecord(temporary, localId),
      messages: Object.freeze([]),
    }
  } catch (error) {
    return {
      record: null,
      messages: Object.freeze([
        error instanceof Error
          ? error.message
          : 'Personal calibration export could not be validated safely.',
      ]),
    }
  }
}
