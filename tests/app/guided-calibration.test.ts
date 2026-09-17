import { describe, expect, it } from 'vitest'
import {
  GUIDED_CALIBRATION_MAX_JUDGEMENTS,
  createGuidedCalibrationMeasurement,
  createGuidedCalibrationState,
  currentGuidedCalibrationCorrectionDb,
  guidedCalibrationRawOffsetsDb,
  retestCalibrationBand,
  skipCurrentCalibrationBand,
  submitCalibrationJudgement,
} from '../../src/features/calibration/guidedCalibration'

function finishAllEqual(seed = 1234) {
  let state = createGuidedCalibrationState(seed)
  while (state.stage === 'matching') {
    state = submitCalibrationJudgement(state, 'equal')
  }
  return state
}

describe('guided calibration state machine', () => {
  it('uses deterministic non-monotonic band order for a fixed seed', () => {
    const first = createGuidedCalibrationState(1234)
    const second = createGuidedCalibrationState(1234)
    const other = createGuidedCalibrationState(77)

    expect(first.bandOrder).toEqual([0, 4, 8, 6, 1, 7, 9, 3, 2])
    expect(second.bandOrder).toEqual(first.bandOrder)
    expect(other.bandOrder).not.toEqual(first.bandOrder)
    expect(first.bandOrder).not.toContain(first.referenceBandIndex)
    expect(new Set(first.bandOrder).size).toBe(9)
  })

  it('accepts equal judgements immediately and reaches review with a neutral profile', () => {
    const state = finishAllEqual()
    expect(state.stage).toBe('review')
    expect(state.results).toHaveLength(9)
    expect(state.results.every((result) => result.outcome === 'equal')).toBe(
      true,
    )
    expect(state.results.every((result) => result.confidence === 'high')).toBe(
      true,
    )
    expect(guidedCalibrationRawOffsetsDb(state)).toEqual(Array(10).fill(0))
  })

  it('converges repeated quieter responses at the positive correction bound without endless loops', () => {
    let state = createGuidedCalibrationState(1234)
    const bandIndex = state.current?.bandIndex
    let responses = 0
    while (
      state.stage === 'matching' &&
      state.current?.bandIndex === bandIndex
    ) {
      state = submitCalibrationJudgement(state, 'quieter')
      responses += 1
      expect(responses).toBeLessThanOrEqual(GUIDED_CALIBRATION_MAX_JUDGEMENTS)
    }
    const result = state.results.find((entry) => entry.bandIndex === bandIndex)
    expect(result?.correctionDb).toBe(24)
    expect(result?.outcome).toBe('bounded')
    expect(result?.confidence).toBe('low')
  })

  it('converges repeated louder responses at the negative correction bound', () => {
    let state = createGuidedCalibrationState(1234)
    const bandIndex = state.current?.bandIndex
    while (
      state.stage === 'matching' &&
      state.current?.bandIndex === bandIndex
    ) {
      state = submitCalibrationJudgement(state, 'louder')
    }
    const result = state.results.find((entry) => entry.bandIndex === bandIndex)
    expect(result?.correctionDb).toBe(-24)
    expect(result?.outcome).toBe('bounded')
  })

  it('narrows pairwise judgements on the 0.5 dB grid', () => {
    let state = createGuidedCalibrationState(1234)
    expect(currentGuidedCalibrationCorrectionDb(state)).toBe(0)
    state = submitCalibrationJudgement(state, 'quieter')
    expect(currentGuidedCalibrationCorrectionDb(state)).toBe(12)
    state = submitCalibrationJudgement(state, 'louder')
    expect(currentGuidedCalibrationCorrectionDb(state)).toBe(6)
    state = submitCalibrationJudgement(state, 'equal')
    const result = state.results.find((entry) => entry.bandIndex === 0)
    expect(result?.correctionDb).toBe(6)
    expect(result?.judgements).toBe(3)
  })

  it('preserves skip as unknown instead of fabricating a correction', () => {
    let state = createGuidedCalibrationState(1234)
    const skippedBand = state.current?.bandIndex
    state = skipCurrentCalibrationBand(state)
    const result = state.results.find(
      (entry) => entry.bandIndex === skippedBand,
    )
    expect(result).toMatchObject({
      correctionDb: null,
      outcome: 'skipped',
      confidence: 'skipped',
    })
  })

  it('supports deterministic retest from review and replaces evidence', () => {
    let state = finishAllEqual(1234)
    state = retestCalibrationBand(state, state.bandOrder[0])
    expect(state.stage).toBe('matching')
    state = submitCalibrationJudgement(state, 'quieter')
    state = submitCalibrationJudgement(state, 'equal')
    expect(state.stage).toBe('review')
    const result = state.results.find(
      (entry) => entry.bandIndex === state.bandOrder[0],
    )
    expect(result).toMatchObject({
      correctionDb: 12,
      retests: 1,
      outcome: 'equal',
    })
  })

  it('emits bounded private measurement evidence only after review', () => {
    const active = createGuidedCalibrationState(1234)
    expect(() => createGuidedCalibrationMeasurement(active)).toThrow(/review/i)

    const review = finishAllEqual(1234)
    const measurement = createGuidedCalibrationMeasurement(review)
    expect(measurement).toMatchObject({
      method: 'guided-narrow-band-v1',
      wizardVersion: 1,
      seed: 1234,
    })
    expect(measurement.bandOrder).toEqual(review.bandOrder)
    expect(measurement.bandEvidence).toHaveLength(9)
    expect(measurement.bandEvidence.every((entry) => !entry.skipped)).toBe(true)
  })

  it('restart from the same seed reproduces clean initial state after a discarded run', () => {
    let abandoned = createGuidedCalibrationState(1234)
    abandoned = submitCalibrationJudgement(abandoned, 'quieter')
    abandoned = skipCurrentCalibrationBand(abandoned)
    expect(abandoned.results.length).toBeGreaterThan(0)

    const restarted = createGuidedCalibrationState(1234)
    expect(restarted.results).toEqual([])
    expect(restarted.bandOrder).toEqual(
      createGuidedCalibrationState(1234).bandOrder,
    )
    expect(currentGuidedCalibrationCorrectionDb(restarted)).toBe(0)
  })
})
