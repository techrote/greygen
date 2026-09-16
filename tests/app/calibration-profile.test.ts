import { describe, expect, it } from 'vitest'
import { createDefaultSoundState } from '../../src/app/state/appState'
import {
  BALANCED_CALIBRATION_LIMIT_DB,
  BALANCED_CALIBRATION_SCALE,
  createCalibrationProfilePayload,
  createCalibrationProfileRecord,
  parseCalibrationProfileRecord,
  resolveCalibrationBandOffsetsDb,
  sanitizeCalibrationProfileName,
} from '../../src/features/calibration/calibrationProfile'
import { createSoundShareUrl } from '../../src/features/sharing/shareState'

describe('calibration profile model', () => {
  it('sanitizes names and canonicalizes bounded relative payloads', () => {
    expect(sanitizeCalibrationProfileName('  <b> Desk\n Headphones </b>  ')).toBe(
      'b Desk Headphones /b',
    )

    const profile = createCalibrationProfilePayload({
      sampleRateHz: 48000,
      referenceBandIndex: 5,
      rawBandOffsetsDb: [99, -99, 4, null, -2, 0, 3, 5, 8, null],
    })
    expect(profile.sampleRateHz).toBe(48000)
    expect(profile.referenceBandIndex).toBe(5)
    expect(profile.rawBandOffsetsDb).toEqual([
      24,
      -24,
      4,
      null,
      -2,
      0,
      3,
      5,
      8,
      null,
    ])
  })

  it('requires a known reference but permits other skipped bands', () => {
    expect(() =>
      createCalibrationProfilePayload({
        referenceBandIndex: 5,
        rawBandOffsetsDb: [0, 0, 0, 0, 0, null, 0, 0, 0, 0],
      }),
    ).toThrow(/reference band/i)
  })

  it('Full re-anchors to the reference and clamps relative differences to the global bound', () => {
    const profile = createCalibrationProfilePayload({
      referenceBandIndex: 5,
      rawBandOffsetsDb: [-24, -12, 0, 12, 24, -24, 24, null, -4, 8],
    })
    expect(resolveCalibrationBandOffsetsDb(profile, 'full')).toEqual([
      0,
      12,
      24,
      24,
      24,
      0,
      24,
      0,
      20,
      24,
    ])
  })

  it('Balanced is a locked 60% local smoothing transform re-anchored at the reference and capped to ±12 dB', () => {
    expect(BALANCED_CALIBRATION_SCALE).toBe(0.6)
    expect(BALANCED_CALIBRATION_LIMIT_DB).toBe(12)
    const profile = createCalibrationProfilePayload({
      referenceBandIndex: 5,
      rawBandOffsetsDb: [24, 12, 6, 0, -6, 0, 6, 12, 24, null],
    })
    expect(resolveCalibrationBandOffsetsDb(profile, 'balanced')).toEqual([
      12,
      8.1,
      3.5999999999999996,
      0,
      -1.7999999999999998,
      0,
      3.5999999999999996,
      8.1,
      12,
      0,
    ])
  })

  it('Off and skipped bands are neutral rather than fabricated', () => {
    const profile = createCalibrationProfilePayload({
      referenceBandIndex: 5,
      rawBandOffsetsDb: [null, null, 9, null, -5, 0, null, 12, null, null],
    })
    expect(resolveCalibrationBandOffsetsDb(profile, 'off')).toEqual(
      Array(10).fill(0),
    )
    const balanced = resolveCalibrationBandOffsetsDb(profile, 'balanced')
    expect(balanced[0]).toBe(0)
    expect(balanced[1]).toBe(0)
    expect(balanced[3]).toBe(0)
    expect(balanced[6]).toBe(0)
    expect(balanced[8]).toBe(0)
    expect(balanced[9]).toBe(0)
  })

  it('rejects unsupported calibration payloads without throwing during profile lookup', () => {
    const record = createCalibrationProfileRecord({
      id: 'fixture',
      name: 'Fixture profile',
      rawBandOffsetsDb: Array(10).fill(0),
    })
    expect(parseCalibrationProfileRecord(record).profile).not.toBeNull()
    expect(
      parseCalibrationProfileRecord({
        ...record,
        payloadSchemaVersion: 99,
      }).profile,
    ).toBeNull()
  })

  it('keeps profile names and private calibration values outside normal sound share URLs', () => {
    const secret = createCalibrationProfileRecord({
      id: 'secret-profile',
      name: 'SECRET private headphones',
      rawBandOffsetsDb: [1, 2, 3, 4, 5, 0, 7, 8, 9, 10],
    })
    expect(secret.name).toContain('SECRET')

    const url = createSoundShareUrl(
      'https://example.test/greygen',
      createDefaultSoundState(),
    )
    expect(url).not.toContain('SECRET')
    expect(url).not.toContain('secret-profile')
    expect(url).not.toContain('calibration')
  })
})
