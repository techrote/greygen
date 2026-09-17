import { BAND_COUNT } from './filterBank'
import { CALIBRATION_BAND_OFFSET_LIMIT_DB } from './gainSafety'
import { decibelsToGain } from './numbers'

export const CALIBRATION_STIMULUS_SCHEMA_VERSION = 1 as const
export const CALIBRATION_STIMULUS_BASE_GAIN_DB = -18
export const CALIBRATION_STIMULUS_TRANSITION_SECONDS = 0.04

export type CalibrationStimulusMode = 'inactive' | 'silent' | 'band'

export interface CalibrationStimulusState {
  readonly schemaVersion: typeof CALIBRATION_STIMULUS_SCHEMA_VERSION
  readonly mode: CalibrationStimulusMode
  readonly bandIndex: number
  readonly levelOffsetDb: number
}

function assertBandIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= BAND_COUNT) {
    throw new RangeError(
      `calibration stimulus bandIndex must be an integer from 0 to ${BAND_COUNT - 1}`,
    )
  }
  return value
}

function assertLevelOffsetDb(value: number): number {
  if (
    !Number.isFinite(value) ||
    value < -CALIBRATION_BAND_OFFSET_LIMIT_DB ||
    value > CALIBRATION_BAND_OFFSET_LIMIT_DB
  ) {
    throw new RangeError(
      `calibration stimulus levelOffsetDb must be between ${-CALIBRATION_BAND_OFFSET_LIMIT_DB} and ${CALIBRATION_BAND_OFFSET_LIMIT_DB} dB`,
    )
  }
  return value
}

export function isCalibrationStimulusMode(
  value: unknown,
): value is CalibrationStimulusMode {
  return value === 'inactive' || value === 'silent' || value === 'band'
}

export function createCalibrationStimulusState(
  mode: CalibrationStimulusMode = 'inactive',
  bandIndex = 5,
  levelOffsetDb = 0,
): CalibrationStimulusState {
  return Object.freeze({
    schemaVersion: CALIBRATION_STIMULUS_SCHEMA_VERSION,
    mode,
    bandIndex: assertBandIndex(bandIndex),
    levelOffsetDb: assertLevelOffsetDb(levelOffsetDb),
  })
}

export function calibrationStimulusGainLinear(
  state: CalibrationStimulusState,
): number {
  if (state.mode !== 'band') {
    return 0
  }
  return decibelsToGain(
    CALIBRATION_STIMULUS_BASE_GAIN_DB + state.levelOffsetDb,
  )
}

export function calibrationStimulusWetTarget(
  state: CalibrationStimulusState,
): number {
  return state.mode === 'inactive' ? 0 : 1
}
