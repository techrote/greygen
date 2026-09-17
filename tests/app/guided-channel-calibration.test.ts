import { describe, expect, it } from 'vitest'
import {
  activeGuidedCalibrationState,
  createGuidedChannelCalibrationState,
  guidedChannelCalibrationResult,
  guidedChannelOverallProgress,
  retestGuidedChannelBand,
  skipGuidedChannelBand,
  submitGuidedChannelJudgement,
} from '../../src/features/calibration/guidedChannelCalibration'

describe('guided channel calibration composition', () => {
  it('keeps linked mode as one deterministic nine-band pass', () => {
    let state = createGuidedChannelCalibrationState(1234, 'linked')
    const order = state.linked?.bandOrder
    for (let index = 0; index < 9; index += 1) {
      state = submitGuidedChannelJudgement(state, 'equal')
    }
    expect(state.phase).toBe('review')
    expect(guidedChannelOverallProgress(state)).toEqual({
      completed: 9,
      total: 9,
    })
    const result = guidedChannelCalibrationResult(state)
    expect(result.mode).toBe('linked')
    expect(result.leftRawBandOffsetsDb).toEqual(result.rightRawBandOffsetsDb)
    expect(result.linkedMeasurement?.bandOrder).toEqual(order)
    expect(result.leftMeasurement).toBeNull()
  })

  it('runs independent left then right with stable distinct seeded orders', () => {
    let state = createGuidedChannelCalibrationState(1234, 'independent')
    const replay = createGuidedChannelCalibrationState(1234, 'independent')
    expect(state.phase).toBe('left')
    expect(state.left?.bandOrder).toEqual(replay.left?.bandOrder)

    for (let index = 0; index < 9; index += 1) {
      state = submitGuidedChannelJudgement(state, 'equal')
    }
    expect(state.phase).toBe('right')
    const rightOrder = state.right?.bandOrder
    expect(rightOrder).not.toEqual(state.left?.bandOrder)

    for (let index = 0; index < 9; index += 1) {
      state = submitGuidedChannelJudgement(state, 'equal')
    }
    expect(state.phase).toBe('review')
    expect(guidedChannelOverallProgress(state)).toEqual({
      completed: 18,
      total: 18,
    })
    const result = guidedChannelCalibrationResult(state)
    expect(result.mode).toBe('independent')
    expect(result.leftMeasurement).not.toBeNull()
    expect(result.rightMeasurement?.bandOrder).toEqual(rightOrder)
    expect(result.linkedMeasurement).toBeNull()
  })

  it('preserves one channel while retesting the other', () => {
    let state = createGuidedChannelCalibrationState(88, 'independent')
    for (let index = 0; index < 18; index += 1) {
      state = submitGuidedChannelJudgement(state, 'equal')
    }
    const rightBefore =
      guidedChannelCalibrationResult(state).rightRawBandOffsetsDb
    const retestBand = state.left?.bandOrder[0] ?? 0
    state = retestGuidedChannelBand(state, 'left', retestBand)
    expect(state.phase).toBe('left')
    state = submitGuidedChannelJudgement(state, 'quieter')
    while (state.phase !== 'review') {
      state = submitGuidedChannelJudgement(state, 'quieter')
    }
    expect(guidedChannelCalibrationResult(state).rightRawBandOffsetsDb).toEqual(
      rightBefore,
    )
    expect(
      state.left?.results.find((entry) => entry.bandIndex === retestBand)
        ?.retests,
    ).toBe(1)
  })

  it('supports skip independently without fabricating a result', () => {
    let state = createGuidedChannelCalibrationState(99, 'independent')
    const skipped = activeGuidedCalibrationState(state)?.current?.bandIndex
    state = skipGuidedChannelBand(state)
    expect(
      state.left?.results.find((entry) => entry.bandIndex === skipped)
        ?.correctionDb,
    ).toBeNull()
  })
})
