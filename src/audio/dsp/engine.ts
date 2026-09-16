import {
  ANIMATION_OUTPUT_SMOOTHING_SECONDS,
  type AnimationState,
  SpectralAnimation,
  createAnimationState,
} from './animation'
import { BAND_COUNT, TenBandFilterBank, type HighBandMode } from './filterBank'
import {
  CONTROL_SMOOTHING_TIME_SECONDS,
  type GainStageState,
  SAFETY_ATTACK_TIME_SECONDS,
  SAFETY_RELEASE_TIME_SECONDS,
  applyFinalGuard,
  computeSafetyPreGainLinear,
  createGainStageState,
  masterGainLinear,
  resolveGainTargets,
  safetyPreGainDb,
} from './gainSafety'
import { MeterAccumulator, type MeterSnapshot } from './meters'
import { decibelsToGain, gainToDecibels } from './numbers'
import { Xoshiro128StarStar } from './rng'
import { OnePoleSmoother } from './smoothing'
import {
  DEFAULT_STEREO_WIDTH,
  STEREO_WIDTH_SMOOTHING_TIME_SECONDS,
  type StereoWidthState,
  createStereoWidthState,
  stereoWidthToCorrelation,
  stereoWidthToMixAngle,
} from './stereo'
import {
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
  resolveSpectrumState,
} from './spectra'

export const DSP_ENGINE_VERSION = 1 as const
export const DEFAULT_ENGINE_SEED = 0x4752_4559
export const DEFAULT_ENGINE_PRESET: SpectralPresetId = 'grey'
export const SOURCE_NORMALIZATION_GAIN_LINEAR = 1

export interface GreygenDspEngineOptions {
  readonly sampleRate: number
  readonly seed?: number
  readonly spectrumState?: SpectrumState
  readonly gainStageState?: GainStageState
  readonly stereoWidthState?: StereoWidthState
  readonly animationState?: AnimationState
}

export interface GreygenDspResetOptions {
  readonly seed?: number
  readonly spectrumState?: SpectrumState
  readonly gainStageState?: GainStageState
  readonly stereoWidthState?: StereoWidthState
  readonly animationState?: AnimationState
}

export interface EngineTelemetry extends MeterSnapshot {
  readonly safetyPreGainLinear: number
  readonly safetyPreGainDb: number
  readonly safetyPreGainTargetLinear: number
  readonly safetyPreGainTargetDb: number
  readonly masterGainLinear: number
  readonly masterGainDb: number
  readonly guardInterventions: number
  readonly stereoWidth: number
  readonly stereoCorrelation: number
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

function canonicalStereoWidthState(state: StereoWidthState): StereoWidthState {
  return createStereoWidthState(state.width)
}

function canonicalAnimationState(state: AnimationState): AnimationState {
  return createAnimationState(
    state.mode,
    state.seed,
    state.depthDb,
    state.speed,
    state.energyPreserving,
  )
}

export class GreygenDspEngine {
  readonly sampleRate: number

  private readonly filterBankA: TenBandFilterBank
  private readonly filterBankB: TenBandFilterBank
  private readonly scratchBandsA = new Float64Array(BAND_COUNT)
  private readonly scratchBandsB = new Float64Array(BAND_COUNT)
  private readonly currentBandGains = new Float64Array(BAND_COUNT)
  private readonly animationTargetOffsetsDb = new Float64Array(BAND_COUNT)
  private readonly bandGainSmoothers: OnePoleSmoother[]
  private readonly animationBandSmoothers: OnePoleSmoother[]
  private readonly residualGainSmoother: OnePoleSmoother
  private readonly safetyPreGainSmoother: OnePoleSmoother
  private readonly masterGainSmoother: OnePoleSmoother
  private readonly stereoWidthSmoother: OnePoleSmoother
  private readonly meter = new MeterAccumulator()
  private readonly animation: SpectralAnimation
  private generatorA: Xoshiro128StarStar
  private generatorB: Xoshiro128StarStar
  private seedValue: number
  private spectrumStateValue: SpectrumState
  private gainStageStateValue: GainStageState
  private stereoWidthStateValue: StereoWidthState
  private animationStateValue: AnimationState
  private safetyPreGainTargetValue: number
  private guardInterventionsValue = 0

