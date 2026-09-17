from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing pattern in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

# DSP engine: add transient inactive/silent/band calibration stimulus with smooth crossfades.
path = 'src/audio/dsp/engine.ts'
replace(
    path,
    "import { BAND_COUNT, TenBandFilterBank, type HighBandMode } from './filterBank'\n",
    "import {\n  CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n  type CalibrationStimulusState,\n  calibrationStimulusGainLinear,\n  calibrationStimulusWetTarget,\n  createCalibrationStimulusState,\n} from './calibrationStimulus'\nimport { BAND_COUNT, TenBandFilterBank, type HighBandMode } from './filterBank'\n",
)
replace(
    path,
    "function canonicalAnimationState(state: AnimationState): AnimationState {\n  return createAnimationState(\n    state.mode,\n    state.seed,\n    state.depthDb,\n    state.speed,\n    state.energyPreserving,\n  )\n}\n",
    "function canonicalAnimationState(state: AnimationState): AnimationState {\n  return createAnimationState(\n    state.mode,\n    state.seed,\n    state.depthDb,\n    state.speed,\n    state.energyPreserving,\n  )\n}\n\nfunction canonicalCalibrationStimulusState(\n  state: CalibrationStimulusState,\n): CalibrationStimulusState {\n  return createCalibrationStimulusState(\n    state.mode,\n    state.bandIndex,\n    state.levelOffsetDb,\n  )\n}\n",
)
replace(
    path,
    "  private readonly currentBandGains = new Float64Array(BAND_COUNT)\n  private readonly animationTargetOffsetsDb = new Float64Array(BAND_COUNT)\n",
    "  private readonly currentBandGains = new Float64Array(BAND_COUNT)\n  private readonly currentCalibrationStimulusBandGains = new Float64Array(BAND_COUNT)\n  private readonly animationTargetOffsetsDb = new Float64Array(BAND_COUNT)\n",
)
replace(
    path,
    "  private readonly stereoWidthSmoother: OnePoleSmoother\n  private readonly meter = new MeterAccumulator()\n",
    "  private readonly stereoWidthSmoother: OnePoleSmoother\n  private readonly calibrationStimulusBandSmoothers: OnePoleSmoother[]\n  private readonly calibrationStimulusWetSmoother: OnePoleSmoother\n  private readonly meter = new MeterAccumulator()\n",
)
replace(
    path,
    "  private animationStateValue: AnimationState\n  private safetyPreGainTargetValue: number\n",
    "  private animationStateValue: AnimationState\n  private calibrationStimulusStateValue: CalibrationStimulusState\n  private safetyPreGainTargetValue: number\n",
)
replace(
    path,
    "    this.animationStateValue = options.animationState\n      ? canonicalAnimationState(options.animationState)\n      : createAnimationState()\n    this.animation = new SpectralAnimation(\n",
    "    this.animationStateValue = options.animationState\n      ? canonicalAnimationState(options.animationState)\n      : createAnimationState()\n    this.calibrationStimulusStateValue = createCalibrationStimulusState()\n    this.animation = new SpectralAnimation(\n",
)
replace(
    path,
    "    this.stereoWidthSmoother = new OnePoleSmoother(\n      this.stereoWidthStateValue.width,\n      this.sampleRate,\n      STEREO_WIDTH_SMOOTHING_TIME_SECONDS,\n    )\n  }\n",
    "    this.stereoWidthSmoother = new OnePoleSmoother(\n      this.stereoWidthStateValue.width,\n      this.sampleRate,\n      STEREO_WIDTH_SMOOTHING_TIME_SECONDS,\n    )\n    this.calibrationStimulusBandSmoothers = Array.from(\n      { length: BAND_COUNT },\n      () =>\n        new OnePoleSmoother(\n          0,\n          this.sampleRate,\n          CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n        ),\n    )\n    this.calibrationStimulusWetSmoother = new OnePoleSmoother(\n      0,\n      this.sampleRate,\n      CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n    )\n  }\n",
)
replace(
    path,
    "  get animationSampleCursor(): number {\n    return this.animation.sampleCursor\n  }\n",
    "  get animationSampleCursor(): number {\n    return this.animation.sampleCursor\n  }\n\n  get calibrationStimulusState(): CalibrationStimulusState {\n    return this.calibrationStimulusStateValue\n  }\n",
)
replace(
    path,
    "  setAnimationState(state: AnimationState): void {\n    this.animationStateValue = canonicalAnimationState(state)\n    this.animation.setState(this.animationStateValue)\n    this.updateGainTargets()\n  }\n",
    "  setAnimationState(state: AnimationState): void {\n    this.animationStateValue = canonicalAnimationState(state)\n    this.animation.setState(this.animationStateValue)\n    this.updateGainTargets()\n  }\n\n  setCalibrationStimulusState(state: CalibrationStimulusState): void {\n    this.calibrationStimulusStateValue = canonicalCalibrationStimulusState(state)\n    this.updateCalibrationStimulusTargets()\n    this.updateGainTargets()\n  }\n",
)
replace(
    path,
    "    this.animationStateValue = nextAnimation\n    this.filterBankA.reset()\n",
    "    this.animationStateValue = nextAnimation\n    this.calibrationStimulusStateValue = createCalibrationStimulusState()\n    this.filterBankA.reset()\n",
)
replace(
    path,
    "    this.stereoWidthSmoother.reset(nextStereoWidth.width)\n  }\n",
    "    this.stereoWidthSmoother.reset(nextStereoWidth.width)\n    this.currentCalibrationStimulusBandGains.fill(0)\n    for (const smoother of this.calibrationStimulusBandSmoothers) {\n      smoother.reset(0)\n    }\n    this.calibrationStimulusWetSmoother.reset(0)\n  }\n",
)
replace(
    path,
    "      const shaped = this.nextShapedSample(\n        this.generatorA,\n        this.filterBankA,\n        this.scratchBandsA,\n        residualGain,\n      )\n\n      const safetyGain = this.safetyPreGainSmoother.next()\n      const masterGain = this.masterGainSmoother.next()\n      const preGuard = shaped * safetyGain * masterGain\n",
    "      const shaped = this.nextShapedSample(\n        this.generatorA,\n        this.filterBankA,\n        this.scratchBandsA,\n        residualGain,\n      )\n      this.prepareCalibrationStimulusBandGains()\n      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)\n      const stimulusWet = this.calibrationStimulusWetSmoother.next()\n      const requested = shaped * (1 - stimulusWet) + stimulus * stimulusWet\n\n      const safetyGain = this.safetyPreGainSmoother.next()\n      const masterGain = this.masterGainSmoother.next()\n      const preGuard = requested * safetyGain * masterGain\n",
)
replace(
    path,
    "      const mixedLeft = common * shapedA + difference * shapedB\n      const mixedRight = common * shapedA - difference * shapedB\n\n      const safetyGain = this.safetyPreGainSmoother.next()\n      const masterGain = this.masterGainSmoother.next()\n      const leftPreGuard = mixedLeft * safetyGain * masterGain\n      const rightPreGuard = mixedRight * safetyGain * masterGain\n",
    "      const mixedLeft = common * shapedA + difference * shapedB\n      const mixedRight = common * shapedA - difference * shapedB\n      this.prepareCalibrationStimulusBandGains()\n      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)\n      const stimulusWet = this.calibrationStimulusWetSmoother.next()\n      const requestedLeft =\n        mixedLeft * (1 - stimulusWet) + stimulus * stimulusWet\n      const requestedRight =\n        mixedRight * (1 - stimulusWet) + stimulus * stimulusWet\n\n      const safetyGain = this.safetyPreGainSmoother.next()\n      const masterGain = this.masterGainSmoother.next()\n      const leftPreGuard = requestedLeft * safetyGain * masterGain\n      const rightPreGuard = requestedRight * safetyGain * masterGain\n",
)
replace(
    path,
    "  private nextShapedSample(\n",
    "  private prepareCalibrationStimulusBandGains(): void {\n    for (let band = 0; band < BAND_COUNT; band += 1) {\n      this.currentCalibrationStimulusBandGains[band] =\n        this.calibrationStimulusBandSmoothers[band].next()\n    }\n  }\n\n  private currentCalibrationStimulusSample(\n    scratchBands: Float64Array,\n  ): number {\n    let stimulus = 0\n    for (let band = 0; band < BAND_COUNT; band += 1) {\n      stimulus +=\n        scratchBands[band] * this.currentCalibrationStimulusBandGains[band]\n    }\n    return stimulus\n  }\n\n  private nextShapedSample(\n",
)
replace(
    path,
    "    return computeSafetyPreGainLinear(\n      estimatedShapedPeakLinear * decibelsToGain(animationDepthDb),\n    )\n  }\n",
    "    const normalPeak =\n      estimatedShapedPeakLinear * decibelsToGain(animationDepthDb)\n    const stimulusPeak = calibrationStimulusGainLinear(\n      this.calibrationStimulusStateValue,\n    )\n    return computeSafetyPreGainLinear(normalPeak + stimulusPeak)\n  }\n\n  private updateCalibrationStimulusTargets(): void {\n    const state = this.calibrationStimulusStateValue\n    const selectedGain = calibrationStimulusGainLinear(state)\n    for (let band = 0; band < BAND_COUNT; band += 1) {\n      this.calibrationStimulusBandSmoothers[band].setTarget(\n        state.mode === 'band' && band === state.bandIndex ? selectedGain : 0,\n      )\n    }\n    this.calibrationStimulusWetSmoother.setTarget(\n      calibrationStimulusWetTarget(state),\n    )\n  }\n",
)

