import { assertFiniteNumber, assertPositiveFiniteNumber } from '../dsp/numbers'

export interface WelchPsdResult {
  readonly sampleRate: number
  readonly segmentLength: number
  readonly segmentCount: number
  readonly binWidthHz: number
  readonly power: Float64Array
}

export interface PsdSlopeFit {
  readonly slopeDbPerOctave: number
  readonly interceptDb: number
  readonly rSquared: number
  readonly binCount: number
}

function assertPowerOfTwo(value: number, label: string): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 16 ||
    (value & (value - 1)) !== 0
  ) {
    throw new RangeError(`${label} must be a power of two >= 16`)
  }

  return value
}

function fftInPlace(real: Float64Array, imaginary: Float64Array): void {
  const length = real.length
  let reversed = 0

  for (let index = 1; index < length; index += 1) {
    let bit = length >> 1
    while (reversed & bit) {
      reversed ^= bit
      bit >>= 1
    }
    reversed ^= bit

    if (index < reversed) {
      const realValue = real[index]
      real[index] = real[reversed]
      real[reversed] = realValue
      const imaginaryValue = imaginary[index]
      imaginary[index] = imaginary[reversed]
      imaginary[reversed] = imaginaryValue
    }
  }

  for (let blockLength = 2; blockLength <= length; blockLength *= 2) {
    const halfLength = blockLength >> 1
    const angle = (-2 * Math.PI) / blockLength
    const stepReal = Math.cos(angle)
    const stepImaginary = Math.sin(angle)

    for (let blockStart = 0; blockStart < length; blockStart += blockLength) {
      let twiddleReal = 1
      let twiddleImaginary = 0

      for (let offset = 0; offset < halfLength; offset += 1) {
        const evenIndex = blockStart + offset
        const oddIndex = evenIndex + halfLength
        const oddReal =
          real[oddIndex] * twiddleReal - imaginary[oddIndex] * twiddleImaginary
        const oddImaginary =
          real[oddIndex] * twiddleImaginary + imaginary[oddIndex] * twiddleReal
        const evenReal = real[evenIndex]
        const evenImaginary = imaginary[evenIndex]

        real[evenIndex] = evenReal + oddReal
        imaginary[evenIndex] = evenImaginary + oddImaginary
        real[oddIndex] = evenReal - oddReal
        imaginary[oddIndex] = evenImaginary - oddImaginary

        const nextTwiddleReal =
          twiddleReal * stepReal - twiddleImaginary * stepImaginary
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal
        twiddleReal = nextTwiddleReal
      }
    }
  }
}

export function welchPsd(
  samples: ArrayLike<number>,
  sampleRate: number,
  segmentLength = 2048,
): WelchPsdResult {
  const rate = assertPositiveFiniteNumber(sampleRate, 'sampleRate')
  const length = assertPowerOfTwo(segmentLength, 'segmentLength')
  if (samples.length < length) {
    throw new RangeError('samples must contain at least one complete segment')
  }

  const hopLength = length >> 1
  const window = new Float64Array(length)
  let windowEnergy = 0
  for (let index = 0; index < length; index += 1) {
    const value = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (length - 1)))
    window[index] = value
    windowEnergy += value * value
  }

  const binCount = length / 2 + 1
  const accumulatedPower = new Float64Array(binCount)
  const real = new Float64Array(length)
  const imaginary = new Float64Array(length)
  let segmentCount = 0

  for (let start = 0; start + length <= samples.length; start += hopLength) {
    for (let index = 0; index < length; index += 1) {
      const sample = assertFiniteNumber(samples[start + index], 'sample')
      real[index] = sample * window[index]
      imaginary[index] = 0
    }

    fftInPlace(real, imaginary)

    for (let bin = 0; bin < binCount; bin += 1) {
      let power = real[bin] * real[bin] + imaginary[bin] * imaginary[bin]
      if (bin !== 0 && bin !== binCount - 1) {
        power *= 2
      }
      accumulatedPower[bin] += power / (rate * windowEnergy)
    }
    segmentCount += 1
  }

  for (let bin = 0; bin < binCount; bin += 1) {
    accumulatedPower[bin] /= segmentCount
  }

  return {
    sampleRate: rate,
    segmentLength: length,
    segmentCount,
    binWidthHz: rate / length,
    power: accumulatedPower,
  }
}

export function fitPsdSlopeDbPerOctave(
  psd: WelchPsdResult,
  minimumFrequencyHz: number,
  maximumFrequencyHz: number,
): PsdSlopeFit {
  const minimum = assertPositiveFiniteNumber(
    minimumFrequencyHz,
    'minimumFrequencyHz',
  )
  const maximum = assertPositiveFiniteNumber(
    maximumFrequencyHz,
    'maximumFrequencyHz',
  )
  if (minimum >= maximum) {
    throw new RangeError('minimumFrequencyHz must be below maximumFrequencyHz')
  }
  if (maximum > psd.sampleRate / 2) {
    throw new RangeError('maximumFrequencyHz must not exceed Nyquist')
  }

  let count = 0
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumXY = 0
  let sumYY = 0

  for (let bin = 1; bin < psd.power.length; bin += 1) {
    const frequencyHz = bin * psd.binWidthHz
    if (frequencyHz < minimum || frequencyHz > maximum) {
      continue
    }

    const power = psd.power[bin]
    if (!(power > 0) || !Number.isFinite(power)) {
      continue
    }

    const x = Math.log2(frequencyHz / 1000)
    const y = 10 * Math.log10(power)
    count += 1
    sumX += x
    sumY += y
    sumXX += x * x
    sumXY += x * y
    sumYY += y * y
  }

  if (count < 2) {
    throw new RangeError(
      'frequency range must contain at least two finite PSD bins',
    )
  }

  const denominator = count * sumXX - sumX * sumX
  if (denominator === 0) {
    throw new RangeError(
      'PSD fit frequency range has zero log-frequency variance',
    )
  }

  const slope = (count * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / count
  const totalVariance = sumYY - (sumY * sumY) / count
  const residualVariance =
    sumYY +
    slope * slope * sumXX +
    count * intercept * intercept -
    2 * slope * sumXY -
    2 * intercept * sumY +
    2 * slope * intercept * sumX
  const rSquared =
    totalVariance > 0
      ? Math.min(1, Math.max(0, 1 - residualVariance / totalVariance))
      : 1

  return {
    slopeDbPerOctave: slope,
    interceptDb: intercept,
    rSquared,
    binCount: count,
  }
}
