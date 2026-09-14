export const MIN_DECIBELS = -160
export const MAX_DECIBELS = 160

export function assertFiniteNumber(value: number, label = 'value'): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`)
  }

  return value
}

export function assertPositiveFiniteNumber(
  value: number,
  label = 'value',
): number {
  assertFiniteNumber(value, label)

  if (value <= 0) {
    throw new RangeError(`${label} must be greater than zero`)
  }

  return value
}

export function assertNonNegativeFiniteNumber(
  value: number,
  label = 'value',
): number {
  assertFiniteNumber(value, label)

  if (value < 0) {
    throw new RangeError(`${label} must be non-negative`)
  }

  return value
}

export function clampFinite(value: number, minimum: number, maximum: number) {
  assertFiniteNumber(value)
  assertFiniteNumber(minimum, 'minimum')
  assertFiniteNumber(maximum, 'maximum')

  if (minimum > maximum) {
    throw new RangeError('minimum must not exceed maximum')
  }

  return Math.min(maximum, Math.max(minimum, value))
}

export function decibelsToGain(decibels: number): number {
  const boundedDecibels = clampFinite(decibels, MIN_DECIBELS, MAX_DECIBELS)
  return 10 ** (boundedDecibels / 20)
}

export function gainToDecibels(
  gain: number,
  floorDecibels = MIN_DECIBELS,
): number {
  assertFiniteNumber(gain, 'gain')
  const boundedFloor = clampFinite(floorDecibels, MIN_DECIBELS, MAX_DECIBELS)

  if (gain < 0) {
    throw new RangeError('gain must be non-negative')
  }

  if (gain === 0) {
    return boundedFloor
  }

  return clampFinite(20 * Math.log10(gain), boundedFloor, MAX_DECIBELS)
}