# Protocol v5: one transient set-calibration-stimulus command.
path = 'src/audio/protocol.ts'
replace(
    path,
    "import type { HighBandMode } from './dsp/filterBank'\n",
    "import {\n  CALIBRATION_STIMULUS_SCHEMA_VERSION,\n  type CalibrationStimulusState,\n  createCalibrationStimulusState,\n  isCalibrationStimulusMode,\n} from './dsp/calibrationStimulus'\nimport type { HighBandMode } from './dsp/filterBank'\n",
)
replace(path, "export const AUDIO_PROTOCOL_VERSION = 4 as const\nexport const GREYGEN_PROCESSOR_NAME = 'greygen-processor-v4'\n", "export const AUDIO_PROTOCOL_VERSION = 5 as const\nexport const GREYGEN_PROCESSOR_NAME = 'greygen-processor-v5'\n")
replace(
    path,
    "export interface SerializedAnimationState {\n  readonly schemaVersion: typeof ANIMATION_STATE_SCHEMA_VERSION\n  readonly mode: AnimationState['mode']\n  readonly seed: number\n  readonly depthDb: number\n  readonly speed: number\n  readonly energyPreserving: boolean\n}\n",
    "export interface SerializedAnimationState {\n  readonly schemaVersion: typeof ANIMATION_STATE_SCHEMA_VERSION\n  readonly mode: AnimationState['mode']\n  readonly seed: number\n  readonly depthDb: number\n  readonly speed: number\n  readonly energyPreserving: boolean\n}\n\nexport interface SerializedCalibrationStimulusState {\n  readonly schemaVersion: typeof CALIBRATION_STIMULUS_SCHEMA_VERSION\n  readonly mode: CalibrationStimulusState['mode']\n  readonly bandIndex: number\n  readonly levelOffsetDb: number\n}\n",
)
replace(
    path,
    "export interface SetAnimationMessage extends ProtocolEnvelope {\n  readonly type: 'set-animation'\n  readonly animation: SerializedAnimationState\n}\n",
    "export interface SetAnimationMessage extends ProtocolEnvelope {\n  readonly type: 'set-animation'\n  readonly animation: SerializedAnimationState\n}\n\nexport interface SetCalibrationStimulusMessage extends ProtocolEnvelope {\n  readonly type: 'set-calibration-stimulus'\n  readonly calibrationStimulus: SerializedCalibrationStimulusState\n}\n",
)
replace(
    path,
    "  | SetAnimationMessage\n  | ResetSeedMessage\n",
    "  | SetAnimationMessage\n  | SetCalibrationStimulusMessage\n  | ResetSeedMessage\n",
)
replace(
    path,
    "    | 'set-animation'\n    | 'reset-seed'\n",
    "    | 'set-animation'\n    | 'set-calibration-stimulus'\n    | 'reset-seed'\n",
)
replace(
    path,
    "function parseAnimationState(value: unknown): SerializedAnimationState | null {\n",
    "function parseCalibrationStimulusState(\n  value: unknown,\n): SerializedCalibrationStimulusState | null {\n  if (\n    !isRecord(value) ||\n    value.schemaVersion !== CALIBRATION_STIMULUS_SCHEMA_VERSION ||\n    !isCalibrationStimulusMode(value.mode) ||\n    !Number.isInteger(value.bandIndex) ||\n    !isFiniteNumber(value.levelOffsetDb)\n  ) {\n    return null\n  }\n  try {\n    return serializeCalibrationStimulusState(\n      createCalibrationStimulusState(\n        value.mode,\n        value.bandIndex as number,\n        value.levelOffsetDb,\n      ),\n    )\n  } catch {\n    return null\n  }\n}\n\nfunction parseAnimationState(value: unknown): SerializedAnimationState | null {\n",
)
replace(
    path,
    "export function deserializeAnimationState(\n  state: SerializedAnimationState,\n): AnimationState {\n  return createAnimationState(\n    state.mode,\n    state.seed,\n    state.depthDb,\n    state.speed,\n    state.energyPreserving,\n  )\n}\n",
    "export function deserializeAnimationState(\n  state: SerializedAnimationState,\n): AnimationState {\n  return createAnimationState(\n    state.mode,\n    state.seed,\n    state.depthDb,\n    state.speed,\n    state.energyPreserving,\n  )\n}\n\nexport function serializeCalibrationStimulusState(\n  state: CalibrationStimulusState,\n): SerializedCalibrationStimulusState {\n  const canonical = createCalibrationStimulusState(\n    state.mode,\n    state.bandIndex,\n    state.levelOffsetDb,\n  )\n  return {\n    schemaVersion: CALIBRATION_STIMULUS_SCHEMA_VERSION,\n    mode: canonical.mode,\n    bandIndex: canonical.bandIndex,\n    levelOffsetDb: canonical.levelOffsetDb,\n  }\n}\n\nexport function deserializeCalibrationStimulusState(\n  state: SerializedCalibrationStimulusState,\n): CalibrationStimulusState {\n  return createCalibrationStimulusState(\n    state.mode,\n    state.bandIndex,\n    state.levelOffsetDb,\n  )\n}\n",
)
replace(
    path,
    "    case 'reset-seed':\n",
    "    case 'set-calibration-stimulus': {\n      const calibrationStimulus = parseCalibrationStimulusState(\n        value.calibrationStimulus,\n      )\n      if (!calibrationStimulus) {\n        return null\n      }\n      return {\n        version: AUDIO_PROTOCOL_VERSION,\n        type: 'set-calibration-stimulus',\n        requestId: value.requestId,\n        calibrationStimulus,\n      }\n    }\n    case 'reset-seed':\n",
)
replace(
    path,
    "        value.command !== 'set-animation' &&\n        value.command !== 'reset-seed'\n",
    "        value.command !== 'set-animation' &&\n        value.command !== 'set-calibration-stimulus' &&\n        value.command !== 'reset-seed'\n",
)

