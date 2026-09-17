import { BAND_COUNT } from '../../audio/dsp/filterBank'
import { CALIBRATION_BAND_OFFSET_LIMIT_DB } from '../../audio/dsp/gainSafety'
import { Xoshiro128StarStar } from '../../audio/dsp/rng'

export const GUIDED_CALIBRATION_VERSION = 1 as const
export const GUIDED_CALIBRATION_METHOD = 'guided-narrow-band-v1' as const
export const GUIDED_CALIBRATION_REFERENCE_BAND_INDEX = 5
export const GUIDED_CALIBRATION_STEP_DB = 0.5
export const GUIDED_CALIBRATION_MAX_JUDGEMENTS = 7
export const GUIDED_CALIBRATION_RANDOM_STREAM = 14

const MIN_GRID_INDEX = 0
const MAX_GRID_INDEX = Math.round(
  (CALIBRATION_BAND_OFFSET_LIMIT_DB * 2) / GUIDED_CALIBRATION_STEP_DB,
)
const ZERO_GRID_INDEX = Math.round(
  CALIBRATION_BAND_OFFSET_LIMIT_DB / GUIDED_CALIBRATION_STEP_DB,
)

export type CalibrationJudgement = 'quieter' | 'equal' | 'louder'
export type CalibrationResultOutcome =
  | 'equal'
  | 'converged'
  | 'bounded'
  | 'skipped'
export type CalibrationConfidence = 'high' | 'medium' | 'low' | 'skipped'

export interface GuidedCalibrationBandResult {
  readonly bandIndex: number
  readonly correctionDb: number | null
  readonly judgements: number
  readonly retests: number
  readonly outcome: CalibrationResultOutcome
  readonly confidence: CalibrationConfidence
}

export interface GuidedCalibrationSearch {
  readonly bandIndex: number
  readonly lowGridIndex: number
  readonly highGridIndex: number
  readonly probeGridIndex: number
  readonly judgements: number
  readonly retest: boolean
}

export interface GuidedCalibrationState {
  readonly version: typeof GUIDED_CALIBRATION_VERSION
  readonly seed: number
  readonly referenceBandIndex: number
  readonly bandOrder: readonly number[]
  readonly sequenceIndex: number
  readonly stage: 'matching' | 'review'
  readonly current: GuidedCalibrationSearch | null
  readonly results: readonly GuidedCalibrationBandResult[]
}

export interface GuidedCalibrationBandEvidence {
  readonly bandIndex: number
  readonly judgements: number
  readonly retests: number
  readonly outcome: CalibrationResultOutcome
  readonly confidence: CalibrationConfidence
  readonly skipped: boolean
}

export interface GuidedCalibrationMeasurement {
  readonly method: typeof GUIDED_CALIBRATION_METHOD
  readonly wizardVersion: typeof GUIDED_CALIBRATION_VERSION
  readonly seed: number
  readonly bandOrder: readonly number[]
  readonly bandEvidence: readonly GuidedCalibrationBandEvidence[]
}

function assertSeed(seed: number): number {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffff_ffff
  ) {
    throw new RangeError('guided calibration seed must be an unsigned 32-bit integer')
  }
  return seed >>> 0
}

function assertBandIndex(bandIndex: number): number {
  if (!Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex >= BAND_COUNT) {
    throw new RangeError(`bandIndex must be an integer from 0 to ${BAND_COUNT - 1}`)
  }
  return bandIndex
}

function gridIndexToDb(gridIndex: number): number {
  return (
    -CALIBRATION_BAND_OFFSET_LIMIT_DB +
    gridIndex * GUIDED_CALIBRATION_STEP_DB
  )
}

function createSearch(
  bandIndex: number,
  retest = false,
): GuidedCalibrationSearch {
  return Object.freeze({
    bandIndex: assertBandIndex(bandIndex),
    lowGridIndex: MIN_GRID_INDEX,
    highGridIndex: MAX_GRID_INDEX,
    probeGridIndex: ZERO_GRID_INDEX,
    judgements: 0,
    retest,
  })
}

