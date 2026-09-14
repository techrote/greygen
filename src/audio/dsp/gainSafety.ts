import {
  BAND_COUNT,
  CROSSOVER_FREQUENCIES_HZ,
  HIGH_BAND_UPPER_CROSSOVER_HZ,
} from './filterBank'
import { assertFiniteNumber, decibelsToGain, gainToDecibels } from './numbers'
import {
  designBilinearOnePoleLowPass,
  isOnePoleCutoffSupported,
} from './onePole'
import type { FilterBankSpectralConfiguration } from './spectra'

export const GAIN_STAGE_SCHEMA_VERSION = 1 as const
export const DEFAULT_MASTER_GAIN_DB = 20 * Math.log10(0.05)
export const MASTER_GAIN_MIN_DB = -60
export const MASTER_GAIN_MAX_DB = 0
export const ANIMATION_BAND_OFFSET_LIMIT_DB = 12
export const CALIBRATION_BAND_OFFSET_LIMIT_DB = 24
export const CONTROL_SMOOTHING_TIME_SECONDS = 0.04
export const SAFETY_ATTACK_TIME_SECONDS = 0.005
export const SAFETY_RELEASE_TIME_SECONDS = 0.15
export const SAFETY_RESPONSE_BINS = 512
export const SAFETY_RESPONSE_MARGIN_DB = 0.5
export const SAFETY_TARGET_PEAK_DBFS = -0.5
export const FINAL_GUARD_LIMIT_LINEAR = 0.999

export interface GainStageState {
  readonly schemaVersion: typeof GAIN_STAGE_SCHEMA_VERSION
  readonly masterGainDb: number
  readonly animationBandOffsetsDb: readonly number[]
  readonly calibrationBandOffsetsDb: readonly number[]
}

export interface ResolvedGainTargets {
  readonly bandGainsLinear: Float64Array
  readonly ultrasonicResidualGainLinear: number
  readonly estimatedShapedPeakLinear: number
  readonly safetyPreGainLinear: number
}

function validateBandOffsets(
  values: ArrayLike<number>,
  limitDb: number,
  label: string,
): readonly number[] {
  if (values.length !== BAND_COUNT) {
    throw new RangeError(`${label} must contain exactly ${BAND_COUNT} values`)
  }

  const result = new Array<number>(BAND_COUNT)
  for (let index = 0; index < BAND_COUNT; index += 1) {
    const value = assertFiniteNumber(values[index], `${label}[${index}]`)
    if (value < -limitDb || value > limitDb) {
      throw new RangeError(
        `${label}[${index}] must be between ${-limitDb} and ${limitDb} dB`,
      )
    }
    result[index] = value
  }
  return Object.freeze(result)
}

export function createGainStageState(
  masterGainDb = DEFAULT_MASTER_GAIN_DB,
  animationBandOffsetsDb: ArrayLike<number> = new Float64Array(BAND_COUNT),
  calibrationBandOffsetsDb: ArrayLike<number> = new Float64Array(BAND_COUNT),
): GainStageState {
  const master = assertFiniteNumber(masterGainDb, 'masterGainDb')
  if (master < MASTER_GAIN_MIN_DB || master > MASTER_GAIN_MAX_DB) {
    throw new RangeError(
      `masterGainDb must be between ${MASTER_GAIN_MIN_DB} and ${MASTER_GAIN_MAX_DB} dB`,
    )
  }

  return Object.freeze({
    schemaVersion: GAIN_STAGE_SCHEMA_VERSION,
    masterGainDb: master,
    animationBandOffsetsDb: validateBandOffsets(
      animationBandOffsetsDb,
      ANIMATION_BAND_OFFSET_LIMIT_DB,
      'animationBandOffsetsDb',
    ),
    calibrationBandOffsetsDb: validateBandOffsets(
      calibrationBandOffsetsDb,
      CALIBRATION_BAND_OFFSET_LIMIT_DB,
      'calibrationBandOffsetsDb',
    ),
  })
}

export function masterGainLinear(state: GainStageState): number {
  return decibelsToGain(state.masterGainDb)
}

export function resolveLayeredBandGains(
  spectral: FilterBankSpectralConfiguration,
  state: GainStageState,
): Float64Array {
  const gains = new Float64Array(BAND_COUNT)
  for (let index = 0; index < BAND_COUNT; index += 1) {
    const layerDb =
      state.animationBandOffsetsDb[index] +
      state.calibrationBandOffsetsDb[index]
    const gain = spectral.bandGainsLinear[index] * decibelsToGain(layerDb)
    if (!Number.isFinite(gain) || gain < 0) {
      throw new RangeError(
        `combined band gain ${index} must be finite and non-negative`,
      )
    }
    gains[index] = gain
  }
  return gains
}

function evaluateLowPass(
  b0: number,
  a1: number,
  cosine: number,
  sine: number,
): readonly [number, number] {
  const numeratorReal = b0 + b0 * cosine
  const numeratorImag = -b0 * sine
  const denominatorReal = 1 + a1 * cosine
  const denominatorImag = -a1 * sine
  const denominatorMagnitudeSquared =
    denominatorReal * denominatorReal + denominatorImag * denominatorImag

  return [
    (numeratorReal * denominatorReal + numeratorImag * denominatorImag) /
      denominatorMagnitudeSquared,
    (numeratorImag * denominatorReal - numeratorReal * denominatorImag) /
      denominatorMagnitudeSquared,
  ]
}

