import { BAND_COUNT } from './filterBank'
import { CALIBRATION_BAND_OFFSET_LIMIT_DB } from './gainSafety'
import { assertFiniteNumber, decibelsToGain } from './numbers'

export const CHANNEL_CALIBRATION_SCHEMA_VERSION = 1 as const
export const MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB = 6.020599913279624

export interface ChannelCalibrationState {
  readonly schemaVersion: typeof CHANNEL_CALIBRATION_SCHEMA_VERSION
  readonly leftBandOffsetsDb: readonly number[]
  readonly rightBandOffsetsDb: readonly number[]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function validateOffsets(values: ArrayLike<number>, label: string): number[] {
  if (values.length !== BAND_COUNT) {
    throw new RangeError(`${label} must contain exactly ${BAND_COUNT} values`)
  }
  return Array.from({ length: BAND_COUNT }, (_, index) => {
    const value = assertFiniteNumber(values[index], `${label}[${index}]`)
    if (
      value < -CALIBRATION_BAND_OFFSET_LIMIT_DB ||
      value > CALIBRATION_BAND_OFFSET_LIMIT_DB
    ) {
      throw new RangeError(
        `${label}[${index}] must be between ${-CALIBRATION_BAND_OFFSET_LIMIT_DB} and ${CALIBRATION_BAND_OFFSET_LIMIT_DB} dB`,
      )
    }
    return value
  })
}

export function limitInterchannelCorrectionDifference(
  leftBandOffsetsDb: ArrayLike<number>,
  rightBandOffsetsDb: ArrayLike<number>,
): readonly [readonly number[], readonly number[]] {
  const left = validateOffsets(leftBandOffsetsDb, 'leftBandOffsetsDb')
  const right = validateOffsets(rightBandOffsetsDb, 'rightBandOffsetsDb')
  for (let index = 0; index < BAND_COUNT; index += 1) {
    const delta = left[index] - right[index]
    if (Math.abs(delta) <= MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB) {
      continue
    }
    const midpoint = (left[index] + right[index]) / 2
    const halfLimit = MAX_INTERCHANNEL_CORRECTION_DIFFERENCE_DB / 2
    const sign = delta < 0 ? -1 : 1
    left[index] = clamp(
      midpoint + sign * halfLimit,
      -CALIBRATION_BAND_OFFSET_LIMIT_DB,
      CALIBRATION_BAND_OFFSET_LIMIT_DB,
    )
    right[index] = clamp(
      midpoint - sign * halfLimit,
      -CALIBRATION_BAND_OFFSET_LIMIT_DB,
      CALIBRATION_BAND_OFFSET_LIMIT_DB,
    )
  }
  return [Object.freeze(left), Object.freeze(right)]
}

export function createChannelCalibrationState(
  leftBandOffsetsDb: ArrayLike<number> = new Float64Array(BAND_COUNT),
  rightBandOffsetsDb: ArrayLike<number> = leftBandOffsetsDb,
): ChannelCalibrationState {
  const [left, right] = limitInterchannelCorrectionDifference(
    leftBandOffsetsDb,
    rightBandOffsetsDb,
  )
  return Object.freeze({
    schemaVersion: CHANNEL_CALIBRATION_SCHEMA_VERSION,
    leftBandOffsetsDb: left,
    rightBandOffsetsDb: right,
  })
}

export function channelCalibrationGainsLinear(
  offsetsDb: ArrayLike<number>,
): Float64Array {
  const validated = validateOffsets(offsetsDb, 'offsetsDb')
  return Float64Array.from(validated, (value) => decibelsToGain(value))
}