function freezeResults(
  results: readonly GuidedCalibrationBandResult[],
): readonly GuidedCalibrationBandResult[] {
  return Object.freeze(results.map((result) => Object.freeze({ ...result })))
}

function shuffleBands(seed: number, referenceBandIndex: number): readonly number[] {
  const order = Array.from({ length: BAND_COUNT }, (_, index) => index).filter(
    (index) => index !== referenceBandIndex,
  )
  const rng = new Xoshiro128StarStar(seed, GUIDED_CALIBRATION_RANDOM_STREAM)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.nextUnitFloat() * (index + 1))
    const temporary = order[index]
    order[index] = order[swapIndex]
    order[swapIndex] = temporary
  }
  return Object.freeze(order)
}

export function createGuidedCalibrationState(
  seed: number,
  referenceBandIndex = GUIDED_CALIBRATION_REFERENCE_BAND_INDEX,
): GuidedCalibrationState {
  const canonicalSeed = assertSeed(seed)
  const reference = assertBandIndex(referenceBandIndex)
  const bandOrder = shuffleBands(canonicalSeed, reference)
  if (bandOrder.length === 0) {
    throw new Error('guided calibration requires at least one non-reference band')
  }
  return Object.freeze({
    version: GUIDED_CALIBRATION_VERSION,
    seed: canonicalSeed,
    referenceBandIndex: reference,
    bandOrder,
    sequenceIndex: 0,
    stage: 'matching',
    current: createSearch(bandOrder[0]),
    results: Object.freeze([]),
  })
}

export function currentGuidedCalibrationCorrectionDb(
  state: GuidedCalibrationState,
): number | null {
  return state.current ? gridIndexToDb(state.current.probeGridIndex) : null
}

export function guidedCalibrationProgress(state: GuidedCalibrationState): {
  readonly completed: number
  readonly total: number
} {
  const total = state.bandOrder.length
  const completed =
    state.stage === 'review' ? total : Math.min(state.sequenceIndex, total)
  return Object.freeze({ completed, total })
}

function confidenceFor(
  outcome: CalibrationResultOutcome,
  judgements: number,
): CalibrationConfidence {
  if (outcome === 'skipped') {
    return 'skipped'
  }
  if (outcome === 'equal') {
    return 'high'
  }
  if (outcome === 'bounded') {
    return 'low'
  }
  return judgements <= 5 ? 'high' : 'medium'
}

function finishCurrentBand(
  state: GuidedCalibrationState,
  correctionDb: number | null,
  outcome: CalibrationResultOutcome,
  judgements: number,
): GuidedCalibrationState {
  const current = state.current
  if (!current) {
    throw new Error('guided calibration is not matching a band')
  }
  const existing = state.results.find(
    (result) => result.bandIndex === current.bandIndex,
  )
  const result: GuidedCalibrationBandResult = Object.freeze({
    bandIndex: current.bandIndex,
    correctionDb,
    judgements,
    retests: (existing?.retests ?? 0) + (current.retest ? 1 : 0),
    outcome,
    confidence: confidenceFor(outcome, judgements),
  })
  const results = freezeResults([
    ...state.results.filter((entry) => entry.bandIndex !== current.bandIndex),
    result,
  ])

  if (current.retest) {
    return Object.freeze({
      ...state,
      stage: 'review',
      current: null,
      results,
    })
  }

  const nextSequenceIndex = state.sequenceIndex + 1
  if (nextSequenceIndex >= state.bandOrder.length) {
    return Object.freeze({
      ...state,
      sequenceIndex: state.bandOrder.length,
      stage: 'review',
      current: null,
      results,
    })
  }

  return Object.freeze({
    ...state,
    sequenceIndex: nextSequenceIndex,
    current: createSearch(state.bandOrder[nextSequenceIndex]),
    results,
  })
}

