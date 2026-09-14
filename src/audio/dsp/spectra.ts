import {
  BAND_COUNT,
  HIGH_BAND_UPPER_CROSSOVER_HZ,
  NOMINAL_BAND_CENTERS_HZ,
  TenBandFilterBank,
} from './filterBank'
import { decibelsToGain } from './numbers'

export const SPECTRAL_TARGET_SCHEMA_VERSION = 1 as const
export const SPECTRAL_REALIZATION_VERSION = 1 as const
export const WHITE_PSD_SLOPE_DB_PER_OCTAVE = 0
export const PINK_PSD_SLOPE_DB_PER_OCTAVE = -3.0103
export const BROWN_PSD_SLOPE_DB_PER_OCTAVE = -6.0206
export const PRESET_PSD_FIT_MINIMUM_HZ = 125
export const PRESET_PSD_FIT_MAXIMUM_HZ = 8000
export const USER_BAND_OFFSET_MIN_DB = -24
export const USER_BAND_OFFSET_MAX_DB = 24

export type SpectralPresetId = 'white' | 'pink' | 'brown' | 'grey'

export interface SpectralTarget {
  readonly schemaVersion: typeof SPECTRAL_TARGET_SCHEMA_VERSION
  readonly revision: number
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
  readonly realizationVersion: typeof SPECTRAL_REALIZATION_VERSION
  readonly bandGainsLinear: Float64Array
  readonly ultrasonicResidualGainLinear: number
}

interface PresetDefinition {
  readonly target: SpectralTarget
  readonly realizationBandGainsLinear: readonly number[]
  readonly realizationUltrasonicResidualGainLinear: number
}

const LOWEST_CENTER_HZ = NOMINAL_BAND_CENTERS_HZ[0]

// The complementary first-order bank's components overlap substantially. A
// mathematical target slope therefore cannot be copied directly into component
// gains. These implementation tilts were selected by deterministic response /
// Welch characterization over PRESET_PSD_FIT_MINIMUM_HZ..MAXIMUM_HZ.
//
// Pink needs a slightly steeper component tilt than its requested PSD slope to
// compensate for overlap. Brown is deliberately much steeper: suppressing the
// upper components lets the bounded first low-shelf tail provide the desired
// ~-6 dB/octave interior PSD without a free-running integrator or DC walk.
// -20 dB/octave also keeps the top-band request above the global -240 dB numeric
// conversion floor (9 octaves * -20 = -180 dB).
const PINK_COMPONENT_TILT_DB_PER_OCTAVE = -3.85
const BROWN_COMPONENT_TILT_DB_PER_OCTAVE = -20

function powerLawTargetDb(slopeDbPerOctave: number): readonly number[] {
  return Object.freeze(
    NOMINAL_BAND_CENTERS_HZ.map(
      (frequencyHz) =>
        slopeDbPerOctave * Math.log2(frequencyHz / LOWEST_CENTER_HZ),
    ),
  )
}

function componentTiltGains(tiltDbPerOctave: number): readonly number[] {
  return Object.freeze(
    NOMINAL_BAND_CENTERS_HZ.map((frequencyHz) =>
      decibelsToGain(
        tiltDbPerOctave * Math.log2(frequencyHz / LOWEST_CENTER_HZ),
      ),
    ),
  )
}

function componentTiltResidualGain(tiltDbPerOctave: number): number {
  return decibelsToGain(
    tiltDbPerOctave *
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
        revision: 1,
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
        revision: 1,
        id: 'pink',
        label: 'Pink',
        targetDbByBand: pinkTargetDb,
        expectedPsdSlopeDbPerOctave: PINK_PSD_SLOPE_DB_PER_OCTAVE,
        provenance:
          'Mathematical pink-noise target: -3.0103 dB/octave PSD. Filter-component realization is independently characterized against rendered PSD.',
      }),
      realizationBandGainsLinear: componentTiltGains(
        PINK_COMPONENT_TILT_DB_PER_OCTAVE,
      ),
      realizationUltrasonicResidualGainLinear: componentTiltResidualGain(
        PINK_COMPONENT_TILT_DB_PER_OCTAVE,
      ),
    },
    brown: {
      target: freezeTarget({
        schemaVersion: SPECTRAL_TARGET_SCHEMA_VERSION,
        revision: 1,
        id: 'brown',
        label: 'Brown / Red',
        targetDbByBand: brownTargetDb,
        expectedPsdSlopeDbPerOctave: BROWN_PSD_SLOPE_DB_PER_OCTAVE,
        provenance:
          'Mathematical brown/red target: -6.0206 dB/octave PSD above the bounded low-frequency corner. Greygen does not use a free-running integrator.',
      }),
      realizationBandGainsLinear: componentTiltGains(
        BROWN_COMPONENT_TILT_DB_PER_OCTAVE,
      ),
      realizationUltrasonicResidualGainLinear: componentTiltResidualGain(
        BROWN_COMPONENT_TILT_DB_PER_OCTAVE,
      ),
    },
    grey: {
      target: freezeTarget({
        schemaVersion: SPECTRAL_TARGET_SCHEMA_VERSION,
        revision: 1,
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

function getPresetDefinition(id: SpectralPresetId): PresetDefinition {
  const definition = PRESET_DEFINITIONS[id]
  if (!definition) {
    throw new RangeError(`unknown spectral target: ${id}`)
  }
  return definition
}

export function getSpectralTarget(id: SpectralPresetId): SpectralTarget {
  return getPresetDefinition(id).target
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
  getPresetDefinition(targetId)
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
  const definition = getPresetDefinition(state.targetId)

  const bandGainsLinear = new Float64Array(BAND_COUNT)
  for (let index = 0; index < BAND_COUNT; index += 1) {
    bandGainsLinear[index] =
      definition.realizationBandGainsLinear[index] *
      decibelsToGain(state.userBandOffsetsDb[index])
  }

  return {
    realizationVersion: SPECTRAL_REALIZATION_VERSION,
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
