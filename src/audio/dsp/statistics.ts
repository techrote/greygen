export interface BlockStatistics {
  readonly count: number
  readonly mean: number
  readonly variance: number
  readonly rms: number
  readonly peakAbsolute: number
}

export function isFiniteBlock(samples: ArrayLike<number>): boolean {
  for (let index = 0; index < samples.length; index += 1) {
    if (!Number.isFinite(samples[index])) {
      return false
    }
  }

  return true
}

export function blockStatistics(samples: ArrayLike<number>): BlockStatistics {
  if (samples.length === 0) {
    throw new RangeError('samples must not be empty')
  }

  let mean = 0
  let sumSquaredDifferences = 0
  let sumSquares = 0
  let peakAbsolute = 0

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    if (!Number.isFinite(sample)) {
      throw new RangeError(`samples[${index}] must be finite`)
    }

    const count = index + 1
    const difference = sample - mean
    mean += difference / count
    sumSquaredDifferences += difference * (sample - mean)
    sumSquares += sample * sample
    peakAbsolute = Math.max(peakAbsolute, Math.abs(sample))
  }

  return {
    count: samples.length,
    mean,
    variance: sumSquaredDifferences / samples.length,
    rms: Math.sqrt(sumSquares / samples.length),
    peakAbsolute,
  }
}
