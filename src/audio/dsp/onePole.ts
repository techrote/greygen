import { assertFiniteNumber, assertPositiveFiniteNumber } from './numbers'

export const MAX_CUTOFF_TO_NYQUIST_RATIO = 0.9

export interface OnePoleLowPassCoefficients {
  readonly b0: number
  readonly b1: number
  readonly a1: number
}

export function isOnePoleCutoffSupported(
  cutoffHz: number,
  sampleRate: number,
): boolean {
  return (
    Number.isFinite(cutoffHz) &&
    cutoffHz > 0 &&
    Number.isFinite(sampleRate) &&
    sampleRate > 0 &&
    cutoffHz <= (sampleRate * MAX_CUTOFF_TO_NYQUIST_RATIO) / 2
  )
}

export function designBilinearOnePoleLowPass(
  cutoffHz: number,
  sampleRate: number,
): OnePoleLowPassCoefficients {
  const cutoff = assertPositiveFiniteNumber(cutoffHz, 'cutoffHz')
  const rate = assertPositiveFiniteNumber(sampleRate, 'sampleRate')

  if (!isOnePoleCutoffSupported(cutoff, rate)) {
    throw new RangeError(
      `cutoffHz must not exceed ${MAX_CUTOFF_TO_NYQUIST_RATIO * 100}% of Nyquist`,
    )
  }

  const warped = Math.tan((Math.PI * cutoff) / rate)
  const normalization = 1 / (1 + warped)
  const b0 = warped * normalization
  const coefficients = {
    b0,
    b1: b0,
    a1: (warped - 1) * normalization,
  }

  assertFiniteNumber(coefficients.b0, 'b0')
  assertFiniteNumber(coefficients.b1, 'b1')
  assertFiniteNumber(coefficients.a1, 'a1')

  if (Math.abs(coefficients.a1) >= 1) {
    throw new RangeError('designed one-pole filter is not stable')
  }

  return coefficients
}

export class BilinearOnePoleLowPass {
  private state = 0
  private readonly coefficientsValue: OnePoleLowPassCoefficients

  constructor(cutoffHz: number, sampleRate: number) {
    this.coefficientsValue = designBilinearOnePoleLowPass(cutoffHz, sampleRate)
  }

  get coefficients(): OnePoleLowPassCoefficients {
    return this.coefficientsValue
  }

  processSample(input: number): number {
    const output = this.coefficientsValue.b0 * input + this.state
    this.state =
      this.coefficientsValue.b1 * input - this.coefficientsValue.a1 * output
    return output
  }

  reset(state = 0): void {
    this.state = assertFiniteNumber(state, 'state')
  }
}
