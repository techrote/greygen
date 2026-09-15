import { assertFiniteNumber } from './numbers'

export const STEREO_WIDTH_SCHEMA_VERSION = 1 as const
export const STEREO_WIDTH_MIN = 0
export const STEREO_WIDTH_MAX = 1
export const DEFAULT_STEREO_WIDTH = 0.5
export const STEREO_WIDTH_SMOOTHING_TIME_SECONDS = 0.04
export const STEREO_MIX_MAX_ANGLE_RADIANS = Math.PI / 4

export interface StereoWidthState {
  readonly schemaVersion: typeof STEREO_WIDTH_SCHEMA_VERSION
  readonly width: number
}

export type StereoWidthLabel = 'Mono' | 'Narrow' | 'Normal' | 'Wide'

function validateWidth(width: number): number {
  const value = assertFiniteNumber(width, 'stereo width')
  if (value < STEREO_WIDTH_MIN || value > STEREO_WIDTH_MAX) {
    throw new RangeError(
      `stereo width must be between ${STEREO_WIDTH_MIN} and ${STEREO_WIDTH_MAX}`,
    )
  }
  return value
}

export function createStereoWidthState(
  width = DEFAULT_STEREO_WIDTH,
): StereoWidthState {
  return Object.freeze({
    schemaVersion: STEREO_WIDTH_SCHEMA_VERSION,
    width: validateWidth(width),
  })
}

export function stereoWidthToMixAngle(width: number): number {
  return validateWidth(width) * STEREO_MIX_MAX_ANGLE_RADIANS
}

export function stereoWidthToCorrelation(width: number): number {
  const value = validateWidth(width)
  if (value === STEREO_WIDTH_MIN) {
    return 1
  }
  if (value === STEREO_WIDTH_MAX) {
    return 0
  }
  return Math.cos(value * (Math.PI / 2))
}

export function stereoWidthLabel(width: number): StereoWidthLabel {
  const value = validateWidth(width)
  if (value === 0) {
    return 'Mono'
  }
  if (value < 1 / 3) {
    return 'Narrow'
  }
  if (value < 2 / 3) {
    return 'Normal'
  }
  return 'Wide'
}
