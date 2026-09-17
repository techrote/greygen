import { describe, expect, it } from 'vitest'
import type { LocalProfileRecord } from '../../src/app/state/appState'
import { MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB } from '../../src/audio/dsp/channelCalibration'
import {
  CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
  createCalibrationProfileRecord,
  duplicateCalibrationProfileRecord,
  parseCalibrationProfileRecord,
  resolveCalibrationChannelOffsetsDb,
  sanitizeCalibrationProfileNote,
  updateCalibrationProfileMetadata,
} from '../../src/features/calibration/calibrationProfile'

function legacyRecord(version: 1 | 2): LocalProfileRecord {
  return Object.freeze({
    recordSchemaVersion: 1,
    id: `legacy-${version}`,
    name: `Legacy ${version}`,
    kind: 'calibration',
    payloadSchemaVersion: version,
    payload: Object.freeze({
      sampleRateHz: 48000,
      referenceBandIndex: 5,
      rawBandOffsetsDb: [0, 1, 2, 3, 4, 0, -1, -2, -3, -4],
      ...(version === 2 ? { measurement: null } : {}),
    }),
  })
}

describe('channel-aware calibration profiles', () => {
  it('migrates payload v1 and v2 profiles in memory to linked mode', () => {
    for (const version of [1, 2] as const) {
      const parsed = parseCalibrationProfileRecord(legacyRecord(version))
      expect(parsed.profile?.channelMode).toBe('linked')
      expect(parsed.profile?.leftRawBandOffsetsDb).toEqual(
        parsed.profile?.rightRawBandOffsetsDb,
      )
      expect(parsed.profile?.note).toBe('')
      expect(parsed.messages.join(' ')).toContain(`v${version}`)
    }
  })

  it('stores independent L/R data and caps applied asymmetry without rewriting raw measurements', () => {
    const record = createCalibrationProfileRecord({
      id: 'lr',
      name: 'Independent fixture',
      channelMode: 'independent',
      leftRawBandOffsetsDb: [24, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      rightRawBandOffsetsDb: [-24, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      note: 'Left pad loose',
    })
    expect(record.payloadSchemaVersion).toBe(
      CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
    )
    const profile = parseCalibrationProfileRecord(record).profile
    expect(profile?.channelMode).toBe('independent')
    expect(profile?.leftRawBandOffsetsDb[0]).toBe(24)
    expect(profile?.rightRawBandOffsetsDb[0]).toBe(-24)
    const applied = resolveCalibrationChannelOffsetsDb(profile ?? null, 'full')
    expect(
      Math.abs(applied.leftBandOffsetsDb[0] - applied.rightBandOffsetsDb[0]),
    ).toBeCloseTo(MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB, 12)
  })

  it('keeps linked mode exactly symmetric for Off, Balanced, and Full', () => {
    const record = createCalibrationProfileRecord({
      id: 'linked',
      name: 'Linked fixture',
      channelMode: 'linked',
      rawBandOffsetsDb: [2, 1, 0, -1, -2, 0, 1, 2, 3, 4],
    })
    const profile = parseCalibrationProfileRecord(record).profile
    for (const mode of ['off', 'balanced', 'full'] as const) {
      const applied = resolveCalibrationChannelOffsetsDb(profile, mode)
      expect(applied.leftBandOffsetsDb).toEqual(applied.rightBandOffsetsDb)
    }
  })

  it('sanitizes notes and preserves DSP/evidence data across rename and duplicate', () => {
    expect(sanitizeCalibrationProfileNote('  <b> USB\nDAC </b> ')).toBe(
      'b USB DAC /b',
    )
    const source = createCalibrationProfileRecord({
      id: 'one',
      name: 'Original',
      note: 'Desk DAC',
      rawBandOffsetsDb: [0, 1, 2, 3, 4, 0, -1, -2, -3, -4],
    })
    const renamed = updateCalibrationProfileMetadata(source, {
      name: 'Renamed',
      note: 'New note',
    })
    const duplicate = duplicateCalibrationProfileRecord(renamed, 'two')
    expect(renamed.name).toBe('Renamed')
    expect(parseCalibrationProfileRecord(renamed).profile?.note).toBe(
      'New note',
    )
    expect(duplicate.id).toBe('two')
    expect(duplicate.name).toBe('Renamed copy')
    expect(duplicate.payload).toEqual(renamed.payload)
  })
})
