import {
  BAND_COUNT,
  HIGH_BAND_UPPER_CROSSOVER_HZ,
  NOMINAL_BAND_CENTERS_HZ,
  TenBandFilterBank,
} from './filterBank'
import { decibelsToGain } from './numbers'

export const SPECTRAL_TARGET_SCHEMA_VERSION = 1 as const
export const WHITE_PSD_SLOPE_DB_PER_OCTAVE = 0
export const PINK_PSD_SLOPE_DB_PER_OCTAVE = -3.0103
export const BROWN_PSD_SLOPE_DB_PER_OCTAVE = -6.0206
export const PINK_REALIZATION_BASIS_SLOPE_DB_PER_OCTAVE = -3.85
export const BROWN_REALIZATION_BASIS_SLOPE_DB_PER_OCTAVE = -20
export const USER_BAND_OFFSET_MIN_DB = -24
export const USER_BAND_OFFSET_MAX_DB = 24

export type SpectralPresetId = 'white' | 'pink' | 'brown' | 'grey'

export interface SpectralTarget {
  readonly schemaVersion: typeof SPECTRAL_TARGET_SCHEMA_VERSION
  readonly id: SpectralPresetId
  readonly label: string
  readonly targetDbByBand: readonly number[]
  readonly expectedPsdSlopeDbPerOctave: number | null
  readonly provenance: string
}

export interface SpectrumState {
  readonly targetId: SpectralPresetId
  readonly userBandOffsetsDb: readonly number[]
}

export interface FilterBankSpectralConfiguration {
  readonly bandGainsLinear: Float64Array
  readonly ultrasonicResidualGainLinear: number
}

interface PresetDefinition {
  readonly target: SpectralTarget
  readonly realizationBandGainsLinear: readonly number[]
  readonly realizationUltrasonicResidualGainLinear: number
}

const LOWEST_CENTER_HZ = NOMINAL_BAND_CENTERS_HZ[0]

function powerLawTargetDb(slopeDbPerOctave: number): readonly number[] {
  return Object.freeze(
    NOMINAL_BAND_CENTERS_HZ.map(
      (frequencyHz) =>
        slopeDbPerOctave * Math.log2(frequencyHz / LOWEST_CENTER_HZ),
    ),
  )
}

function powerLawRealizationGains(
  basisSlopeDbPerOctave: number,
): readonly number[] {
  return Object.freeze(
    NOMINAL_BAND_CENTERS_HZ.map((frequencyHz) =>
      decibelsToGain(
        basisSlopeDbPerOctave * Math.log2(frequencyHz / LOWEST_CENTER_HZ),
      ),
    ),
  )
}

function powerLawResidualGain(basisSlopeDbPerOctave: number): number {
  return decibelsToGain(
    basisSlopeDbPerOctave *
      Math.log2(HIGH_BAND_UPPER_CROSSOVER_HZ / LOWEST_CENTER_HZ),
  )
}

function greyPracticalRawDb(frequencyHz: number): number {
  const octavePosition = Math.log2(frequencyHz / 1000)
  const broadEdgeLift =
    5 * (1 - Math.exp(-0.1 * octavePosition * octavePosition))
  const gentleHighAsymmetry = 0.15 * Math.max(octavePosition, 0)
  return broadEdgeLift + gentleHighAsymmetry
}

function greyPracticalTargetDb(): readonly number[] {
  const raw = NOMINAL_BAND_CENTERS_HZ.map(greyPracticalRawDb)
  const maximum = Math.max(...raw)
  return Object.freeze(raw.map((value) => value - maximum))
}

function freezeTarget(target: SpectralTarget): SpectralTarget {
  return Object.freeze(target)
}

const whiteTargetDb = powerLawTargetDb(WHITE_PSD_SLOPE_DB_PER_OCTAVE)
const pinkTargetDb = powerLawTargetDb(PINK_PSD_SLOPE_DB_PER_OCTAVE)
const brownTargetDb = powerLawTargetDb(BROWN_PSD_SLOPE_DB_PER_OCTAVE)
const greyTargetDb = greyPracticalTargetDb()

