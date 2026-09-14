import { BAND_COUNT, TenBandFilterBank, type HighBandMode } from './filterBank'
import {
  CONTROL_SMOOTHING_TIME_SECONDS,
  type GainStageState,
  SAFETY_ATTACK_TIME_SECONDS,
  SAFETY_RELEASE_TIME_SECONDS,
  applyFinalGuard,
  createGainStageState,
  masterGainLinear,
  resolveGainTargets,
  safetyPreGainDb,
} from './gainSafety'
import { MeterAccumulator, type MeterSnapshot } from './meters'
import { gainToDecibels } from './numbers'
import { Xoshiro128StarStar } from './rng'
import { OnePoleSmoother } from './smoothing'
import {
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
  resolveSpectrumState,
} from './spectra'

export const DEFAULT_ENGINE_SEED = 0x4752_4559
export const DEFAULT_ENGINE_PRESET: SpectralPresetId = 'grey'
export const SOURCE_NORMALIZATION_GAIN_LINEAR = 1

export interface GreygenDspEngineOptions {
  readonly sampleRate: number
  readonly seed?: number
  readonly spectrumState?: SpectrumState
  readonly gainStageState?: GainStageState
}

export interface GreygenDspResetOptions {
  readonly seed?: number
  readonly spectrumState?: SpectrumState
  readonly gainStageState?: GainStageState
}

export interface EngineTelemetry extends MeterSnapshot {
  readonly safetyPreGainLinear: number
  readonly safetyPreGainDb: number
  readonly safetyPreGainTargetLinear: number
  readonly safetyPreGainTargetDb: number
  readonly masterGainLinear: number
  readonly masterGainDb: number
  readonly guardInterventions: number
}

function canonicalSpectrumState(state: SpectrumState): SpectrumState {
  return createSpectrumState(state.targetId, state.userBandOffsetsDb)
}

function canonicalGainStageState(state: GainStageState): GainStageState {
  return createGainStageState(
    state.masterGainDb,
    state.animationBandOffsetsDb,
    state.calibrationBandOffsetsDb,
  )
}

export class GreygenDspEngine {
  readonly sampleRate: number

  private readonly filterBank: TenBandFilterBank
  private readonly scratchBands = new Float64Array(BAND_COUNT)
  private readonly currentBandGains = new Float64Array(BAND_COUNT)
  private readonly bandGainSmoothers: OnePoleSmoother[]
  private readonly residualGainSmoother: OnePoleSmoother
  private readonly safetyPreGainSmoother: OnePoleSmoother
  private readonly masterGainSmoother: OnePoleSmoother
  private readonly meter = new MeterAccumulator()
  private generator: Xoshiro128StarStar
  private seedValue: number
  private spectrumStateValue: SpectrumState
  private gainStageStateValue: GainStageState
  private safetyPreGainTargetValue: number
  private guardInterventionsValue = 0

  constructor(options: GreygenDspEngineOptions) {
    this.sampleRate = options.sampleRate
    this.filterBank = new TenBandFilterBank(options.sampleRate)
    this.seedValue = options.seed ?? DEFAULT_ENGINE_SEED
    this.generator = new Xoshiro128StarStar(this.seedValue)
    this.spectrumStateValue = options.spectrumState
      ? canonicalSpectrumState(options.spectrumState)
      : createSpectrumState(DEFAULT_ENGINE_PRESET)
    this.gainStageStateValue = options.gainStageState
      ? canonicalGainStageState(options.gainStageState)
      : createGainStageState()

    const targets = this.resolveTargets()
    this.bandGainSmoothers = Array.from(
      { length: BAND_COUNT },
      (_, index) =>
        new OnePoleSmoother(
          targets.bandGainsLinear[index],
          this.sampleRate,
          CONTROL_SMOOTHING_TIME_SECONDS,
        ),
    )
    this.residualGainSmoother = new OnePoleSmoother(
      targets.ultrasonicResidualGainLinear,
      this.sampleRate,
      CONTROL_SMOOTHING_TIME_SECONDS,
    )
    this.safetyPreGainTargetValue = targets.safetyPreGainLinear
    this.safetyPreGainSmoother = new OnePoleSmoother(
      targets.safetyPreGainLinear,
      this.sampleRate,
      SAFETY_RELEASE_TIME_SECONDS,
    )
    this.masterGainSmoother = new OnePoleSmoother(
      0,
      this.sampleRate,
      CONTROL_SMOOTHING_TIME_SECONDS,
    )
    this.masterGainSmoother.setTarget(
      masterGainLinear(this.gainStageStateValue),
    )
  }

  get seed(): number {
    return this.seedValue
  }

  get spectrumState(): SpectrumState {
    return this.spectrumStateValue
  }

  get gainStageState(): GainStageState {
    return this.gainStageStateValue
  }

  get targetId(): SpectralPresetId {
    return this.spectrumStateValue.targetId
  }

  get highBandMode(): HighBandMode {
    return this.filterBank.highBandMode
  }

  get safetyPreGainTargetLinear(): number {
    return this.safetyPreGainTargetValue
  }

