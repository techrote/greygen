import { BAND_COUNT } from './filterBank'
import { assertFiniteNumber } from './numbers'
import { Xoshiro128StarStar } from './rng'
import { OnePoleSmoother } from './smoothing'

export const ANIMATION_STATE_SCHEMA_VERSION = 1 as const
export const ANIMATION_MODES = [
  'off',
  'drift',
  'breathe',
  'wander',
  'orbit',
] as const
export type AnimationMode = (typeof ANIMATION_MODES)[number]

export const DEFAULT_ANIMATION_MODE: AnimationMode = 'off'
export const DEFAULT_ANIMATION_SEED = 0x414e_494d
export const DEFAULT_ANIMATION_DEPTH_DB = 4
export const DEFAULT_ANIMATION_SPEED = 1
export const DEFAULT_ANIMATION_ENERGY_PRESERVING = true
export const ANIMATION_DEPTH_MIN_DB = 0
export const ANIMATION_DEPTH_MAX_DB = 12
export const ANIMATION_SPEED_MIN = 0.25
export const ANIMATION_SPEED_MAX = 4
export const ANIMATION_PARAMETER_SMOOTHING_SECONDS = 0.12
export const ANIMATION_OUTPUT_SMOOTHING_SECONDS = 0.08

const TWO_PI = Math.PI * 2
const RAW_AMPLITUDE_LIMIT = 0.5

export interface AnimationState {
  readonly schemaVersion: typeof ANIMATION_STATE_SCHEMA_VERSION
  readonly mode: AnimationMode
  readonly seed: number
  readonly depthDb: number
  readonly speed: number
  readonly energyPreserving: boolean
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff
}

function validateMode(mode: AnimationMode): AnimationMode {
  if (!ANIMATION_MODES.includes(mode)) {
    throw new RangeError('animation mode is unsupported')
  }
  return mode
}