  constructor(options: GreygenDspEngineOptions) {
    this.sampleRate = options.sampleRate
    this.filterBankA = new TenBandFilterBank(options.sampleRate)
    this.filterBankB = new TenBandFilterBank(options.sampleRate)
    this.seedValue = options.seed ?? DEFAULT_ENGINE_SEED
    this.generatorA = new Xoshiro128StarStar(this.seedValue, 0)
    this.generatorB = new Xoshiro128StarStar(this.seedValue, 1)
    this.spectrumStateValue = options.spectrumState
      ? canonicalSpectrumState(options.spectrumState)
      : createSpectrumState(DEFAULT_ENGINE_PRESET)
    this.gainStageStateValue = options.gainStageState
      ? canonicalGainStageState(options.gainStageState)
      : createGainStageState()
    this.stereoWidthStateValue = options.stereoWidthState
      ? canonicalStereoWidthState(options.stereoWidthState)
      : createStereoWidthState(DEFAULT_STEREO_WIDTH)
    this.animationStateValue = options.animationState
      ? canonicalAnimationState(options.animationState)
      : createAnimationState()
    this.animation = new SpectralAnimation(
      this.sampleRate,
      this.animationStateValue,
    )

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
    this.animationBandSmoothers = Array.from(
      { length: BAND_COUNT },
      () =>
        new OnePoleSmoother(
          0,
          this.sampleRate,
          ANIMATION_OUTPUT_SMOOTHING_SECONDS,
        ),
    )
    this.residualGainSmoother = new OnePoleSmoother(
      targets.ultrasonicResidualGainLinear,
      this.sampleRate,
      CONTROL_SMOOTHING_TIME_SECONDS,
    )
    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(
      targets.estimatedShapedPeakLinear,
    )
    this.safetyPreGainSmoother = new OnePoleSmoother(
      this.safetyPreGainTargetValue,
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
    this.stereoWidthSmoother = new OnePoleSmoother(
      this.stereoWidthStateValue.width,
      this.sampleRate,
      STEREO_WIDTH_SMOOTHING_TIME_SECONDS,
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

  get stereoWidthState(): StereoWidthState {
    return this.stereoWidthStateValue
  }

  get animationState(): AnimationState {
    return this.animationStateValue
  }

  get animationSampleCursor(): number {
    return this.animation.sampleCursor
  }

  get targetId(): SpectralPresetId {
    return this.spectrumStateValue.targetId
  }

  get highBandMode(): HighBandMode {
    return this.filterBankA.highBandMode
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

  get appliedStereoWidth(): number {
    return this.stereoWidthSmoother.current
  }

  get targetStereoCorrelation(): number {
    return stereoWidthToCorrelation(this.stereoWidthStateValue.width)
  }

  setSeed(seed: number): void {
    const nextGeneratorA = new Xoshiro128StarStar(seed, 0)
    const nextGeneratorB = new Xoshiro128StarStar(seed, 1)
    this.seedValue = seed
    this.generatorA = nextGeneratorA
    this.generatorB = nextGeneratorB
  }

  setSpectrumState(state: SpectrumState): void {
    this.spectrumStateValue = canonicalSpectrumState(state)
    this.updateGainTargets()
  }

  setGainStageState(state: GainStageState): void {
    this.gainStageStateValue = canonicalGainStageState(state)
    this.updateGainTargets()
  }

  setStereoWidthState(state: StereoWidthState): void {
    this.stereoWidthStateValue = canonicalStereoWidthState(state)
    this.stereoWidthSmoother.setTarget(this.stereoWidthStateValue.width)
  }

  setAnimationState(state: AnimationState): void {
    this.animationStateValue = canonicalAnimationState(state)
    this.animation.setState(this.animationStateValue)
    this.updateGainTargets()
  }

  reset(options: GreygenDspResetOptions = {}): void {
    const nextSeed = options.seed ?? this.seedValue
    const nextGeneratorA = new Xoshiro128StarStar(nextSeed, 0)
    const nextGeneratorB = new Xoshiro128StarStar(nextSeed, 1)
    const nextSpectrum = options.spectrumState
      ? canonicalSpectrumState(options.spectrumState)
      : this.spectrumStateValue
    const nextGainStage = options.gainStageState
      ? canonicalGainStageState(options.gainStageState)
      : this.gainStageStateValue
    const nextStereoWidth = options.stereoWidthState
      ? canonicalStereoWidthState(options.stereoWidthState)
      : this.stereoWidthStateValue
    const nextAnimation = options.animationState
      ? canonicalAnimationState(options.animationState)
      : this.animationStateValue

    this.seedValue = nextSeed
    this.generatorA = nextGeneratorA
    this.generatorB = nextGeneratorB
    this.spectrumStateValue = nextSpectrum
    this.gainStageStateValue = nextGainStage
    this.stereoWidthStateValue = nextStereoWidth
    this.animationStateValue = nextAnimation
    this.filterBankA.reset()
    this.filterBankB.reset()
    this.animation.reset(nextAnimation)
    this.meter.reset()
    this.guardInterventionsValue = 0

    const targets = this.resolveTargets()
    for (let index = 0; index < BAND_COUNT; index += 1) {
      this.bandGainSmoothers[index].reset(targets.bandGainsLinear[index])
      this.animationBandSmoothers[index].reset(0)
    }
    this.residualGainSmoother.reset(targets.ultrasonicResidualGainLinear)
    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(
      targets.estimatedShapedPeakLinear,
    )
    this.safetyPreGainSmoother.reset(this.safetyPreGainTargetValue)
    this.safetyPreGainSmoother.setTimeConstantSeconds(
      SAFETY_RELEASE_TIME_SECONDS,
    )
    this.masterGainSmoother.reset(0)
    this.masterGainSmoother.setTarget(masterGainLinear(nextGainStage))
    this.stereoWidthSmoother.reset(nextStereoWidth.width)
  }

  renderMono(output: Float32Array): void {
    for (let frame = 0; frame < output.length; frame += 1) {
      this.prepareCurrentBandGains()
      const residualGain = this.residualGainSmoother.next()
      const shaped = this.nextShapedSample(
        this.generatorA,
        this.filterBankA,
        this.scratchBandsA,
        residualGain,
      )

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

  renderStereo(left: Float32Array, right: Float32Array): void {
    if (left.length !== right.length) {
      throw new RangeError(
        'left and right stereo buffers must have equal length',
      )
    }

    for (let frame = 0; frame < left.length; frame += 1) {
      this.prepareCurrentBandGains()
      const residualGain = this.residualGainSmoother.next()
      const shapedA = this.nextShapedSample(
        this.generatorA,
        this.filterBankA,
        this.scratchBandsA,
        residualGain,
      )
      const shapedB = this.nextShapedSample(
        this.generatorB,
        this.filterBankB,
        this.scratchBandsB,
        residualGain,
      )

      const width = this.stereoWidthSmoother.next()
      const angle = stereoWidthToMixAngle(width)
      const common = Math.cos(angle)
      const difference = Math.sin(angle)
      const mixedLeft = common * shapedA + difference * shapedB
      const mixedRight = common * shapedA - difference * shapedB

      const safetyGain = this.safetyPreGainSmoother.next()
      const masterGain = this.masterGainSmoother.next()
      const leftPreGuard = mixedLeft * safetyGain * masterGain
      const rightPreGuard = mixedRight * safetyGain * masterGain
      const guardedLeft = applyFinalGuard(leftPreGuard)
      const guardedRight = applyFinalGuard(rightPreGuard)
      if (guardedLeft !== leftPreGuard) {
        this.guardInterventionsValue += 1
      }
      if (guardedRight !== rightPreGuard) {
        this.guardInterventionsValue += 1
      }

      left[frame] = guardedLeft
      right[frame] = guardedRight
      this.meter.addStereoFrame(guardedLeft, guardedRight)
    }
  }

  consumeTelemetry(): EngineTelemetry {
    const meters = this.meter.consume()
    const safetyLinear = this.safetyPreGainSmoother.current
    const masterLinear = this.masterGainSmoother.current
    const stereoWidth = this.stereoWidthSmoother.current
    const result: EngineTelemetry = {
      ...meters,
      safetyPreGainLinear: safetyLinear,
      safetyPreGainDb: safetyPreGainDb(safetyLinear),
      safetyPreGainTargetLinear: this.safetyPreGainTargetValue,
      safetyPreGainTargetDb: safetyPreGainDb(this.safetyPreGainTargetValue),
      masterGainLinear: masterLinear,
      masterGainDb: gainToDecibels(masterLinear),
      guardInterventions: this.guardInterventionsValue,
      stereoWidth,
      stereoCorrelation: stereoWidthToCorrelation(stereoWidth),
    }
    this.guardInterventionsValue = 0
    return result
  }

  private prepareCurrentBandGains(): void {
    this.animation.nextOffsets(this.animationTargetOffsetsDb)
    for (let band = 0; band < BAND_COUNT; band += 1) {
      this.animationBandSmoothers[band].setTarget(
        this.animationTargetOffsetsDb[band],
      )
      const animationDb = this.animationBandSmoothers[band].next()
      this.currentBandGains[band] =
        this.bandGainSmoothers[band].next() * decibelsToGain(animationDb)
    }
  }

  private nextShapedSample(
    generator: Xoshiro128StarStar,
    filterBank: TenBandFilterBank,
    scratchBands: Float64Array,
    residualGain: number,
  ): number {
    const source = generator.nextBipolar() * SOURCE_NORMALIZATION_GAIN_LINEAR
    const residual = filterBank.processBandComponents(source, scratchBands)
    let shaped = residual * residualGain
    for (let band = 0; band < BAND_COUNT; band += 1) {
      shaped += scratchBands[band] * this.currentBandGains[band]
    }
    return shaped
  }

  private resolveTargets() {
    const spectral = resolveSpectrumState(this.spectrumStateValue)
    return resolveGainTargets(
      this.sampleRate,
      spectral,
      this.gainStageStateValue,
    )
  }

  private resolveAnimationAwareSafetyTarget(
    estimatedShapedPeakLinear: number,
  ): number {
    const animationDepthDb =
      this.animationStateValue.mode === 'off'
        ? 0
        : this.animationStateValue.depthDb
    return computeSafetyPreGainLinear(
      estimatedShapedPeakLinear * decibelsToGain(animationDepthDb),
    )
  }

  private updateGainTargets(): void {
    const targets = this.resolveTargets()
    for (let index = 0; index < BAND_COUNT; index += 1) {
      this.bandGainSmoothers[index].setTarget(targets.bandGainsLinear[index])
    }
    this.residualGainSmoother.setTarget(targets.ultrasonicResidualGainLinear)

    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(
      targets.estimatedShapedPeakLinear,
    )
    this.safetyPreGainSmoother.setTimeConstantSeconds(
      this.safetyPreGainTargetValue < this.safetyPreGainSmoother.current
        ? SAFETY_ATTACK_TIME_SECONDS
        : SAFETY_RELEASE_TIME_SECONDS,
    )
    this.safetyPreGainSmoother.setTarget(this.safetyPreGainTargetValue)
    this.masterGainSmoother.setTarget(
      masterGainLinear(this.gainStageStateValue),
    )
  }
}
