import { describe, expect, it } from 'vitest'
import type { LocalProfileRecord } from '../../src/app/state/appState'
import {
  CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
  GUIDED_CALIBRATION_MEASUREMENT_METHOD,
  createCalibrationProfileRecord,
  parseCalibrationProfileRecord,
} from '../../src/features/calibration/calibrationProfile'
import {
  createGuidedCalibrationMeasurement,
  createGuidedCalibrationState,
  guidedCalibrationRawOffsetsDb,
  submitCalibrationJudgement,
} from '../../src/features/calibration/guidedCalibration'

function completedMeasurement() {
  let state = createGuidedCalibrationState(1234)
  while (state.stage === 'matching') {
    state = submitCalibrationJudgement(state, 'equal')
  }
  return {
    state,
    measurement: createGuidedCalibrationMeasurement(state),
  }
}

describe('guided calibration profile metadata', () => {
  it('stores validated guided evidence in payload schema v3', () => {
    const completed = completedMeasurement()
    const record = createCalibrationProfileRecord({
      id: 'guided-1',
      name: 'Guided fixture',
      sampleRateHz: 48_000,
      referenceBandIndex: completed.state.referenceBandIndex,
      rawBandOffsetsDb: guidedCalibrationRawOffsetsDb(completed.state),
      measurement: completed.measurement,
    })

    expect(record.payloadSchemaVersion).toBe(
      CALIBRATION_PROFILE_PAYLOAD_SCHEMA_VERSION,
    )
    const parsed = parseCalibrationProfileRecord(record)
    expect(parsed.profile?.measurement).toMatchObject({
      method: GUIDED_CALIBRATION_MEASUREMENT_METHOD,
      seed: 1234,
    })
    expect(parsed.profile?.measurement?.bandEvidence).toHaveLength(9)
  })

  it('continues to read legacy v1 profile payloads as measurement-unknown', () => {
    const legacy: LocalProfileRecord = Object.freeze({
      recordSchemaVersion: 1,
      id: 'legacy-v1',
      name: 'Legacy profile',
      kind: 'calibration',
      payloadSchemaVersion: 1,
      payload: Object.freeze({
        sampleRateHz: 48_000,
        referenceBandIndex: 5,
        rawBandOffsetsDb: Object.freeze(Array(10).fill(0)),
      }),
    })
    const parsed = parseCalibrationProfileRecord(legacy)
    expect(parsed.profile).not.toBeNull()
    expect(parsed.profile?.measurement).toBeNull()
    expect(parsed.messages.join(' ')).toMatch(/v1/i)
  })

  it('rejects inconsistent skip/confidence evidence instead of trusting private storage', () => {
    const completed = completedMeasurement()
    const record = createCalibrationProfileRecord({
      id: 'guided-2',
      name: 'Guided fixture',
      referenceBandIndex: completed.state.referenceBandIndex,
      rawBandOffsetsDb: guidedCalibrationRawOffsetsDb(completed.state),
      measurement: completed.measurement,
    })
    const payload = record.payload as Record<string, unknown>
    const measurement = payload.linkedMeasurement as Record<string, unknown>
    const evidence = Array.from(
      measurement.bandEvidence as readonly Record<string, unknown>[],
      (entry) => ({ ...entry }),
    )
    evidence[0] = { ...evidence[0], skipped: true }
    const corrupt: LocalProfileRecord = {
      ...record,
      payload: {
        ...record.payload,
        linkedMeasurement: {
          ...measurement,
          bandEvidence: evidence,
        } as never,
      },
    }
    expect(parseCalibrationProfileRecord(corrupt).profile).toBeNull()
  })
})
