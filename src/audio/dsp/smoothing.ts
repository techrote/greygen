import {
  assertFiniteNumber,
  assertNonNegativeFiniteNumber,
  assertPositiveFiniteNumber,
} from './numbers'

export class OnePoleSmoother {
  private currentValue: number
  private targetValue: number
  private coefficient = 0
  private readonly sampleRate: number

  constructor(
    initialValue: number,
    sampleRate: number,
    timeConstantSeconds: number,
  ) {
    this.currentValue = assertFiniteNumber(initialValue, 'initialValue')
    this.targetValue = this.currentValue
    this.sampleRate = assertPositiveFiniteNumber(sampleRate, 'sampleRate')
    this.setTimeConstantSeconds(timeConstantSeconds)
  }

  get current(): number {
    return this.currentValue
  }

  get target(): number {
    return this.targetValue
  }

  setTarget(target: number): void {
    this.targetValue = assertFiniteNumber(target, 'target')
  }

  setTimeConstantSeconds(timeConstantSeconds: number): void {
    const timeConstant = assertNonNegativeFiniteNumber(
      timeConstantSeconds,
      'timeConstantSeconds',
    )

    if (timeConstant === 0) {
      this.coefficient = 0
      return
    }

    const samplesPerTimeConstant = timeConstant * this.sampleRate
    if (!Number.isFinite(samplesPerTimeConstant)) {
      throw new RangeError('time constant is too large for this sample rate')
    }

    this.coefficient = Math.exp(-1 / samplesPerTimeConstant)
  }

  reset(value: number): void {
    const validatedValue = assertFiniteNumber(value)
    this.currentValue = validatedValue
    this.targetValue = validatedValue
  }

  next(): number {
    if (this.coefficient === 0) {
      this.currentValue = this.targetValue
      return this.currentValue
    }

    this.currentValue =
      this.targetValue +
      (this.currentValue - this.targetValue) * this.coefficient
    return this.currentValue
  }
}

export class LinearRamp {
  private currentValue: number
  private targetValue: number
  private increment = 0
  private remaining = 0

  constructor(initialValue: number) {
    this.currentValue = assertFiniteNumber(initialValue, 'initialValue')
    this.targetValue = this.currentValue
  }

  get current(): number {
    return this.currentValue
  }

  get target(): number {
    return this.targetValue
  }

  get remainingSamples(): number {
    return this.remaining
  }

  setTargetSamples(target: number, sampleCount: number): void {
    const validatedTarget = assertFiniteNumber(target, 'target')

    if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) {
      throw new RangeError('sampleCount must be a non-negative safe integer')
    }

    this.targetValue = validatedTarget
    this.remaining = sampleCount

    if (sampleCount === 0) {
      this.currentValue = validatedTarget
      this.increment = 0
      return
    }

    this.increment = (validatedTarget - this.currentValue) / sampleCount
  }

  setTargetSeconds(
    target: number,
    durationSeconds: number,
    sampleRate: number,
  ): void {
    const duration = assertNonNegativeFiniteNumber(
      durationSeconds,
      'durationSeconds',
    )
    const validatedSampleRate = assertPositiveFiniteNumber(
      sampleRate,
      'sampleRate',
    )
    const exactSampleCount = duration * validatedSampleRate

    if (
      !Number.isFinite(exactSampleCount) ||
      exactSampleCount > Number.MAX_SAFE_INTEGER
    ) {
      throw new RangeError('duration is too large for this sample rate')
    }

    this.setTargetSamples(target, Math.round(exactSampleCount))
  }

  reset(value: number): void {
    const validatedValue = assertFiniteNumber(value)
    this.currentValue = validatedValue
    this.targetValue = validatedValue
    this.increment = 0
    this.remaining = 0
  }

  next(): number {
    if (this.remaining === 0) {
      return this.currentValue
    }

    if (this.remaining === 1) {
      this.currentValue = this.targetValue
      this.remaining = 0
      this.increment = 0
      return this.currentValue
    }

    this.currentValue += this.increment
    this.remaining -= 1
    return this.currentValue
  }
}