export function submitCalibrationJudgement(
  state: GuidedCalibrationState,
  judgement: CalibrationJudgement,
): GuidedCalibrationState {
  const current = state.current
  if (state.stage !== 'matching' || !current) {
    throw new Error('judgements are only accepted while matching a band')
  }
  const judgements = current.judgements + 1
  if (judgement === 'equal') {
    return finishCurrentBand(
      state,
      gridIndexToDb(current.probeGridIndex),
      'equal',
      judgements,
    )
  }

  let lowGridIndex = current.lowGridIndex
  let highGridIndex = current.highGridIndex
  if (judgement === 'quieter') {
    lowGridIndex = Math.max(lowGridIndex, current.probeGridIndex + 1)
  } else {
    highGridIndex = Math.min(highGridIndex, current.probeGridIndex - 1)
  }

  if (lowGridIndex > highGridIndex) {
    const boundedGridIndex =
      judgement === 'quieter' ? MAX_GRID_INDEX : MIN_GRID_INDEX
    return finishCurrentBand(
      state,
      gridIndexToDb(boundedGridIndex),
      'bounded',
      judgements,
    )
  }

  if (
    judgements >= GUIDED_CALIBRATION_MAX_JUDGEMENTS ||
    lowGridIndex === highGridIndex
  ) {
    const finalGridIndex = Math.floor((lowGridIndex + highGridIndex) / 2)
    const outcome: CalibrationResultOutcome =
      finalGridIndex === MIN_GRID_INDEX || finalGridIndex === MAX_GRID_INDEX
        ? 'bounded'
        : 'converged'
    return finishCurrentBand(
      state,
      gridIndexToDb(finalGridIndex),
      outcome,
      judgements,
    )
  }

  return Object.freeze({
    ...state,
    current: Object.freeze({
      ...current,
      lowGridIndex,
      highGridIndex,
      probeGridIndex: Math.floor((lowGridIndex + highGridIndex) / 2),
      judgements,
    }),
  })
}

export function skipCurrentCalibrationBand(
  state: GuidedCalibrationState,
): GuidedCalibrationState {
  if (state.stage !== 'matching' || !state.current) {
    throw new Error('a calibration band can only be skipped while matching')
  }
  return finishCurrentBand(
    state,
    null,
    'skipped',
    state.current.judgements,
  )
}

export function retestCalibrationBand(
  state: GuidedCalibrationState,
  bandIndex: number,
): GuidedCalibrationState {
  const band = assertBandIndex(bandIndex)
  if (state.stage !== 'review') {
    throw new Error('retests can only start from review')
  }
  if (band === state.referenceBandIndex) {
    throw new RangeError('the reference band is fixed at 0 dB and is not retested')
  }
  if (!state.results.some((result) => result.bandIndex === band)) {
    throw new RangeError('only completed calibration bands can be retested')
  }
  return Object.freeze({
    ...state,
    stage: 'matching',
    current: createSearch(band, true),
  })
}

export function guidedCalibrationRawOffsetsDb(
  state: GuidedCalibrationState,
): readonly (number | null)[] {
  if (state.stage !== 'review') {
    throw new Error('raw calibration offsets are only complete at review')
  }
  const offsets: (number | null)[] = Array(BAND_COUNT).fill(null)
  offsets[state.referenceBandIndex] = 0
  for (const result of state.results) {
    offsets[result.bandIndex] = result.correctionDb
  }
  return Object.freeze(offsets)
}

export function createGuidedCalibrationMeasurement(
  state: GuidedCalibrationState,
): GuidedCalibrationMeasurement {
  if (state.stage !== 'review') {
    throw new Error('calibration measurement metadata is only complete at review')
  }
  const evidence = state.bandOrder.map((bandIndex) => {
    const result = state.results.find((entry) => entry.bandIndex === bandIndex)
    if (!result) {
      throw new Error(`missing guided calibration result for band ${bandIndex}`)
    }
    return Object.freeze({
      bandIndex,
      judgements: result.judgements,
      retests: result.retests,
      outcome: result.outcome,
      confidence: result.confidence,
      skipped: result.correctionDb === null,
    })
  })
  return Object.freeze({
    method: GUIDED_CALIBRATION_METHOD,
    wizardVersion: GUIDED_CALIBRATION_VERSION,
    seed: state.seed,
    bandOrder: Object.freeze(Array.from(state.bandOrder)),
    bandEvidence: Object.freeze(evidence),
  })
}
