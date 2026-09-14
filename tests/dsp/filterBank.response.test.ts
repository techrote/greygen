import { describe, expect, it } from 'vitest'
import {
  BAND_COUNT,
  CROSSOVER_FREQUENCIES_HZ,
  HIGH_BAND_UPPER_CROSSOVER_HZ,
  NOMINAL_BAND_CENTERS_HZ,
} from '../../src/audio/dsp/filterBank'
import {
  designBilinearOnePoleLowPass,
  isOnePoleCutoffSupported,
} from '../../src/audio/dsp/onePole'

type Complex = readonly [real: number, imaginary: number]

const SAMPLE_RATES = [44_100, 48_000, 96_000]

function add(left: Complex, right: Complex): Complex {
  return [left[0] + right[0], left[1] + right[1]]
}

function subtract(left: Complex, right: Complex): Complex {
  return [left[0] - right[0], left[1] - right[1]]
}

function multiply(left: Complex, right: Complex): Complex {
  return [
    left[0] * right[0] - left[1] * right[1],
    left[0] * right[1] + left[1] * right[0],
  ]
}

function magnitude(value: Complex): number {
  return Math.hypot(value[0], value[1])
}

function responseDb(value: Complex): number {
  return 20 * Math.log10(magnitude(value))
}

function onePoleResponse(
  cutoffHz: number,
  sampleRate: number,
  frequencyHz: number,
): Complex {
  const coefficients = designBilinearOnePoleLowPass(cutoffHz, sampleRate)
  const angle = (-2 * Math.PI * frequencyHz) / sampleRate
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const numerator: Complex = [
    coefficients.b0 + coefficients.b1 * cosine,
    coefficients.b1 * sine,
  ]
  const denominator: Complex = [
    1 + coefficients.a1 * cosine,
    coefficients.a1 * sine,
  ]
  const denominatorMagnitudeSquared =
    denominator[0] * denominator[0] + denominator[1] * denominator[1]

  return [
    (numerator[0] * denominator[0] + numerator[1] * denominator[1]) /
      denominatorMagnitudeSquared,
    (numerator[1] * denominator[0] - numerator[0] * denominator[1]) /
      denominatorMagnitudeSquared,
  ]
}

function componentResponses(
  sampleRate: number,
  frequencyHz: number,
): { bands: Complex[]; ultrasonicResidual: Complex } {
  let residual: Complex = [1, 0]
  const bands: Complex[] = []

  for (const crossoverHz of CROSSOVER_FREQUENCIES_HZ) {
    const low = multiply(
      residual,
      onePoleResponse(crossoverHz, sampleRate, frequencyHz),
    )
    bands.push(low)
    residual = subtract(residual, low)
  }

  if (isOnePoleCutoffSupported(HIGH_BAND_UPPER_CROSSOVER_HZ, sampleRate)) {
    const highBand = multiply(
      residual,
      onePoleResponse(HIGH_BAND_UPPER_CROSSOVER_HZ, sampleRate, frequencyHz),
    )
    bands.push(highBand)
    residual = subtract(residual, highBand)
  } else {
    bands.push(residual)
    residual = [0, 0]
  }

  return { bands, ultrasonicResidual: residual }
}

function logFrequencyGrid(
  minimumHz: number,
  maximumHz: number,
  count: number,
): number[] {
  const ratio = maximumHz / minimumHz
  return Array.from(
    { length: count },
    (_, index) => minimumHz * ratio ** (index / (count - 1)),
  )
}

function peakFrequencyForBand(sampleRate: number, bandIndex: number): number {
  const centerHz = NOMINAL_BAND_CENTERS_HZ[bandIndex]
  const maximumHz = Math.min(centerHz * 2, sampleRate * 0.45)
  let peakFrequencyHz = centerHz
  let peakMagnitude = -1

  for (const frequencyHz of logFrequencyGrid(centerHz / 2, maximumHz, 4096)) {
    const response = componentResponses(sampleRate, frequencyHz).bands[
      bandIndex
    ]
    const responseMagnitude = magnitude(response)

    if (responseMagnitude > peakMagnitude) {
      peakMagnitude = responseMagnitude
      peakFrequencyHz = frequencyHz
    }
  }

  return peakFrequencyHz
}

describe('ten-band complementary frequency response', () => {
  it.each(SAMPLE_RATES)(
    'has effectively exact neutral reconstruction across the validated interior at %d Hz',
    (sampleRate) => {
      const maximumHz = Math.min(20_000, sampleRate * 0.45)
      let maximumDeviationDb = 0

      for (const frequencyHz of logFrequencyGrid(20, maximumHz, 2048)) {
        const response = componentResponses(sampleRate, frequencyHz)
        let sum = response.ultrasonicResidual

        for (const band of response.bands) {
          sum = add(sum, band)
        }

        expect(Number.isFinite(sum[0])).toBe(true)
        expect(Number.isFinite(sum[1])).toBe(true)
        maximumDeviationDb = Math.max(
          maximumDeviationDb,
          Math.abs(responseDb(sum)),
        )
      }

      expect(maximumDeviationDb).toBeLessThan(0.01)
    },
  )

  it.each(SAMPLE_RATES)(
    'keeps interior band peaks within 0.22 octaves of nominal centers at %d Hz',
    (sampleRate) => {
      for (let bandIndex = 1; bandIndex < BAND_COUNT - 1; bandIndex += 1) {
        const centerHz = NOMINAL_BAND_CENTERS_HZ[bandIndex]
        const peakFrequencyHz = peakFrequencyForBand(sampleRate, bandIndex)
        const octaveOffset = Math.abs(Math.log2(peakFrequencyHz / centerHz))
        expect(octaveOffset).toBeLessThan(0.22)
      }
    },
  )

  it.each(SAMPLE_RATES)(
    'implements the first band as an intentional low shelf at %d Hz',
    (sampleRate) => {
      const responseAt5Hz = componentResponses(sampleRate, 5).bands[0]
      const responseAtCenter = componentResponses(sampleRate, 31.25).bands[0]
      const responseAt125Hz = componentResponses(sampleRate, 125).bands[0]

      expect(responseDb(responseAt5Hz)).toBeGreaterThan(-0.2)
      expect(magnitude(responseAt5Hz)).toBeGreaterThan(
        magnitude(responseAtCenter),
      )
      expect(magnitude(responseAtCenter)).toBeGreaterThan(
        magnitude(responseAt125Hz),
      )
    },
  )

  it('uses a degraded 16 kHz high shelf at 44.1 and 48 kHz', () => {
    for (const sampleRate of [44_100, 48_000]) {
      const at16k = componentResponses(sampleRate, 16_000).bands[9]
      const nearNyquist = componentResponses(sampleRate, sampleRate * 0.49)
        .bands[9]

      expect(responseDb(at16k)).toBeGreaterThan(-2)
      expect(magnitude(nearNyquist)).toBeGreaterThan(magnitude(at16k))
      expect(responseDb(nearNyquist)).toBeGreaterThan(-0.1)
    }
  })

  it('uses a bounded 16 kHz band at 96 kHz and preserves an ultrasonic residual', () => {
    const peakFrequencyHz = peakFrequencyForBand(96_000, 9)
    const octaveOffset = Math.abs(Math.log2(peakFrequencyHz / 16_000))
    const at40k = componentResponses(96_000, 40_000)

    expect(octaveOffset).toBeLessThan(0.22)
    expect(magnitude(at40k.ultrasonicResidual)).toBeGreaterThan(
      magnitude(at40k.bands[9]),
    )
  })
})
