import {
  ANIMATION_OUTPUT_SMOOTHING_SECONDS,
  type AnimationState,
  SpectralAnimation,
  createAnimationState,
} from './animation'
import {
  type ChannelCalibrationState,
  channelCalibrationGainsLinear,
  createChannelCalibrationState,
} from './channelCalibration'
import {
  CALIBRATION_STIMULUS_TRANSITION_SECONDS,
  type CalibrationStimulusState,
  calibrationStimulusChannelTargets,
  calibrationStimulusGainLinear,
  calibrationStimulusWetTarget,
  createCalibrationStimulusState,
} from './calibrationStimulus'
import { BAND_COUNT, TenBandFilterBank, type HighBandMode } from './filterBank'
import {
  CONTROL_SMOOTHING_TIME_SECONDS,
  type GainStageState,
  SAFETY_ATTACK_TIME_SECONDS,
  SAFETY_RELEASE_TIME_SECONDS,
  applyFinalGuard,
  computeSafetyPreGainLinear,
  createGainStageState,
  estimateFilterBankPeakGain,
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
  readonly channelCalibrationState?: ChannelCalibrationState
  readonly stereoWidthState?: StereoWidthState
  readonly animationState?: AnimationState
}

export interface GreygenDspResetOptions {
  readonly seed?: number
  readonly spectrumState?: SpectrumState
  readonly gainStageState?: GainStageState
  readonly channelCalibrationState?: ChannelCalibrationState
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

function canonicalCalibrationStimulusState(
  state: CalibrationStimulusState,
): CalibrationStimulusState {
  return createCalibrationStimulusState(
    state.mode,
    state.bandIndex,
    state.levelOffsetDb,
    state.channel,
  )
}

function canonicalChannelCalibrationState(
  state: ChannelCalibrationState,
): ChannelCalibrationState {
  return createChannelCalibrationState(
    state.leftBandOffsetsDb,
    state.rightBandOffsetsDb,
  )
}

export class GreygenDspEngine {
  readonly sampleRate: number