export function estimateFilterBankPeakGain(
  sampleRate: number,
  bandGainsLinear: ArrayLike<number>,
  ultrasonicResidualGainLinear: number,
  responseBins = SAFETY_RESPONSE_BINS,
): number {
  if (bandGainsLinear.length !== BAND_COUNT) {
    throw new RangeError(`bandGainsLinear must contain ${BAND_COUNT} values`)
  }
  if (!Number.isSafeInteger(responseBins) || responseBins < 16) {
    throw new RangeError('responseBins must be a safe integer >= 16')
  }

  const residualGain = assertFiniteNumber(
    ultrasonicResidualGainLinear,
    'ultrasonicResidualGainLinear',
  )
  if (residualGain < 0) {
    throw new RangeError('ultrasonicResidualGainLinear must be non-negative')
  }

  const crossoverCoefficients = CROSSOVER_FREQUENCIES_HZ.map((frequencyHz) =>
    designBilinearOnePoleLowPass(frequencyHz, sampleRate),
  )
  const highBandUpperCoefficients = isOnePoleCutoffSupported(
    HIGH_BAND_UPPER_CROSSOVER_HZ,
    sampleRate,
  )
    ? designBilinearOnePoleLowPass(HIGH_BAND_UPPER_CROSSOVER_HZ, sampleRate)
    : null

  let maximumMagnitude = 0
  for (let bin = 0; bin < responseBins; bin += 1) {
    const omega = (Math.PI * bin) / (responseBins - 1)
    const cosine = Math.cos(omega)
    const sine = Math.sin(omega)
    let residualReal = 1
    let residualImag = 0
    let outputReal = 0
    let outputImag = 0

    for (let index = 0; index < crossoverCoefficients.length; index += 1) {
      const coefficients = crossoverCoefficients[index]
      const [lowReal, lowImag] = evaluateLowPass(
        coefficients.b0,
        coefficients.a1,
        cosine,
        sine,
      )
      const componentReal = residualReal * lowReal - residualImag * lowImag
      const componentImag = residualReal * lowImag + residualImag * lowReal
      const gain = assertFiniteNumber(
        bandGainsLinear[index],
        `bandGainsLinear[${index}]`,
      )
      if (gain < 0) {
        throw new RangeError(`bandGainsLinear[${index}] must be non-negative`)
      }
      outputReal += componentReal * gain
      outputImag += componentImag * gain

      const highReal = 1 - lowReal
      const highImag = -lowImag
      const nextResidualReal = residualReal * highReal - residualImag * highImag
      residualImag = residualReal * highImag + residualImag * highReal
      residualReal = nextResidualReal
    }

    const topGain = assertFiniteNumber(
      bandGainsLinear[BAND_COUNT - 1],
      `bandGainsLinear[${BAND_COUNT - 1}]`,
    )
    if (topGain < 0) {
      throw new RangeError(
        `bandGainsLinear[${BAND_COUNT - 1}] must be non-negative`,
      )
    }

    if (highBandUpperCoefficients) {
      const [lowReal, lowImag] = evaluateLowPass(
        highBandUpperCoefficients.b0,
        highBandUpperCoefficients.a1,
        cosine,
        sine,
      )
      const componentReal = residualReal * lowReal - residualImag * lowImag
      const componentImag = residualReal * lowImag + residualImag * lowReal
      outputReal += componentReal * topGain
      outputImag += componentImag * topGain

      const highReal = 1 - lowReal
      const highImag = -lowImag
      const nextResidualReal = residualReal * highReal - residualImag * highImag
      residualImag = residualReal * highImag + residualImag * highReal
      residualReal = nextResidualReal
      outputReal += residualReal * residualGain
      outputImag += residualImag * residualGain
    } else {
      outputReal += residualReal * topGain
      outputImag += residualImag * topGain
    }

    maximumMagnitude = Math.max(
      maximumMagnitude,
      Math.hypot(outputReal, outputImag),
    )
  }

  return maximumMagnitude
}

export function computeSafetyPreGainLinear(
  estimatedShapedPeakLinear: number,
): number {
  const estimate = assertFiniteNumber(
    estimatedShapedPeakLinear,
    'estimatedShapedPeakLinear',
  )
  if (estimate < 0) {
    throw new RangeError('estimatedShapedPeakLinear must be non-negative')
  }
  if (estimate === 0) {
    return 1
  }

  const marginLinear = decibelsToGain(SAFETY_RESPONSE_MARGIN_DB)
  const targetLinear = decibelsToGain(SAFETY_TARGET_PEAK_DBFS)
  return Math.min(1, targetLinear / (estimate * marginLinear))
}

export function resolveGainTargets(
  sampleRate: number,
  spectral: FilterBankSpectralConfiguration,
  state: GainStageState,
): ResolvedGainTargets {
  const bandGainsLinear = resolveLayeredBandGains(spectral, state)
  const estimatedShapedPeakLinear = estimateFilterBankPeakGain(
    sampleRate,
    bandGainsLinear,
    spectral.ultrasonicResidualGainLinear,
  )

  return {
    bandGainsLinear,
    ultrasonicResidualGainLinear: spectral.ultrasonicResidualGainLinear,
    estimatedShapedPeakLinear,
    safetyPreGainLinear: computeSafetyPreGainLinear(estimatedShapedPeakLinear),
  }
}

export function safetyPreGainDb(linear: number): number {
  return gainToDecibels(linear)
}

export function applyFinalGuard(sample: number): number {
  if (!Number.isFinite(sample)) {
    return 0
  }
  return Math.max(
    -FINAL_GUARD_LIMIT_LINEAR,
    Math.min(FINAL_GUARD_LIMIT_LINEAR, sample),
  )
}
