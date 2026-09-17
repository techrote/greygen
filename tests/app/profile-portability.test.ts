import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
  createCalibrationProfileRecord,
  parseCalibrationProfileRecord,
} from '../../src/features/calibration/calibrationProfile'
import {
  CALIBRATION_EXPORT_DATA_CLASS,
  CALIBRATION_EXPORT_KIND,
  CALIBRATION_EXPORT_SCHEMA_VERSION,
  parseCalibrationProfileExport,
  serializeCalibrationProfileExport,
} from '../../src/features/calibration/profilePortability'

describe('personal calibration profile portability', () => {
  it('round-trips a canonical independent profile without retaining local id', () => {
    const source = createCalibrationProfileRecord({
      id: 'private-source-id',
      name: 'Desk headphones',
      note: 'USB DAC · evening fit',
      channelMode: 'independent',
      leftRawBandOffsetsDb: [0, 1, 2, 3, 4, 0, -1, -2, -3, -4],
      rightRawBandOffsetsDb: [0, 0, 1, 2, 3, 0, -1, -1, -2, -3],
    })
    const serialized = serializeCalibrationProfileExport(source)
    const envelope = JSON.parse(serialized) as Record<string, unknown>
    expect(envelope.schemaVersion).toBe(CALIBRATION_EXPORT_SCHEMA_VERSION)
    expect(envelope.kind).toBe(CALIBRATION_EXPORT_KIND)
    expect(envelope.dataClass).toBe(CALIBRATION_EXPORT_DATA_CLASS)
    expect(serialized).not.toContain('private-source-id')

    const imported = parseCalibrationProfileExport(serialized, 'calibration-99')
    expect(imported.messages).toEqual([])
    expect(imported.record?.id).toBe('calibration-99')
    expect(imported.record?.payloadSchemaVersion).toBe(
      CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
    )
    const parsed = imported.record
      ? parseCalibrationProfileRecord(imported.record).profile
      : null
    expect(parsed?.channelMode).toBe('independent')
    expect(parsed?.note).toBe('USB DAC · evening fit')
    expect(parsed?.leftRawBandOffsetsDb).toEqual([
      0, 1, 2, 3, 4, 0, -1, -2, -3, -4,
    ])
  })

  it('rejects malformed and future export envelopes safely', () => {
    expect(parseCalibrationProfileExport('{nope', 'x').record).toBeNull()
    const future = JSON.stringify({
      schemaVersion: CALIBRATION_EXPORT_SCHEMA_VERSION + 1,
      kind: CALIBRATION_EXPORT_KIND,
      dataClass: CALIBRATION_EXPORT_DATA_CLASS,
      profile: {},
    })
    const result = parseCalibrationProfileExport(future, 'x')
    expect(result.record).toBeNull()
    expect(result.messages.join(' ')).toMatch(/newer than this build/)
  })

  it('rejects future calibration payloads instead of guessing at their meaning', () => {
    const raw = JSON.stringify({
      schemaVersion: CALIBRATION_EXPORT_SCHEMA_VERSION,
      kind: CALIBRATION_EXPORT_KIND,
      dataClass: CALIBRATION_EXPORT_DATA_CLASS,
      profile: {
        name: 'Future profile',
        payloadSchemaVersion: CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION + 1,
        payload: {},
      },
    })
    const result = parseCalibrationProfileExport(raw, 'x')
    expect(result.record).toBeNull()
    expect(result.messages.join(' ')).toMatch(/supported calibration payload/)
  })
})
