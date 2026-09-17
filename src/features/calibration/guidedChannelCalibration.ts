import type { CalibrationChannelMode } from './calibrationProfile'
import {
  type CalibrationJudgement,
  type GuidedCalibrationMeasurement,
  type GuidedCalibrationState,
  createGuidedCalibrationMeasurement,
  createGuidedCalibrationState,
  guidedCalibrationRawOffsetsDb,
  retestCalibrationBand,
  skipCurrentCalibrationBand,
  submitCalibrationJudgement,
} from './guidedCalibration'

export const GUIDED_LEFT_SEED_XOR = 0x4c45_4654
export const GUIDED_RIGHT_SEED_XOR = 0x5249_4748

export type GuidedCalibrationChannel = 'linked' | 'left' | 'right'
export type GuidedChannelCalibrationPhase = GuidedCalibrationChannel | 'review'

export interface GuidedChannelCalibrationState {
  readonly mode: CalibrationChannelMode
  readonly seed: number
  readonly referenceBandIndex: number
  readonly phase: GuidedChannelCalibrationPhase
  readonly linked: GuidedCalibrationState | null
  readonly left: GuidedCalibrationState | null
  readonly right: GuidedCalibrationState | null
}

export interface GuidedChannelCalibrationResult {
  readonly mode: CalibrationChannelMode
  readonly referenceBandIndex: number
  readonly leftRawBandOffsetsDb: readonly (number | null)[]
  readonly rightRawBandOffsetsDb: readonly (number | null)[]
  readonly linkedMeasurement: GuidedCalibrationMeasurement | null
  readonly leftMeasurement: GuidedCalibrationMeasurement | null
  readonly rightMeasurement: GuidedCalibrationMeasurement | null
}

function assertSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('guided channel seed must be an unsigned 32-bit integer')
  }
  return seed >>> 0
}

function channelSeed(seed: number, channel: 'left' | 'right'): number {
  return (
    seed ^
    (channel === 'left' ? GUIDED_LEFT_SEED_XOR : GUIDED_RIGHT_SEED_XOR)
  ) >>> 0
}

export function createGuidedChannelCalibrationState(
  seed: number,
  mode: CalibrationChannelMode = 'linked',
  referenceBandIndex?: number,
): GuidedChannelCalibrationState {
  const canonicalSeed = assertSeed(seed)
  if (mode === 'linked') {
    const linked = createGuidedCalibrationState(
      canonicalSeed,
      referenceBandIndex,
    )
    return Object.freeze({
      mode,
      seed: canonicalSeed,
      referenceBandIndex: linked.referenceBandIndex,
      phase: 'linked',
      linked,
      left: null,
      right: null,
    })
  }

  const left = createGuidedCalibrationState(
    channelSeed(canonicalSeed, 'left'),
    referenceBandIndex,
  )
  return Object.freeze({
    mode,
    seed: canonicalSeed,
    referenceBandIndex: left.referenceBandIndex,
    phase: 'left',
    linked: null,
    left,
    right: null,
  })
}

export function activeGuidedCalibrationState(
  state: GuidedChannelCalibrationState,
): GuidedCalibrationState | null {
  switch (state.phase) {
    case 'linked':
      return state.linked
    case 'left':
      return state.left
    case 'right':
      return state.right
    case 'review':
      return null
  }
}

function finishChannelUpdate(
  state: GuidedChannelCalibrationState,
  channel: GuidedCalibrationChannel,
  updated: GuidedCalibrationState,
  wasRetest: boolean,
): GuidedChannelCalibrationState {
  const withUpdated = Object.freeze({
    ...state,
    [channel]: updated,
  }) as GuidedChannelCalibrationState

  if (updated.stage !== 'review') {
    return withUpdated
  }
  if (wasRetest || channel === 'linked' || channel === 'right') {
    return Object.freeze({ ...withUpdated, phase: 'review' })
  }

  const right = createGuidedCalibrationState(
    channelSeed(state.seed, 'right'),
    state.referenceBandIndex,
  )
  return Object.freeze({
    ...withUpdated,
    phase: 'right',
    right,
  })
}

