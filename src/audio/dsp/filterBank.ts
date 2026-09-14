import {
  assertFiniteNumber,
  assertPositiveFiniteNumber,
} from './numbers'
import {
  BilinearOnePoleLowPass,
  isOnePoleCutoffSupported,
} from './onePole'

export const NOMINAL_BAND_CENTERS_HZ = Object.freeze([
  31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
])

export const BAND_COUNT = NOMINAL_BAND_CENTERS_HZ.length
export const CROSSOVER_FREQUENCIES_HZ = Object.freeze(
  NOMINAL_BAND_CENTERS_HZ.slice(0, -1).map(
    (centerHz) => centerHz * Math.SQRT2,
  ),
)
export const HIGH_BAND_UPPER_CROSSOVER_HZ =
  NOMINAL_BAND_CENTERS_HZ[BAND_COUNT - 1] * Math.SQRT2
export const MAX_FILTER_BANK_GAIN_LINEAR = 16

export type HighBandMode = 'bounded-bandpass' | 'degraded-high-shelf'

function assertBandIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= BAND_COUNT) {
    throw new RangeError(`band index must be an integer from 0 to ${BAND_COUNT - 1}`)
  }

  return index
}

function assertBandGain(gain: number): number {
  const validatedGain = assertFiniteNumber(gain, 'gain')

  if (validatedGain < 0 || validatedGain > MAX_FILTER_BANK_GAIN_LINEAR) {
    throw new RangeError(
      `gain must be between 0 and ${MAX_FILTER_BANK_GAIN_LINEAR}`,
    )
  }

  return validatedGain
}

export class TenBandFilterBank {
  readonly sampleRate: number
  readonly highBandMode: HighBandMode
  readonly highBandUpperEdgeHz: number | null

  private readonly crossovers: BilinearOnePoleLowPass[]
  private readonly highBandUpperCrossover: BilinearOnePoleLowPass | null
  private readonly bandGains = new Float64Array(BAND_COUNT)
  private readonly scratchBands = new Float64Array(BAND_COUNT)

  constructor(sampleRate: number) {
    this.sampleRate = assertPositiveFiniteNumber(sampleRate, 'sampleRate')

    for (const crossoverHz of CROSSOVER_FREQUENCIES_HZ) {
      if (!isOnePoleCutoffSupported(crossoverHz, this.sampleRate)) {
        throw new RangeError(
          `sampleRate ${this.sampleRate} cannot safely support crossover ${crossoverHz}`,
        )
      }
    }

    this.crossovers = CROSSOVER_FREQUENCIES_HZ.map(
      (crossoverHz) =>
        new BilinearOnePoleLowPass(crossoverHz, this.sampleRate),
    )

    if (
      isOnePoleCutoffSupported(
        HIGH_BAND_UPPER_CROSSOVER_HZ,
        this.sampleRate,
      )
    ) {
      this.highBandUpperCrossover = new BilinearOnePoleLowPass(
        HIGH_BAND_UPPER_CROSSOVER_HZ,
        this.sampleRate,
      )
      this.highBandMode = 'bounded-bandpass'
      this.highBandUpperEdgeHz = HIGH_BAND_UPPER_CROSSOVER_HZ
    } else {
      this.highBandUpperCrossover = null
      this.highBandMode = 'degraded-high-shelf'
      this.highBandUpperEdgeHz = null
    }

    this.bandGains.fill(1)
  }

  get highBandDegraded(): boolean {
    return this.highBandMode === 'degraded-high-shelf'
  }

  getBandGainLinear(index: number): number {
    return this.bandGains[assertBandIndex(index)]
  }

  setBandGainLinear(index: number, gain: number): void {
    this.bandGains[assertBandIndex(index)] = assertBandGain(gain)
  }

  setBandGainsLinear(gains: ArrayLike<number>): void {
    if (gains.length !== BAND_COUNT) {
      throw new RangeError(`gains must contain exactly ${BAND_COUNT} values`)
    }

    for (let index = 0; index < BAND_COUNT; index += 1) {
      assertBandGain(gains[index])
    }

    for (let index = 0; index < BAND_COUNT; index += 1) {
      this.bandGains[index] = gains[index]
    }
  }

  reset(): void {
    for (const crossover of this.crossovers) {
      crossover.reset()
    }
    this.highBandUpperCrossover?.reset()
  }

  processBandComponents(
    input: number,
    outputBands: Float64Array,
  ): number {
    if (outputBands.length < BAND_COUNT) {
      throw new RangeError(`outputBands must have at least ${BAND_COUNT} elements`)
    }

    let residual = input

    for (let index = 0; index < this.crossovers.length; index += 1) {
      const low = this.crossovers[index].processSample(residual)
      outputBands[index] = low
      residual -= low
    }

    if (this.highBandUpperCrossover) {
      const highBand = this.highBandUpperCrossover.processSample(residual)
      outputBands[BAND_COUNT - 1] = highBand
      return residual - highBand
    }

    outputBands[BAND_COUNT - 1] = residual
    return 0
  }

  processSample(input: number): number {
    let output = this.processBandComponents(input, this.scratchBands)

    for (let index = 0; index < BAND_COUNT; index += 1) {
      output += this.scratchBands[index] * this.bandGains[index]
    }

    return output
  }
}