  private readonly filterBankA: TenBandFilterBank
  private readonly filterBankB: TenBandFilterBank
  private readonly scratchBandsA = new Float64Array(BAND_COUNT)
  private readonly scratchBandsB = new Float64Array(BAND_COUNT)
  private readonly currentBandGains = new Float64Array(BAND_COUNT)
  private readonly currentCalibrationLeftGains = new Float64Array(BAND_COUNT)
  private readonly currentCalibrationRightGains = new Float64Array(BAND_COUNT)
  private readonly currentCalibrationStimulusBandGains = new Float64Array(
    BAND_COUNT,
  )
  private readonly animationTargetOffsetsDb = new Float64Array(BAND_COUNT)
  private readonly bandGainSmoothers: OnePoleSmoother[]
  private readonly animationBandSmoothers: OnePoleSmoother[]
  private readonly residualGainSmoother: OnePoleSmoother
  private readonly safetyPreGainSmoother: OnePoleSmoother
  private readonly masterGainSmoother: OnePoleSmoother
  private readonly stereoWidthSmoother: OnePoleSmoother
  private readonly calibrationLeftBandSmoothers: OnePoleSmoother[]
  private readonly calibrationRightBandSmoothers: OnePoleSmoother[]
  private readonly calibrationStimulusBandSmoothers: OnePoleSmoother[]
  private readonly calibrationStimulusWetSmoother: OnePoleSmoother
  private readonly calibrationStimulusLeftMaskSmoother: OnePoleSmoother
  private readonly calibrationStimulusRightMaskSmoother: OnePoleSmoother
  private readonly meter = new MeterAccumulator()
  private readonly animation: SpectralAnimation
  private generatorA: Xoshiro128StarStar
  private generatorB: Xoshiro128StarStar
  private seedValue: number
  private spectrumStateValue: SpectrumState
  private gainStageStateValue: GainStageState
  private channelCalibrationStateValue: ChannelCalibrationState
  private stereoWidthStateValue: StereoWidthState
  private animationStateValue: AnimationState
  private calibrationStimulusStateValue: CalibrationStimulusState
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
    this.channelCalibrationStateValue = options.channelCalibrationState
      ? canonicalChannelCalibrationState(options.channelCalibrationState)
      : createChannelCalibrationState(
          this.gainStageStateValue.calibrationBandOffsetsDb,
        )
    this.stereoWidthStateValue = options.stereoWidthState
      ? canonicalStereoWidthState(options.stereoWidthState)
      : createStereoWidthState(DEFAULT_STEREO_WIDTH)
    this.animationStateValue = options.animationState
      ? canonicalAnimationState(options.animationState)
      : createAnimationState()
    this.calibrationStimulusStateValue = createCalibrationStimulusState()
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
      targets.bandGainsLinear,
      targets.ultrasonicResidualGainLinear,
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
    const initialLeftCalibration = channelCalibrationGainsLinear(
      this.channelCalibrationStateValue.leftBandOffsetsDb,
    )
    const initialRightCalibration = channelCalibrationGainsLinear(
      this.channelCalibrationStateValue.rightBandOffsetsDb,
    )
    this.calibrationLeftBandSmoothers = Array.from(
      { length: BAND_COUNT },
      (_, index) =>
        new OnePoleSmoother(
          initialLeftCalibration[index],
          this.sampleRate,
          CONTROL_SMOOTHING_TIME_SECONDS,
        ),
    )
    this.calibrationRightBandSmoothers = Array.from(
      { length: BAND_COUNT },
      (_, index) =>
        new OnePoleSmoother(
          initialRightCalibration[index],
          this.sampleRate,
          CONTROL_SMOOTHING_TIME_SECONDS,
        ),
    )
    this.calibrationStimulusBandSmoothers = Array.from(
      { length: BAND_COUNT },
      () =>
        new OnePoleSmoother(
          0,
          this.sampleRate,
          CALIBRATION_STIMULUS_TRANSITION_SECONDS,
        ),
    )
    this.calibrationStimulusWetSmoother = new OnePoleSmoother(
      0,
      this.sampleRate,
      CALIBRATION_STIMULUS_TRANSITION_SECONDS,
    )
    this.calibrationStimulusLeftMaskSmoother = new OnePoleSmoother(
      0,
      this.sampleRate,
      CALIBRATION_STIMULUS_TRANSITION_SECONDS,
    )
    this.calibrationStimulusRightMaskSmoother = new OnePoleSmoother(
      0,
      this.sampleRate,
      CALIBRATION_STIMULUS_TRANSITION_SECONDS,
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

  get channelCalibrationState(): ChannelCalibrationState {
    return this.channelCalibrationStateValue
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

  get calibrationStimulusState(): CalibrationStimulusState {
    return this.calibrationStimulusStateValue
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
    const next = canonicalGainStageState(state)
    const calibrationChanged = next.calibrationBandOffsetsDb.some(
      (value, index) =>
        value !== this.gainStageStateValue.calibrationBandOffsetsDb[index],
    )
    this.gainStageStateValue = next
    if (calibrationChanged) {
      this.channelCalibrationStateValue = createChannelCalibrationState(
        next.calibrationBandOffsetsDb,
      )
      this.updateChannelCalibrationTargets()
    }
    this.updateGainTargets()
  }

  setChannelCalibrationState(state: ChannelCalibrationState): void {
    this.channelCalibrationStateValue = canonicalChannelCalibrationState(state)
    this.updateChannelCalibrationTargets()
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

  setCalibrationStimulusState(state: CalibrationStimulusState): void {
    this.calibrationStimulusStateValue =
      canonicalCalibrationStimulusState(state)
    this.updateCalibrationStimulusTargets()
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
    const nextChannelCalibration = options.channelCalibrationState
      ? canonicalChannelCalibrationState(options.channelCalibrationState)
      : options.gainStageState
        ? createChannelCalibrationState(nextGainStage.calibrationBandOffsetsDb)
        : this.channelCalibrationStateValue
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
    this.channelCalibrationStateValue = nextChannelCalibration
    this.stereoWidthStateValue = nextStereoWidth
    this.animationStateValue = nextAnimation
    this.calibrationStimulusStateValue = createCalibrationStimulusState()
    this.filterBankA.reset()
    this.filterBankB.reset()
    this.animation.reset(nextAnimation)
    this.meter.reset()
    this.guardInterventionsValue = 0

    const targets = this.resolveTargets()
    const leftCalibration = channelCalibrationGainsLinear(
      nextChannelCalibration.leftBandOffsetsDb,
    )
    const rightCalibration = channelCalibrationGainsLinear(
      nextChannelCalibration.rightBandOffsetsDb,
    )
    for (let index = 0; index < BAND_COUNT; index += 1) {
      this.bandGainSmoothers[index].reset(targets.bandGainsLinear[index])
      this.animationBandSmoothers[index].reset(0)
      this.calibrationLeftBandSmoothers[index].reset(leftCalibration[index])
      this.calibrationRightBandSmoothers[index].reset(rightCalibration[index])
    }
    this.residualGainSmoother.reset(targets.ultrasonicResidualGainLinear)
    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(
      targets.bandGainsLinear,
      targets.ultrasonicResidualGainLinear,
    )
    this.safetyPreGainSmoother.reset(this.safetyPreGainTargetValue)
    this.safetyPreGainSmoother.setTimeConstantSeconds(
      SAFETY_RELEASE_TIME_SECONDS,
    )
    this.masterGainSmoother.reset(0)
    this.masterGainSmoother.setTarget(masterGainLinear(nextGainStage))
    this.stereoWidthSmoother.reset(nextStereoWidth.width)
    this.currentCalibrationStimulusBandGains.fill(0)
    for (const smoother of this.calibrationStimulusBandSmoothers) {
      smoother.reset(0)
    }
    this.calibrationStimulusWetSmoother.reset(0)
    this.calibrationStimulusLeftMaskSmoother.reset(0)
    this.calibrationStimulusRightMaskSmoother.reset(0)
  }

  renderMono(output: Float32Array): void {
    for (let frame = 0; frame < output.length; frame += 1) {
      this.prepareCurrentBandGains()
      this.prepareCurrentChannelCalibrationGains()
      const residualGain = this.residualGainSmoother.next()
      const residual = this.nextBandComponents(
        this.generatorA,
        this.filterBankA,
        this.scratchBandsA,
      )
      let shaped = residual * residualGain
      for (let band = 0; band < BAND_COUNT; band += 1) {
        shaped +=
          this.scratchBandsA[band] *
          this.currentBandGains[band] *
          this.currentCalibrationLeftGains[band]
      }
      this.prepareCalibrationStimulusBandGains()
      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)
      const stimulusWet = this.calibrationStimulusWetSmoother.next()
      const stimulusMask = this.calibrationStimulusLeftMaskSmoother.next()
      const requested =
        shaped * (1 - stimulusWet) + stimulus * stimulusWet * stimulusMask

      const safetyGain = this.safetyPreGainSmoother.next()
      const masterGain = this.masterGainSmoother.next()
      const preGuard = requested * safetyGain * masterGain
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
      this.prepareCurrentChannelCalibrationGains()
      const residualGain = this.residualGainSmoother.next()
      const residualA = this.nextBandComponents(
        this.generatorA,
        this.filterBankA,
        this.scratchBandsA,
      )
      const residualB = this.nextBandComponents(
        this.generatorB,
        this.filterBankB,
        this.scratchBandsB,
      )

      const width = this.stereoWidthSmoother.next()
      const angle = stereoWidthToMixAngle(width)
      const common = Math.cos(angle)
      const difference = Math.sin(angle)
      let mixedLeft =
        (common * residualA + difference * residualB) * residualGain
      let mixedRight =
        (common * residualA - difference * residualB) * residualGain
      for (let band = 0; band < BAND_COUNT; band += 1) {
        const baseGain = this.currentBandGains[band]
        mixedLeft +=
          (common * this.scratchBandsA[band] +
            difference * this.scratchBandsB[band]) *
          baseGain *
          this.currentCalibrationLeftGains[band]
        mixedRight +=
          (common * this.scratchBandsA[band] -
            difference * this.scratchBandsB[band]) *
          baseGain *
          this.currentCalibrationRightGains[band]
      }
      this.prepareCalibrationStimulusBandGains()
      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)
      const stimulusWet = this.calibrationStimulusWetSmoother.next()
      const leftMask = this.calibrationStimulusLeftMaskSmoother.next()
      const rightMask = this.calibrationStimulusRightMaskSmoother.next()
      const requestedLeft =
        mixedLeft * (1 - stimulusWet) + stimulus * stimulusWet * leftMask
      const requestedRight =
        mixedRight * (1 - stimulusWet) + stimulus * stimulusWet * rightMask

      const safetyGain = this.safetyPreGainSmoother.next()
      const masterGain = this.masterGainSmoother.next()
      const leftPreGuard = requestedLeft * safetyGain * masterGain
      const rightPreGuard = requestedRight * safetyGain * masterGain
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

  private prepareCurrentChannelCalibrationGains(): void {
    for (let band = 0; band < BAND_COUNT; band += 1) {
      this.currentCalibrationLeftGains[band] =
        this.calibrationLeftBandSmoothers[band].next()
      this.currentCalibrationRightGains[band] =
        this.calibrationRightBandSmoothers[band].next()
    }
  }

  private prepareCalibrationStimulusBandGains(): void {
    for (let band = 0; band < BAND_COUNT; band += 1) {
      this.currentCalibrationStimulusBandGains[band] =
        this.calibrationStimulusBandSmoothers[band].next()
    }
  }

  private currentCalibrationStimulusSample(scratchBands: Float64Array): number {
    let stimulus = 0
    for (let band = 0; band < BAND_COUNT; band += 1) {
      stimulus +=
        scratchBands[band] * this.currentCalibrationStimulusBandGains[band]
    }
    return stimulus
  }

  private nextBandComponents(
    generator: Xoshiro128StarStar,
    filterBank: TenBandFilterBank,
    scratchBands: Float64Array,
  ): number {
    const source = generator.nextBipolar() * SOURCE_NORMALIZATION_GAIN_LINEAR
    return filterBank.processBandComponents(source, scratchBands)
  }

  private resolveTargets() {
    const spectral = resolveSpectrumState(this.spectrumStateValue)
    return resolveGainTargets(
      this.sampleRate,
      spectral,
      createGainStageState(
        this.gainStageStateValue.masterGainDb,
        this.gainStageStateValue.animationBandOffsetsDb,
        new Float64Array(BAND_COUNT),
      ),
    )
  }

  private resolveAnimationAwareSafetyTarget(
    baseBandGainsLinear: ArrayLike<number>,
    ultrasonicResidualGainLinear: number,
  ): number {
    const animationDepthDb =
      this.animationStateValue.mode === 'off'
        ? 0
        : this.animationStateValue.depthDb
    const leftCalibration = channelCalibrationGainsLinear(
      this.channelCalibrationStateValue.leftBandOffsetsDb,
    )
    const rightCalibration = channelCalibrationGainsLinear(
      this.channelCalibrationStateValue.rightBandOffsetsDb,
    )
    const leftCombined = Float64Array.from(
      baseBandGainsLinear,
      (gain, index) => gain * leftCalibration[index],
    )
    const rightCombined = Float64Array.from(
      baseBandGainsLinear,
      (gain, index) => gain * rightCalibration[index],
    )
    const normalPeak =
      Math.max(
        estimateFilterBankPeakGain(
          this.sampleRate,
          leftCombined,
          ultrasonicResidualGainLinear,
        ),
        estimateFilterBankPeakGain(
          this.sampleRate,
          rightCombined,
          ultrasonicResidualGainLinear,
        ),
      ) * decibelsToGain(animationDepthDb)
    const stimulusPeak = calibrationStimulusGainLinear(
      this.calibrationStimulusStateValue,
    )
    return computeSafetyPreGainLinear(normalPeak + stimulusPeak)
  }

  private updateChannelCalibrationTargets(): void {
    const left = channelCalibrationGainsLinear(
      this.channelCalibrationStateValue.leftBandOffsetsDb,
    )
    const right = channelCalibrationGainsLinear(
      this.channelCalibrationStateValue.rightBandOffsetsDb,
    )
    for (let band = 0; band < BAND_COUNT; band += 1) {
      this.calibrationLeftBandSmoothers[band].setTarget(left[band])
      this.calibrationRightBandSmoothers[band].setTarget(right[band])
    }
  }

  private updateCalibrationStimulusTargets(): void {
    const state = this.calibrationStimulusStateValue
    const selectedGain = calibrationStimulusGainLinear(state)
    for (let band = 0; band < BAND_COUNT; band += 1) {
      this.calibrationStimulusBandSmoothers[band].setTarget(
        state.mode === 'band' && band === state.bandIndex ? selectedGain : 0,
      )
    }
    this.calibrationStimulusWetSmoother.setTarget(
      calibrationStimulusWetTarget(state),
    )
    const [leftMask, rightMask] = calibrationStimulusChannelTargets(state)
    this.calibrationStimulusLeftMaskSmoother.setTarget(leftMask)
    this.calibrationStimulusRightMaskSmoother.setTarget(rightMask)
  }

  private updateGainTargets(): void {
    const targets = this.resolveTargets()
    for (let index = 0; index < BAND_COUNT; index += 1) {
      this.bandGainSmoothers[index].setTarget(targets.bandGainsLinear[index])
    }
    this.residualGainSmoother.setTarget(targets.ultrasonicResidualGainLinear)

    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(
      targets.bandGainsLinear,
      targets.ultrasonicResidualGainLinear,
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