function validateBounded(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const finite = assertFiniteNumber(value, label)
  if (finite < minimum || finite > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}`)
  }
  return finite
}

export function createAnimationState(
  mode: AnimationMode = DEFAULT_ANIMATION_MODE,
  seed = DEFAULT_ANIMATION_SEED,
  depthDb = DEFAULT_ANIMATION_DEPTH_DB,
  speed = DEFAULT_ANIMATION_SPEED,
  energyPreserving = DEFAULT_ANIMATION_ENERGY_PRESERVING,
): AnimationState {
  if (!isUint32(seed)) {
    throw new RangeError('animation seed must be an unsigned 32-bit integer')
  }
  if (typeof energyPreserving !== 'boolean') {
    throw new TypeError('energyPreserving must be boolean')
  }
  return Object.freeze({
    schemaVersion: ANIMATION_STATE_SCHEMA_VERSION,
    mode: validateMode(mode),
    seed,
    depthDb: validateBounded(
      depthDb,
      ANIMATION_DEPTH_MIN_DB,
      ANIMATION_DEPTH_MAX_DB,
      'animation depthDb',
    ),
    speed: validateBounded(
      speed,
      ANIMATION_SPEED_MIN,
      ANIMATION_SPEED_MAX,
      'animation speed',
    ),
    energyPreserving,
  })
}

export function isAnimationMode(value: unknown): value is AnimationMode {
  return (
    typeof value === 'string' &&
    ANIMATION_MODES.includes(value as AnimationMode)
  )
}

export function animationModeLabel(mode: AnimationMode): string {
  switch (mode) {
    case 'off':
      return 'Off'
    case 'drift':
      return 'Drift'
    case 'breathe':
      return 'Breathe'
    case 'wander':
      return 'Wander'
    case 'orbit':
      return 'Orbit'
  }
}

function modeBaseFrequencyHz(mode: AnimationMode): number {
  switch (mode) {
    case 'off':
      return 0
    case 'drift':
      return 0.018
    case 'breathe':
      return 0.04
    case 'wander':
      return 0.009
    case 'orbit':
      return 0.032
  }
}

function powerNormalizationDb(offsetsDb: Float64Array): number {
  let sumPower = 0
  for (let band = 0; band < BAND_COUNT; band += 1) {
    sumPower += 10 ** (offsetsDb[band] / 10)
  }
  return 10 * Math.log10(sumPower / BAND_COUNT)
}

export class SpectralAnimation {
  readonly sampleRate: number

  private stateValue: AnimationState
  private readonly depthSmoother: OnePoleSmoother
  private readonly speedSmoother: OnePoleSmoother
  private readonly phases = new Float64Array(BAND_COUNT)
  private readonly secondaryPhases = new Float64Array(BAND_COUNT)
  private readonly frequencyMultipliers = new Float64Array(BAND_COUNT)
  private phase = 0
  private sampleCursorValue = 0

  constructor(sampleRate: number, state: AnimationState = createAnimationState()) {
    if (!(sampleRate > 0) || !Number.isFinite(sampleRate)) {
      throw new RangeError('sampleRate must be finite and positive')
    }
    this.sampleRate = sampleRate
    this.stateValue = createAnimationState(
      state.mode,
      state.seed,
      state.depthDb,
      state.speed,
      state.energyPreserving,
    )
    this.depthSmoother = new OnePoleSmoother(
      this.stateValue.mode === 'off' ? 0 : this.stateValue.depthDb,
      sampleRate,
      ANIMATION_PARAMETER_SMOOTHING_SECONDS,
    )
    this.speedSmoother = new OnePoleSmoother(
      this.stateValue.speed,
      sampleRate,
      ANIMATION_PARAMETER_SMOOTHING_SECONDS,
    )
    this.reseed(this.stateValue.seed)
  }

  get state(): AnimationState {
    return this.stateValue
  }

  get sampleCursor(): number {
    return this.sampleCursorValue
  }

  get appliedDepthDb(): number {
    return this.depthSmoother.current
  }

  get appliedSpeed(): number {
    return this.speedSmoother.current
  }

  setState(state: AnimationState): void {
    const next = createAnimationState(
      state.mode,
      state.seed,
      state.depthDb,
      state.speed,
      state.energyPreserving,
    )
    if (next.seed !== this.stateValue.seed) {
      this.reseed(next.seed)
    }
    this.stateValue = next
    this.depthSmoother.setTarget(next.mode === 'off' ? 0 : next.depthDb)
    this.speedSmoother.setTarget(next.speed)
  }

  reset(state: AnimationState = this.stateValue): void {
    this.stateValue = createAnimationState(
      state.mode,
      state.seed,
      state.depthDb,
      state.speed,
      state.energyPreserving,
    )
    this.phase = 0
    this.sampleCursorValue = 0
    this.reseed(this.stateValue.seed)
    this.depthSmoother.reset(
      this.stateValue.mode === 'off' ? 0 : this.stateValue.depthDb,
    )
    this.speedSmoother.reset(this.stateValue.speed)
  }

  nextOffsets(outputDb: Float64Array): void {
    if (outputDb.length !== BAND_COUNT) {
      throw new RangeError(`animation output must contain ${BAND_COUNT} bands`)
    }

    const depthDb = this.depthSmoother.next()
    const speed = this.speedSmoother.next()
    const mode = this.stateValue.mode
    const baseHz = modeBaseFrequencyHz(mode)
    this.phase += (TWO_PI * baseHz * speed) / this.sampleRate
    if (this.phase >= TWO_PI) {
      this.phase -= TWO_PI
    }

    if (mode === 'off' || depthDb === 0) {
      outputDb.fill(0)
      this.sampleCursorValue += 1
      return
    }

    for (let band = 0; band < BAND_COUNT; band += 1) {
      const position = band / Math.max(1, BAND_COUNT - 1)
      let raw = 0
      switch (mode) {
        case 'drift':
          raw =
            0.31 *
              Math.sin(
                this.phase * this.frequencyMultipliers[band] +
                  this.phases[band],
              ) +
            0.16 *
              Math.sin(
                this.phase * 0.43 * this.frequencyMultipliers[band] +
                  this.secondaryPhases[band],
              )
          break
        case 'breathe':
          raw =
            0.34 * Math.sin(this.phase + (position - 0.5) * 0.9) +
            0.11 * Math.sin(this.phase * 0.5 + position * Math.PI)
          break
        case 'wander':
          raw =
            0.24 *
              Math.sin(
                this.phase * 0.73 * this.frequencyMultipliers[band] +
                  this.phases[band],
              ) +
            0.17 *
              Math.sin(
                this.phase * 1.37 + this.secondaryPhases[band] * 0.7,
              ) +
            0.08 * Math.sin(this.phase * 0.19 + band * 0.61)
          break
        case 'orbit':
          raw = 0.48 * Math.sin(this.phase - position * TWO_PI)
          break
        case 'off':
          raw = 0
      }
      outputDb[band] =
        Math.max(-RAW_AMPLITUDE_LIMIT, Math.min(RAW_AMPLITUDE_LIMIT, raw)) *
        depthDb
    }

    if (this.stateValue.energyPreserving) {
      const normalizationDb = powerNormalizationDb(outputDb)
      for (let band = 0; band < BAND_COUNT; band += 1) {
        outputDb[band] -= normalizationDb
      }
    }

    for (let band = 0; band < BAND_COUNT; band += 1) {
      outputDb[band] = Math.max(-depthDb, Math.min(depthDb, outputDb[band]))
    }
    this.sampleCursorValue += 1
  }

  private reseed(seed: number): void {
    const generator = new Xoshiro128StarStar(seed, 0x10)
    for (let band = 0; band < BAND_COUNT; band += 1) {
      this.phases[band] = generator.nextUnitFloat() * TWO_PI
      this.secondaryPhases[band] = generator.nextUnitFloat() * TWO_PI
      this.frequencyMultipliers[band] = 0.7 + generator.nextUnitFloat() * 0.6
    }
  }
}