# Worklet command handling.
path = 'src/audio/worklet/greygen-processor.ts'
replace(
    path,
    "  deserializeAnimationState,\n  deserializeGainStageState,\n",
    "  deserializeAnimationState,\n  deserializeCalibrationStimulusState,\n  deserializeGainStageState,\n",
)
replace(
    path,
    "      case 'reset-seed':\n",
    "      case 'set-calibration-stimulus':\n        this.engine.setCalibrationStimulusState(\n          deserializeCalibrationStimulusState(message.calibrationStimulus),\n        )\n        this.post({\n          version: AUDIO_PROTOCOL_VERSION,\n          type: 'ack',\n          requestId: message.requestId,\n          command: 'set-calibration-stimulus',\n        })\n        return\n      case 'reset-seed':\n",
)

# Main-thread AudioEngine facade.
path = 'src/audio/AudioEngine.ts'
replace(
    path,
    "import { type AnimationState, createAnimationState } from './dsp/animation'\n",
    "import { type AnimationState, createAnimationState } from './dsp/animation'\nimport {\n  type CalibrationStimulusState,\n  createCalibrationStimulusState,\n} from './dsp/calibrationStimulus'\n",
)
replace(
    path,
    "  serializeAnimationState,\n  serializeGainStageState,\n",
    "  serializeAnimationState,\n  serializeCalibrationStimulusState,\n  serializeGainStageState,\n",
)
replace(
    path,
    "function canonicalAnimation(state: AnimationState): AnimationState {\n  return createAnimationState(\n    state.mode,\n    state.seed,\n    state.depthDb,\n    state.speed,\n    state.energyPreserving,\n  )\n}\n",
    "function canonicalAnimation(state: AnimationState): AnimationState {\n  return createAnimationState(\n    state.mode,\n    state.seed,\n    state.depthDb,\n    state.speed,\n    state.energyPreserving,\n  )\n}\n\nfunction canonicalCalibrationStimulus(\n  state: CalibrationStimulusState,\n): CalibrationStimulusState {\n  return createCalibrationStimulusState(\n    state.mode,\n    state.bandIndex,\n    state.levelOffsetDb,\n  )\n}\n",
)
replace(
    path,
    "  private animationValue: AnimationState\n\n  constructor(\n",
    "  private animationValue: AnimationState\n  private calibrationStimulusValue: CalibrationStimulusState\n\n  constructor(\n",
)
replace(
    path,
    "    this.animationValue = canonicalAnimation(animationState)\n    const capability = initialCapability(runtime)\n",
    "    this.animationValue = canonicalAnimation(animationState)\n    this.calibrationStimulusValue = createCalibrationStimulusState()\n    const capability = initialCapability(runtime)\n",
)
replace(
    path,
    "    if (this.hasOwnedResources()) {\n      await this.cleanupResources()\n    }\n\n    this.setSnapshot({\n",
    "    if (this.hasOwnedResources()) {\n      await this.cleanupResources()\n    }\n    this.calibrationStimulusValue = createCalibrationStimulusState()\n\n    this.setSnapshot({\n",
)
replace(
    path,
    "    await this.cleanupResources()\n    this.setSnapshot({\n",
    "    await this.cleanupResources()\n    this.calibrationStimulusValue = createCalibrationStimulusState()\n    this.setSnapshot({\n",
)
replace(
    path,
    "  async resetSeed(seed: number): Promise<void> {\n",
    "  async setCalibrationStimulusState(\n    state: CalibrationStimulusState,\n  ): Promise<void> {\n    const canonical = canonicalCalibrationStimulus(state)\n    if (!this.node && canonical.mode !== 'inactive') {\n      throw new Error('Calibration stimulus requires running audio')\n    }\n    this.calibrationStimulusValue = canonical\n    if (!this.node) {\n      return\n    }\n    const response = await this.request(\n      {\n        version: AUDIO_PROTOCOL_VERSION,\n        type: 'set-calibration-stimulus',\n        requestId: this.allocateRequestId(),\n        calibrationStimulus: serializeCalibrationStimulusState(canonical),\n      },\n      'ack',\n    )\n    if (\n      response.type !== 'ack' ||\n      response.command !== 'set-calibration-stimulus'\n    ) {\n      throw new Error('Unexpected set-calibration-stimulus acknowledgement')\n    }\n  }\n\n  async setCalibrationStimulusBand(\n    bandIndex: number,\n    levelOffsetDb: number,\n  ): Promise<void> {\n    await this.setCalibrationStimulusState(\n      createCalibrationStimulusState('band', bandIndex, levelOffsetDb),\n    )\n  }\n\n  async silenceCalibrationStimulus(): Promise<void> {\n    await this.setCalibrationStimulusState(\n      createCalibrationStimulusState('silent'),\n    )\n  }\n\n  async endCalibrationStimulus(): Promise<void> {\n    await this.setCalibrationStimulusState(createCalibrationStimulusState())\n  }\n\n  async resetSeed(seed: number): Promise<void> {\n",
)