const PRESET_DEFINITIONS: Readonly<Record<SpectralPresetId, PresetDefinition>> =
  Object.freeze({
    white: {
      target: freezeTarget({
        schemaVersion: SPECTRAL_TARGET_SCHEMA_VERSION,
        id: 'white',
        label: 'White',
        targetDbByBand: whiteTargetDb,
        expectedPsdSlopeDbPerOctave: WHITE_PSD_SLOPE_DB_PER_OCTAVE,
        provenance:
          'Mathematical white-noise target: flat power spectral density in the validated interior range.',
      }),
      realizationBandGainsLinear: Object.freeze(Array(BAND_COUNT).fill(1)),
      realizationUltrasonicResidualGainLinear: 1,
    },
    pink: {
      target: freezeTarget({
        schemaVersion: SPECTRAL_TARGET_SCHEMA_VERSION,
        id: 'pink',
        label: 'Pink',
        targetDbByBand: pinkTargetDb,
        expectedPsdSlopeDbPerOctave: PINK_PSD_SLOPE_DB_PER_OCTAVE,
        provenance:
          'Mathematical pink-noise target: -3.0103 dB/octave PSD. The internal filter-bank realization is independently characterized against rendered PSD.',
      }),
      realizationBandGainsLinear: powerLawRealizationGains(
        PINK_REALIZATION_BASIS_SLOPE_DB_PER_OCTAVE,
      ),
      realizationUltrasonicResidualGainLinear: powerLawResidualGain(
        PINK_REALIZATION_BASIS_SLOPE_DB_PER_OCTAVE,
      ),
    },
    brown: {
      target: freezeTarget({
        schemaVersion: SPECTRAL_TARGET_SCHEMA_VERSION,
        id: 'brown',
        label: 'Brown / Red',
        targetDbByBand: brownTargetDb,
        expectedPsdSlopeDbPerOctave: BROWN_PSD_SLOPE_DB_PER_OCTAVE,
        provenance:
          'Mathematical brown/red target: -6.0206 dB/octave PSD above the bounded low-frequency corner. Greygen does not use a free-running integrator.',
      }),
      realizationBandGainsLinear: powerLawRealizationGains(
        BROWN_REALIZATION_BASIS_SLOPE_DB_PER_OCTAVE,
      ),
      realizationUltrasonicResidualGainLinear: powerLawResidualGain(
        BROWN_REALIZATION_BASIS_SLOPE_DB_PER_OCTAVE,
      ),
    },
    grey: {
      target: freezeTarget({
        schemaVersion: SPECTRAL_TARGET_SCHEMA_VERSION,
        id: 'grey',
        label: 'Grey (Practical)',
        targetDbByBand: greyTargetDb,
        expectedPsdSlopeDbPerOctave: null,
        provenance:
          'Grey Practical v1 is an original Greygen broad low/high emphasis heuristic. It is not ISO 226 data, not a medical equal-loudness model, and not a transcription of myNoise preset values.',
      }),
      realizationBandGainsLinear: Object.freeze(
        greyTargetDb.map((decibels) => decibelsToGain(decibels)),
      ),
      realizationUltrasonicResidualGainLinear: 1,
    },
  })

export const SPECTRAL_PRESET_IDS: readonly SpectralPresetId[] = Object.freeze([
  'white',
  'pink',
  'brown',
  'grey',
])

export function getSpectralTarget(id: SpectralPresetId): SpectralTarget {
  return PRESET_DEFINITIONS[id].target
}

function assertUserBandOffsets(offsetsDb: ArrayLike<number>): void {
  if (offsetsDb.length !== BAND_COUNT) {
    throw new RangeError(`userBandOffsetsDb must contain ${BAND_COUNT} values`)
  }

  for (let index = 0; index < BAND_COUNT; index += 1) {
    const value = offsetsDb[index]
    if (
      !Number.isFinite(value) ||
      value < USER_BAND_OFFSET_MIN_DB ||
      value > USER_BAND_OFFSET_MAX_DB
    ) {
      throw new RangeError(
        `userBandOffsetsDb[${index}] must be between ${USER_BAND_OFFSET_MIN_DB} and ${USER_BAND_OFFSET_MAX_DB} dB`,
      )
    }
  }
}

export function createSpectrumState(
  targetId: SpectralPresetId,
  userBandOffsetsDb: ArrayLike<number> = new Float64Array(BAND_COUNT),
): SpectrumState {
  assertUserBandOffsets(userBandOffsetsDb)
  return Object.freeze({
    targetId,
    userBandOffsetsDb: Object.freeze(Array.from(userBandOffsetsDb)),
  })
}

export function resolveSpectrumState(
  state: SpectrumState,
): FilterBankSpectralConfiguration {
  assertUserBandOffsets(state.userBandOffsetsDb)
  const definition = PRESET_DEFINITIONS[state.targetId]
  if (!definition) {
    throw new RangeError(`unknown spectral target: ${state.targetId}`)
  }

  const bandGainsLinear = new Float64Array(BAND_COUNT)
  for (let index = 0; index < BAND_COUNT; index += 1) {
    bandGainsLinear[index] =
      definition.realizationBandGainsLinear[index] *
      decibelsToGain(state.userBandOffsetsDb[index])
  }

  return {
    bandGainsLinear,
    ultrasonicResidualGainLinear:
      definition.realizationUltrasonicResidualGainLinear,
  }
}

export function applySpectrumStateToFilterBank(
  filterBank: TenBandFilterBank,
  state: SpectrumState,
): void {
  const configuration = resolveSpectrumState(state)
  filterBank.setBandGainsLinear(configuration.bandGainsLinear)
  filterBank.setUltrasonicResidualGainLinear(
    configuration.ultrasonicResidualGainLinear,
  )
}