  get appliedSafetyPreGainLinear(): number {
    return this.safetyPreGainSmoother.current
  }

  get appliedMasterGainLinear(): number {
    return this.masterGainSmoother.current
  }

  setSeed(seed: number): void {
    const nextGenerator = new Xoshiro128StarStar(seed)
    this.seedValue = seed
    this.generator = nextGenerator
  }

  setSpectrumState(state: SpectrumState): void {
    this.spectrumStateValue = canonicalSpectrumState(state)
    this.updateGainTargets()
  }

  setGainStageState(state: GainStageState): void {
    this.gainStageStateValue = canonicalGainStageState(state)
    this.updateGainTargets()
  }

  reset(options: GreygenDspResetOptions = {}): void {
    const nextSeed = options.seed ?? this.seedValue
    const nextGenerator = new Xoshiro128StarStar(nextSeed)
    const nextSpectrum = options.spectrumState
      ? canonicalSpectrumState(options.spectrumState)
      : this.spectrumStateValue
    const nextGainStage = options.gainStageState
      ? canonicalGainStageState(options.gainStageState)
      : this.gainStageStateValue

    this.seedValue = nextSeed
    this.generator = nextGenerator
    this.spectrumStateValue = nextSpectrum
    this.gainStageStateValue = nextGainStage
    this.filterBank.reset()
    this.meter.reset()
    this.guardInterventionsValue = 0

    const targets = this.resolveTargets()
    for (let index = 0; index < BAND_COUNT; index += 1) {
      this.bandGainSmoothers[index].reset(targets.bandGainsLinear[index])
    }
    this.residualGainSmoother.reset(targets.ultrasonicResidualGainLinear)
    this.safetyPreGainTargetValue = targets.safetyPreGainLinear
    this.safetyPreGainSmoother.reset(targets.safetyPreGainLinear)
    this.safetyPreGainSmoother.setTimeConstantSeconds(
      SAFETY_RELEASE_TIME_SECONDS,
    )
    this.masterGainSmoother.reset(0)
    this.masterGainSmoother.setTarget(masterGainLinear(nextGainStage))
  }

  renderMono(output: Float32Array): void {
    for (let frame = 0; frame < output.length; frame += 1) {
      for (let band = 0; band < BAND_COUNT; band += 1) {
        this.currentBandGains[band] = this.bandGainSmoothers[band].next()
      }
      const residualGain = this.residualGainSmoother.next()
      const source =
        this.generator.nextBipolar() * SOURCE_NORMALIZATION_GAIN_LINEAR
      const residual = this.filterBank.processBandComponents(
        source,
        this.scratchBands,
      )

      let shaped = residual * residualGain
      for (let band = 0; band < BAND_COUNT; band += 1) {
        shaped += this.scratchBands[band] * this.currentBandGains[band]
      }

      const safetyGain = this.safetyPreGainSmoother.next()
      const masterGain = this.masterGainSmoother.next()
      const preGuard = shaped * safetyGain * masterGain
      const guarded = applyFinalGuard(preGuard)
      if (guarded !== preGuard) {
        this.guardInterventionsValue += 1
      }

      output[frame] = guarded
      this.meter.addSample(guarded)
    }
  }

  consumeTelemetry(): EngineTelemetry {
    const meters = this.meter.consume()
    const safetyLinear = this.safetyPreGainSmoother.current
    const masterLinear = this.masterGainSmoother.current
    const result: EngineTelemetry = {
      ...meters,
      safetyPreGainLinear: safetyLinear,
      safetyPreGainDb: safetyPreGainDb(safetyLinear),
      safetyPreGainTargetLinear: this.safetyPreGainTargetValue,
      safetyPreGainTargetDb: safetyPreGainDb(this.safetyPreGainTargetValue),
      masterGainLinear: masterLinear,
      masterGainDb: gainToDecibels(masterLinear),
      guardInterventions: this.guardInterventionsValue,
    }
    this.guardInterventionsValue = 0
    return result
  }

  private resolveTargets() {
    const spectral = resolveSpectrumState(this.spectrumStateValue)
    return resolveGainTargets(
      this.sampleRate,
      spectral,
      this.gainStageStateValue,
    )
  }

  private updateGainTargets(): void {
    const targets = this.resolveTargets()
    for (let index = 0; index < BAND_COUNT; index += 1) {
      this.bandGainSmoothers[index].setTarget(targets.bandGainsLinear[index])
    }
    this.residualGainSmoother.setTarget(targets.ultrasonicResidualGainLinear)

    this.safetyPreGainTargetValue = targets.safetyPreGainLinear
    this.safetyPreGainSmoother.setTimeConstantSeconds(
      targets.safetyPreGainLinear < this.safetyPreGainSmoother.current
        ? SAFETY_ATTACK_TIME_SECONDS
        : SAFETY_RELEASE_TIME_SECONDS,
    )
    this.safetyPreGainSmoother.setTarget(targets.safetyPreGainLinear)
    this.masterGainSmoother.setTarget(
      masterGainLinear(this.gainStageStateValue),
    )
  }
}