function updateActive(
  state: GuidedChannelCalibrationState,
  update: (inner: GuidedCalibrationState) => GuidedCalibrationState,
): GuidedChannelCalibrationState {
  if (state.phase === 'review') {
    throw new Error('guided channel calibration is already at review')
  }
  const channel = state.phase
  const current = activeGuidedCalibrationState(state)
  if (!current) {
    throw new Error(`missing guided state for ${channel} channel`)
  }
  const wasRetest = current.current?.retest ?? false
  return finishChannelUpdate(state, channel, update(current), wasRetest)
}

export function submitGuidedChannelJudgement(
  state: GuidedChannelCalibrationState,
  judgement: CalibrationJudgement,
): GuidedChannelCalibrationState {
  return updateActive(state, (inner) =>
    submitCalibrationJudgement(inner, judgement),
  )
}

export function skipGuidedChannelBand(
  state: GuidedChannelCalibrationState,
): GuidedChannelCalibrationState {
  return updateActive(state, skipCurrentCalibrationBand)
}

export function retestGuidedChannelBand(
  state: GuidedChannelCalibrationState,
  channel: GuidedCalibrationChannel,
  bandIndex: number,
): GuidedChannelCalibrationState {
  if (state.phase !== 'review') {
    throw new Error('channel retests can only start from overall review')
  }
  if (state.mode === 'linked' && channel !== 'linked') {
    throw new RangeError('linked calibration can only retest the linked channel')
  }
  if (state.mode === 'independent' && channel === 'linked') {
    throw new RangeError('independent calibration retests left or right')
  }
  const inner = state[channel]
  if (!inner) {
    throw new Error(`missing completed ${channel} calibration state`)
  }
  return Object.freeze({
    ...state,
    phase: channel,
    [channel]: retestCalibrationBand(inner, bandIndex),
  }) as GuidedChannelCalibrationState
}

export function guidedChannelCalibrationResult(
  state: GuidedChannelCalibrationState,
): GuidedChannelCalibrationResult {
  if (state.phase !== 'review') {
    throw new Error('channel calibration result is only available at review')
  }
  if (state.mode === 'linked') {
    if (!state.linked || state.linked.stage !== 'review') {
      throw new Error('linked calibration result is incomplete')
    }
    const raw = guidedCalibrationRawOffsetsDb(state.linked)
    return Object.freeze({
      mode: 'linked',
      referenceBandIndex: state.referenceBandIndex,
      leftRawBandOffsetsDb: raw,
      rightRawBandOffsetsDb: raw,
      linkedMeasurement: createGuidedCalibrationMeasurement(state.linked),
      leftMeasurement: null,
      rightMeasurement: null,
    })
  }

  if (
    !state.left ||
    state.left.stage !== 'review' ||
    !state.right ||
    state.right.stage !== 'review'
  ) {
    throw new Error('independent calibration result is incomplete')
  }
  return Object.freeze({
    mode: 'independent',
    referenceBandIndex: state.referenceBandIndex,
    leftRawBandOffsetsDb: guidedCalibrationRawOffsetsDb(state.left),
    rightRawBandOffsetsDb: guidedCalibrationRawOffsetsDb(state.right),
    linkedMeasurement: null,
    leftMeasurement: createGuidedCalibrationMeasurement(state.left),
    rightMeasurement: createGuidedCalibrationMeasurement(state.right),
  })
}

export function guidedChannelOverallProgress(
  state: GuidedChannelCalibrationState,
): { readonly completed: number; readonly total: number } {
  const total = state.mode === 'linked' ? 9 : 18
  if (state.phase === 'review') {
    return Object.freeze({ completed: total, total })
  }
  const active = activeGuidedCalibrationState(state)
  if (!active) {
    return Object.freeze({ completed: 0, total })
  }
  const completedInActive =
    active.stage === 'review'
      ? 9
      : Math.min(active.sequenceIndex, active.bandOrder.length)
  const completed =
    state.mode === 'independent' && state.phase === 'right'
      ? 9 + completedInActive
      : completedInActive
  return Object.freeze({ completed, total })
}
