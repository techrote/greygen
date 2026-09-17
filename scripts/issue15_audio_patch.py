from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    if text.count(old) < count:
        raise SystemExit(f'missing pattern in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, count))

# protocol v6 + channel calibration state and channel-routed stimulus
path = 'src/audio/protocol.ts'
replace(
    path,
    "import {\n  CALIBRATION_STIMULUS_SCHEMA_VERSION,\n  type CalibrationStimulusState,\n  createCalibrationStimulusState,\n  isCalibrationStimulusMode,\n} from './dsp/calibrationStimulus'\n",
    "import {\n  CALIBRATION_STIMULUS_SCHEMA_VERSION,\n  type CalibrationStimulusState,\n  createCalibrationStimulusState,\n  isCalibrationStimulusChannel,\n  isCalibrationStimulusMode,\n} from './dsp/calibrationStimulus'\nimport {\n  CHANNEL_CALIBRATION_SCHEMA_VERSION,\n  type ChannelCalibrationState,\n  createChannelCalibrationState,\n} from './dsp/channelCalibration'\n",
)
replace(
    path,
    "export const AUDIO_PROTOCOL_VERSION = 5 as const\nexport const GREYGEN_PROCESSOR_NAME = 'greygen-processor-v5'\n",
    "export const AUDIO_PROTOCOL_VERSION = 6 as const\nexport const GREYGEN_PROCESSOR_NAME = 'greygen-processor-v6'\n",
)
replace(
    path,
    "export interface SerializedStereoWidthState {\n",
    "export interface SerializedChannelCalibrationState {\n  readonly schemaVersion: typeof CHANNEL_CALIBRATION_SCHEMA_VERSION\n  readonly leftBandOffsetsDb: readonly number[]\n  readonly rightBandOffsetsDb: readonly number[]\n}\n\nexport interface SerializedStereoWidthState {\n",
)
replace(
    path,
    "export interface SerializedCalibrationStimulusState {\n  readonly schemaVersion: typeof CALIBRATION_STIMULUS_SCHEMA_VERSION\n  readonly mode: CalibrationStimulusState['mode']\n  readonly bandIndex: number\n  readonly levelOffsetDb: number\n}\n",
    "export interface SerializedCalibrationStimulusState {\n  readonly schemaVersion: typeof CALIBRATION_STIMULUS_SCHEMA_VERSION\n  readonly mode: CalibrationStimulusState['mode']\n  readonly bandIndex: number\n  readonly levelOffsetDb: number\n  readonly channel: CalibrationStimulusState['channel']\n}\n",
)
replace(
    path,
    "  readonly gainStage: SerializedGainStageState\n  readonly stereoWidth: SerializedStereoWidthState\n",
    "  readonly gainStage: SerializedGainStageState\n  readonly channelCalibration: SerializedChannelCalibrationState\n  readonly stereoWidth: SerializedStereoWidthState\n",
)
replace(
    path,
    "export interface SetStereoWidthMessage extends ProtocolEnvelope {\n",
    "export interface SetChannelCalibrationMessage extends ProtocolEnvelope {\n  readonly type: 'set-channel-calibration'\n  readonly channelCalibration: SerializedChannelCalibrationState\n}\n\nexport interface SetStereoWidthMessage extends ProtocolEnvelope {\n",
)
replace(
    path,
    "  | SetGainStageMessage\n  | SetStereoWidthMessage\n",
    "  | SetGainStageMessage\n  | SetChannelCalibrationMessage\n  | SetStereoWidthMessage\n",
)
replace(
    path,
    "    | 'set-gain-stage'\n    | 'set-stereo-width'\n",
    "    | 'set-gain-stage'\n    | 'set-channel-calibration'\n    | 'set-stereo-width'\n",
)
replace(
    path,
    "function parseStereoWidthState(\n",
    "function parseChannelCalibrationState(\n  value: unknown,\n): SerializedChannelCalibrationState | null {\n  if (\n    !isRecord(value) ||\n    value.schemaVersion !== CHANNEL_CALIBRATION_SCHEMA_VERSION ||\n    !Array.isArray(value.leftBandOffsetsDb) ||\n    !Array.isArray(value.rightBandOffsetsDb)\n  ) {\n    return null\n  }\n  try {\n    return serializeChannelCalibrationState(\n      createChannelCalibrationState(\n        value.leftBandOffsetsDb,\n        value.rightBandOffsetsDb,\n      ),\n    )\n  } catch {\n    return null\n  }\n}\n\nfunction parseStereoWidthState(\n",
)
replace(
    path,
    "    !isCalibrationStimulusMode(value.mode) ||\n    !Number.isInteger(value.bandIndex) ||\n",
    "    !isCalibrationStimulusMode(value.mode) ||\n    !isCalibrationStimulusChannel(value.channel) ||\n    !Number.isInteger(value.bandIndex) ||\n",
)
replace(
    path,
    "        value.levelOffsetDb,\n      ),\n",
    "        value.levelOffsetDb,\n        value.channel,\n      ),\n",
)
replace(
    path,
    "export function serializeStereoWidthState(\n",
    "export function serializeChannelCalibrationState(\n  state: ChannelCalibrationState,\n): SerializedChannelCalibrationState {\n  const canonical = createChannelCalibrationState(\n    state.leftBandOffsetsDb,\n    state.rightBandOffsetsDb,\n  )\n  return {\n    schemaVersion: CHANNEL_CALIBRATION_SCHEMA_VERSION,\n    leftBandOffsetsDb: Array.from(canonical.leftBandOffsetsDb),\n    rightBandOffsetsDb: Array.from(canonical.rightBandOffsetsDb),\n  }\n}\n\nexport function deserializeChannelCalibrationState(\n  state: SerializedChannelCalibrationState,\n): ChannelCalibrationState {\n  return createChannelCalibrationState(\n    state.leftBandOffsetsDb,\n    state.rightBandOffsetsDb,\n  )\n}\n\nexport function serializeStereoWidthState(\n",
)
replace(
    path,
    "    state.levelOffsetDb,\n  )\n  return {\n",
    "    state.levelOffsetDb,\n    state.channel,\n  )\n  return {\n",
)
replace(
    path,
    "    levelOffsetDb: canonical.levelOffsetDb,\n  }\n}\n\nexport function deserializeCalibrationStimulusState",
    "    levelOffsetDb: canonical.levelOffsetDb,\n    channel: canonical.channel,\n  }\n}\n\nexport function deserializeCalibrationStimulusState",
)
replace(
    path,
    "    state.levelOffsetDb,\n  )\n}\n\nexport function parseMainToWorkletMessage",
    "    state.levelOffsetDb,\n    state.channel,\n  )\n}\n\nexport function parseMainToWorkletMessage",
)
replace(
    path,
    "      const gainStage = parseGainStageState(value.gainStage)\n      const stereoWidth = parseStereoWidthState(value.stereoWidth)\n",
    "      const gainStage = parseGainStageState(value.gainStage)\n      const channelCalibration = parseChannelCalibrationState(\n        value.channelCalibration,\n      )\n      const stereoWidth = parseStereoWidthState(value.stereoWidth)\n",
)
replace(
    path,
    "        !gainStage ||\n        !stereoWidth ||\n",
    "        !gainStage ||\n        !channelCalibration ||\n        !stereoWidth ||\n",
)
replace(
    path,
    "        gainStage,\n        stereoWidth,\n",
    "        gainStage,\n        channelCalibration,\n        stereoWidth,\n",
)
replace(
    path,
    "    case 'set-stereo-width': {\n",
    "    case 'set-channel-calibration': {\n      const channelCalibration = parseChannelCalibrationState(\n        value.channelCalibration,\n      )\n      if (!channelCalibration) {\n        return null\n      }\n      return {\n        version: AUDIO_PROTOCOL_VERSION,\n        type: 'set-channel-calibration',\n        requestId: value.requestId,\n        channelCalibration,\n      }\n    }\n    case 'set-stereo-width': {\n",
)
replace(
    path,
    "        value.command !== 'set-gain-stage' &&\n        value.command !== 'set-stereo-width' &&\n",
    "        value.command !== 'set-gain-stage' &&\n        value.command !== 'set-channel-calibration' &&\n        value.command !== 'set-stereo-width' &&\n",
)

# AudioEngine: preserve channel calibration separately from master/generic gain stage.
path = 'src/audio/AudioEngine.ts'
replace(
    path,
    "import { type AnimationState, createAnimationState } from './dsp/animation'\n",
    "import { type AnimationState, createAnimationState } from './dsp/animation'\nimport {\n  type ChannelCalibrationState,\n  createChannelCalibrationState,\n} from './dsp/channelCalibration'\n",
)
replace(
    path,
    "  serializeCalibrationStimulusState,\n  serializeGainStageState,\n",
    "  serializeCalibrationStimulusState,\n  serializeChannelCalibrationState,\n  serializeGainStageState,\n",
)
replace(
    path,
    "function canonicalStereoWidth(state: StereoWidthState): StereoWidthState {\n",
    "function canonicalChannelCalibration(\n  state: ChannelCalibrationState,\n): ChannelCalibrationState {\n  return createChannelCalibrationState(\n    state.leftBandOffsetsDb,\n    state.rightBandOffsetsDb,\n  )\n}\n\nfunction canonicalStereoWidth(state: StereoWidthState): StereoWidthState {\n",
)
replace(
    path,
    "    state.levelOffsetDb,\n  )\n}\n\nexport class AudioEngine",
    "    state.levelOffsetDb,\n    state.channel,\n  )\n}\n\nexport class AudioEngine",
)
replace(
    path,
    "  private gainStageValue: GainStageState\n  private stereoWidthValue: StereoWidthState\n",
    "  private gainStageValue: GainStageState\n  private channelCalibrationValue: ChannelCalibrationState\n  private stereoWidthValue: StereoWidthState\n",
)
replace(
    path,
    "    animationState: AnimationState = createAnimationState(),\n  ) {\n",
    "    animationState: AnimationState = createAnimationState(),\n    channelCalibrationState: ChannelCalibrationState = createChannelCalibrationState(\n      gainStageState.calibrationBandOffsetsDb,\n    ),\n  ) {\n",
)
replace(
    path,
    "    this.gainStageValue = canonicalGainStage(gainStageState)\n    this.stereoWidthValue = canonicalStereoWidth(stereoWidthState)\n",
    "    this.gainStageValue = canonicalGainStage(gainStageState)\n    this.channelCalibrationValue = canonicalChannelCalibration(\n      channelCalibrationState,\n    )\n    this.stereoWidthValue = canonicalStereoWidth(stereoWidthState)\n",
)
replace(
    path,
    "          gainStage: serializeGainStageState(this.gainStageValue),\n          stereoWidth: serializeStereoWidthState(this.stereoWidthValue),\n",
    "          gainStage: serializeGainStageState(this.gainStageValue),\n          channelCalibration: serializeChannelCalibrationState(\n            this.channelCalibrationValue,\n          ),\n          stereoWidth: serializeStereoWidthState(this.stereoWidthValue),\n",
)
replace(
    path,
    "  async setStereoWidthState(state: StereoWidthState): Promise<void> {\n",
    "  async setChannelCalibrationState(\n    state: ChannelCalibrationState,\n  ): Promise<void> {\n    const canonical = canonicalChannelCalibration(state)\n    this.channelCalibrationValue = canonical\n    if (!this.node) {\n      return\n    }\n    const response = await this.request(\n      {\n        version: AUDIO_PROTOCOL_VERSION,\n        type: 'set-channel-calibration',\n        requestId: this.allocateRequestId(),\n        channelCalibration: serializeChannelCalibrationState(canonical),\n      },\n      'ack',\n    )\n    if (\n      response.type !== 'ack' ||\n      response.command !== 'set-channel-calibration'\n    ) {\n      throw new Error('Unexpected set-channel-calibration acknowledgement')\n    }\n  }\n\n  async setCalibrationChannelOffsetsDb(\n    leftBandOffsetsDb: ArrayLike<number>,\n    rightBandOffsetsDb: ArrayLike<number>,\n  ): Promise<void> {\n    await this.setChannelCalibrationState(\n      createChannelCalibrationState(leftBandOffsetsDb, rightBandOffsetsDb),\n    )\n  }\n\n  async setStereoWidthState(state: StereoWidthState): Promise<void> {\n",
)
replace(
    path,
    "  async setCalibrationBandOffsetsDb(values: ArrayLike<number>): Promise<void> {\n    await this.setGainStageState(\n      createGainStageState(\n        this.gainStageValue.masterGainDb,\n        this.gainStageValue.animationBandOffsetsDb,\n        values,\n      ),\n    )\n  }\n",
    "  async setCalibrationBandOffsetsDb(values: ArrayLike<number>): Promise<void> {\n    await this.setCalibrationChannelOffsetsDb(values, values)\n  }\n",
)
replace(
    path,
    "  async setCalibrationStimulusBand(\n    bandIndex: number,\n    levelOffsetDb: number,\n  ): Promise<void> {\n    await this.setCalibrationStimulusState(\n      createCalibrationStimulusState('band', bandIndex, levelOffsetDb),\n    )\n  }\n",
    "  async setCalibrationStimulusBand(\n    bandIndex: number,\n    levelOffsetDb: number,\n    channel: CalibrationStimulusState['channel'] = 'both',\n  ): Promise<void> {\n    await this.setCalibrationStimulusState(\n      createCalibrationStimulusState('band', bandIndex, levelOffsetDb, channel),\n    )\n  }\n",
)

# Worklet plumbing for channel state.
path = 'src/audio/worklet/greygen-processor.ts'
replace(
    path,
    "  deserializeCalibrationStimulusState,\n  deserializeGainStageState,\n",
    "  deserializeCalibrationStimulusState,\n  deserializeChannelCalibrationState,\n  deserializeGainStageState,\n",
)
replace(
    path,
    "          gainStageState: deserializeGainStageState(message.gainStage),\n          stereoWidthState: deserializeStereoWidthState(message.stereoWidth),\n",
    "          gainStageState: deserializeGainStageState(message.gainStage),\n          channelCalibrationState: deserializeChannelCalibrationState(\n            message.channelCalibration,\n          ),\n          stereoWidthState: deserializeStereoWidthState(message.stereoWidth),\n",
)
replace(
    path,
    "      case 'set-stereo-width':\n",
    "      case 'set-channel-calibration':\n        this.engine.setChannelCalibrationState(\n          deserializeChannelCalibrationState(message.channelCalibration),\n        )\n        this.post({\n          version: AUDIO_PROTOCOL_VERSION,\n          type: 'ack',\n          requestId: message.requestId,\n          command: 'set-channel-calibration',\n        })\n        return\n      case 'set-stereo-width':\n",
)

# DSP engine: mix filter-bank components to output channels, then apply independent calibration per band.
path = 'src/audio/dsp/engine.ts'
replace(
    path,
    "} from './animation'\nimport {\n  CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n",
    "} from './animation'\nimport {\n  type ChannelCalibrationState,\n  channelCalibrationGainsLinear,\n  createChannelCalibrationState,\n} from './channelCalibration'\nimport {\n  CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n",
)
replace(
    path,
    "  calibrationStimulusGainLinear,\n  calibrationStimulusWetTarget,\n",
    "  calibrationStimulusChannelTargets,\n  calibrationStimulusGainLinear,\n  calibrationStimulusWetTarget,\n",
)
replace(
    path,
    "  createGainStageState,\n  masterGainLinear,\n",
    "  createGainStageState,\n  estimateFilterBankPeakGain,\n  masterGainLinear,\n",
)
replace(
    path,
    "  readonly gainStageState?: GainStageState\n  readonly stereoWidthState?: StereoWidthState\n",
    "  readonly gainStageState?: GainStageState\n  readonly channelCalibrationState?: ChannelCalibrationState\n  readonly stereoWidthState?: StereoWidthState\n",
    2,
)
replace(
    path,
    "    state.levelOffsetDb,\n  )\n}\n\nexport class GreygenDspEngine",
    "    state.levelOffsetDb,\n    state.channel,\n  )\n}\n\nfunction canonicalChannelCalibrationState(\n  state: ChannelCalibrationState,\n): ChannelCalibrationState {\n  return createChannelCalibrationState(\n    state.leftBandOffsetsDb,\n    state.rightBandOffsetsDb,\n  )\n}\n\nexport class GreygenDspEngine",
)
replace(
    path,
    "  private readonly currentBandGains = new Float64Array(BAND_COUNT)\n",
    "  private readonly currentBandGains = new Float64Array(BAND_COUNT)\n  private readonly currentCalibrationLeftGains = new Float64Array(BAND_COUNT)\n  private readonly currentCalibrationRightGains = new Float64Array(BAND_COUNT)\n",
)
replace(
    path,
    "  private readonly stereoWidthSmoother: OnePoleSmoother\n  private readonly calibrationStimulusBandSmoothers: OnePoleSmoother[]\n",
    "  private readonly stereoWidthSmoother: OnePoleSmoother\n  private readonly calibrationLeftBandSmoothers: OnePoleSmoother[]\n  private readonly calibrationRightBandSmoothers: OnePoleSmoother[]\n  private readonly calibrationStimulusBandSmoothers: OnePoleSmoother[]\n",
)
replace(
    path,
    "  private readonly calibrationStimulusWetSmoother: OnePoleSmoother\n",
    "  private readonly calibrationStimulusWetSmoother: OnePoleSmoother\n  private readonly calibrationStimulusLeftMaskSmoother: OnePoleSmoother\n  private readonly calibrationStimulusRightMaskSmoother: OnePoleSmoother\n",
)
replace(
    path,
    "  private gainStageStateValue: GainStageState\n  private stereoWidthStateValue: StereoWidthState\n",
    "  private gainStageStateValue: GainStageState\n  private channelCalibrationStateValue: ChannelCalibrationState\n  private stereoWidthStateValue: StereoWidthState\n",
)
replace(
    path,
    "    this.gainStageStateValue = options.gainStageState\n      ? canonicalGainStageState(options.gainStageState)\n      : createGainStageState()\n    this.stereoWidthStateValue = options.stereoWidthState\n",
    "    this.gainStageStateValue = options.gainStageState\n      ? canonicalGainStageState(options.gainStageState)\n      : createGainStageState()\n    this.channelCalibrationStateValue = options.channelCalibrationState\n      ? canonicalChannelCalibrationState(options.channelCalibrationState)\n      : createChannelCalibrationState(\n          this.gainStageStateValue.calibrationBandOffsetsDb,\n        )\n    this.stereoWidthStateValue = options.stereoWidthState\n",
)
replace(
    path,
    "    this.stereoWidthSmoother = new OnePoleSmoother(\n      this.stereoWidthStateValue.width,\n      this.sampleRate,\n      STEREO_WIDTH_SMOOTHING_TIME_SECONDS,\n    )\n    this.calibrationStimulusBandSmoothers = Array.from(\n",
    "    this.stereoWidthSmoother = new OnePoleSmoother(\n      this.stereoWidthStateValue.width,\n      this.sampleRate,\n      STEREO_WIDTH_SMOOTHING_TIME_SECONDS,\n    )\n    const initialLeftCalibration = channelCalibrationGainsLinear(\n      this.channelCalibrationStateValue.leftBandOffsetsDb,\n    )\n    const initialRightCalibration = channelCalibrationGainsLinear(\n      this.channelCalibrationStateValue.rightBandOffsetsDb,\n    )\n    this.calibrationLeftBandSmoothers = Array.from(\n      { length: BAND_COUNT },\n      (_, index) =>\n        new OnePoleSmoother(\n          initialLeftCalibration[index],\n          this.sampleRate,\n          CONTROL_SMOOTHING_TIME_SECONDS,\n        ),\n    )\n    this.calibrationRightBandSmoothers = Array.from(\n      { length: BAND_COUNT },\n      (_, index) =>\n        new OnePoleSmoother(\n          initialRightCalibration[index],\n          this.sampleRate,\n          CONTROL_SMOOTHING_TIME_SECONDS,\n        ),\n    )\n    this.calibrationStimulusBandSmoothers = Array.from(\n",
)
replace(
    path,
    "    this.calibrationStimulusWetSmoother = new OnePoleSmoother(\n      0,\n      this.sampleRate,\n      CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n    )\n  }\n",
    "    this.calibrationStimulusWetSmoother = new OnePoleSmoother(\n      0,\n      this.sampleRate,\n      CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n    )\n    this.calibrationStimulusLeftMaskSmoother = new OnePoleSmoother(\n      0,\n      this.sampleRate,\n      CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n    )\n    this.calibrationStimulusRightMaskSmoother = new OnePoleSmoother(\n      0,\n      this.sampleRate,\n      CALIBRATION_STIMULUS_TRANSITION_SECONDS,\n    )\n  }\n",
)
replace(
    path,
    "  get stereoWidthState(): StereoWidthState {\n",
    "  get channelCalibrationState(): ChannelCalibrationState {\n    return this.channelCalibrationStateValue\n  }\n\n  get stereoWidthState(): StereoWidthState {\n",
)
replace(
    path,
    "  setGainStageState(state: GainStageState): void {\n    this.gainStageStateValue = canonicalGainStageState(state)\n    this.updateGainTargets()\n  }\n",
    "  setGainStageState(state: GainStageState): void {\n    const next = canonicalGainStageState(state)\n    const calibrationChanged = next.calibrationBandOffsetsDb.some(\n      (value, index) =>\n        value !== this.gainStageStateValue.calibrationBandOffsetsDb[index],\n    )\n    this.gainStageStateValue = next\n    if (calibrationChanged) {\n      this.channelCalibrationStateValue = createChannelCalibrationState(\n        next.calibrationBandOffsetsDb,\n      )\n      this.updateChannelCalibrationTargets()\n    }\n    this.updateGainTargets()\n  }\n\n  setChannelCalibrationState(state: ChannelCalibrationState): void {\n    this.channelCalibrationStateValue = canonicalChannelCalibrationState(state)\n    this.updateChannelCalibrationTargets()\n    this.updateGainTargets()\n  }\n",
)
replace(
    path,
    "    const nextStereoWidth = options.stereoWidthState\n",
    "    const nextChannelCalibration = options.channelCalibrationState\n      ? canonicalChannelCalibrationState(options.channelCalibrationState)\n      : options.gainStageState\n        ? createChannelCalibrationState(nextGainStage.calibrationBandOffsetsDb)\n        : this.channelCalibrationStateValue\n    const nextStereoWidth = options.stereoWidthState\n",
)
replace(
    path,
    "    this.gainStageStateValue = nextGainStage\n    this.stereoWidthStateValue = nextStereoWidth\n",
    "    this.gainStageStateValue = nextGainStage\n    this.channelCalibrationStateValue = nextChannelCalibration\n    this.stereoWidthStateValue = nextStereoWidth\n",
)
replace(
    path,
    "    for (let index = 0; index < BAND_COUNT; index += 1) {\n      this.bandGainSmoothers[index].reset(targets.bandGainsLinear[index])\n      this.animationBandSmoothers[index].reset(0)\n    }\n",
    "    const leftCalibration = channelCalibrationGainsLinear(\n      nextChannelCalibration.leftBandOffsetsDb,\n    )\n    const rightCalibration = channelCalibrationGainsLinear(\n      nextChannelCalibration.rightBandOffsetsDb,\n    )\n    for (let index = 0; index < BAND_COUNT; index += 1) {\n      this.bandGainSmoothers[index].reset(targets.bandGainsLinear[index])\n      this.animationBandSmoothers[index].reset(0)\n      this.calibrationLeftBandSmoothers[index].reset(leftCalibration[index])\n      this.calibrationRightBandSmoothers[index].reset(rightCalibration[index])\n    }\n",
)
replace(
    path,
    "    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(\n      targets.estimatedShapedPeakLinear,\n    )\n",
    "    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(\n      targets.bandGainsLinear,\n      targets.ultrasonicResidualGainLinear,\n    )\n",
    2,
)
replace(
    path,
    "    this.calibrationStimulusWetSmoother.reset(0)\n  }\n\n  renderMono",
    "    this.calibrationStimulusWetSmoother.reset(0)\n    this.calibrationStimulusLeftMaskSmoother.reset(0)\n    this.calibrationStimulusRightMaskSmoother.reset(0)\n  }\n\n  renderMono",
)
old_mono = """  renderMono(output: Float32Array): void {\n    for (let frame = 0; frame < output.length; frame += 1) {\n      this.prepareCurrentBandGains()\n      const residualGain = this.residualGainSmoother.next()\n      const shaped = this.nextShapedSample(\n        this.generatorA,\n        this.filterBankA,\n        this.scratchBandsA,\n        residualGain,\n      )\n      this.prepareCalibrationStimulusBandGains()\n      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)\n      const stimulusWet = this.calibrationStimulusWetSmoother.next()\n      const requested = shaped * (1 - stimulusWet) + stimulus * stimulusWet\n\n      const safetyGain = this.safetyPreGainSmoother.next()\n      const masterGain = this.masterGainSmoother.next()\n      const preGuard = requested * safetyGain * masterGain\n      const guarded = applyFinalGuard(preGuard)\n      if (guarded !== preGuard) {\n        this.guardInterventionsValue += 1\n      }\n\n      output[frame] = guarded\n      this.meter.addSample(guarded)\n    }\n  }\n"""
new_mono = """  renderMono(output: Float32Array): void {\n    for (let frame = 0; frame < output.length; frame += 1) {\n      this.prepareCurrentBandGains()\n      this.prepareCurrentChannelCalibrationGains()\n      const residualGain = this.residualGainSmoother.next()\n      const residual = this.nextBandComponents(\n        this.generatorA,\n        this.filterBankA,\n        this.scratchBandsA,\n      )\n      let shaped = residual * residualGain\n      for (let band = 0; band < BAND_COUNT; band += 1) {\n        shaped +=\n          this.scratchBandsA[band] *\n          this.currentBandGains[band] *\n          this.currentCalibrationLeftGains[band]\n      }\n      this.prepareCalibrationStimulusBandGains()\n      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)\n      const stimulusWet = this.calibrationStimulusWetSmoother.next()\n      const stimulusMask = this.calibrationStimulusLeftMaskSmoother.next()\n      const requested =\n        shaped * (1 - stimulusWet) + stimulus * stimulusWet * stimulusMask\n\n      const safetyGain = this.safetyPreGainSmoother.next()\n      const masterGain = this.masterGainSmoother.next()\n      const preGuard = requested * safetyGain * masterGain\n      const guarded = applyFinalGuard(preGuard)\n      if (guarded !== preGuard) {\n        this.guardInterventionsValue += 1\n      }\n\n      output[frame] = guarded\n      this.meter.addSample(guarded)\n    }\n  }\n"""
replace(path, old_mono, new_mono)
old_stereo = """    for (let frame = 0; frame < left.length; frame += 1) {\n      this.prepareCurrentBandGains()\n      const residualGain = this.residualGainSmoother.next()\n      const shapedA = this.nextShapedSample(\n        this.generatorA,\n        this.filterBankA,\n        this.scratchBandsA,\n        residualGain,\n      )\n      const shapedB = this.nextShapedSample(\n        this.generatorB,\n        this.filterBankB,\n        this.scratchBandsB,\n        residualGain,\n      )\n\n      const width = this.stereoWidthSmoother.next()\n      const angle = stereoWidthToMixAngle(width)\n      const common = Math.cos(angle)\n      const difference = Math.sin(angle)\n      const mixedLeft = common * shapedA + difference * shapedB\n      const mixedRight = common * shapedA - difference * shapedB\n      this.prepareCalibrationStimulusBandGains()\n      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)\n      const stimulusWet = this.calibrationStimulusWetSmoother.next()\n      const requestedLeft =\n        mixedLeft * (1 - stimulusWet) + stimulus * stimulusWet\n      const requestedRight =\n        mixedRight * (1 - stimulusWet) + stimulus * stimulusWet\n"""
new_stereo = """    for (let frame = 0; frame < left.length; frame += 1) {\n      this.prepareCurrentBandGains()\n      this.prepareCurrentChannelCalibrationGains()\n      const residualGain = this.residualGainSmoother.next()\n      const residualA = this.nextBandComponents(\n        this.generatorA,\n        this.filterBankA,\n        this.scratchBandsA,\n      )\n      const residualB = this.nextBandComponents(\n        this.generatorB,\n        this.filterBankB,\n        this.scratchBandsB,\n      )\n\n      const width = this.stereoWidthSmoother.next()\n      const angle = stereoWidthToMixAngle(width)\n      const common = Math.cos(angle)\n      const difference = Math.sin(angle)\n      let mixedLeft = (common * residualA + difference * residualB) * residualGain\n      let mixedRight = (common * residualA - difference * residualB) * residualGain\n      for (let band = 0; band < BAND_COUNT; band += 1) {\n        const baseGain = this.currentBandGains[band]\n        mixedLeft +=\n          (common * this.scratchBandsA[band] +\n            difference * this.scratchBandsB[band]) *\n          baseGain *\n          this.currentCalibrationLeftGains[band]\n        mixedRight +=\n          (common * this.scratchBandsA[band] -\n            difference * this.scratchBandsB[band]) *\n          baseGain *\n          this.currentCalibrationRightGains[band]\n      }\n      this.prepareCalibrationStimulusBandGains()\n      const stimulus = this.currentCalibrationStimulusSample(this.scratchBandsA)\n      const stimulusWet = this.calibrationStimulusWetSmoother.next()\n      const leftMask = this.calibrationStimulusLeftMaskSmoother.next()\n      const rightMask = this.calibrationStimulusRightMaskSmoother.next()\n      const requestedLeft =\n        mixedLeft * (1 - stimulusWet) + stimulus * stimulusWet * leftMask\n      const requestedRight =\n        mixedRight * (1 - stimulusWet) + stimulus * stimulusWet * rightMask\n"""
replace(path, old_stereo, new_stereo)
replace(
    path,
    "  private prepareCalibrationStimulusBandGains(): void {\n",
    "  private prepareCurrentChannelCalibrationGains(): void {\n    for (let band = 0; band < BAND_COUNT; band += 1) {\n      this.currentCalibrationLeftGains[band] =\n        this.calibrationLeftBandSmoothers[band].next()\n      this.currentCalibrationRightGains[band] =\n        this.calibrationRightBandSmoothers[band].next()\n    }\n  }\n\n  private prepareCalibrationStimulusBandGains(): void {\n",
)
old_next = """  private nextShapedSample(\n    generator: Xoshiro128StarStar,\n    filterBank: TenBandFilterBank,\n    scratchBands: Float64Array,\n    residualGain: number,\n  ): number {\n    const source = generator.nextBipolar() * SOURCE_NORMALIZATION_GAIN_LINEAR\n    const residual = filterBank.processBandComponents(source, scratchBands)\n    let shaped = residual * residualGain\n    for (let band = 0; band < BAND_COUNT; band += 1) {\n      shaped += scratchBands[band] * this.currentBandGains[band]\n    }\n    return shaped\n  }\n"""
new_next = """  private nextBandComponents(\n    generator: Xoshiro128StarStar,\n    filterBank: TenBandFilterBank,\n    scratchBands: Float64Array,\n  ): number {\n    const source = generator.nextBipolar() * SOURCE_NORMALIZATION_GAIN_LINEAR\n    return filterBank.processBandComponents(source, scratchBands)\n  }\n"""
replace(path, old_next, new_next)
replace(
    path,
    "    return resolveGainTargets(\n      this.sampleRate,\n      spectral,\n      this.gainStageStateValue,\n    )\n  }\n\n  private resolveAnimationAwareSafetyTarget(\n    estimatedShapedPeakLinear: number,\n  ): number {\n",
    "    return resolveGainTargets(\n      this.sampleRate,\n      spectral,\n      createGainStageState(\n        this.gainStageStateValue.masterGainDb,\n        this.gainStageStateValue.animationBandOffsetsDb,\n        new Float64Array(BAND_COUNT),\n      ),\n    )\n  }\n\n  private resolveAnimationAwareSafetyTarget(\n    baseBandGainsLinear: ArrayLike<number>,\n    ultrasonicResidualGainLinear: number,\n  ): number {\n",
)
replace(
    path,
    "    const normalPeak =\n      estimatedShapedPeakLinear * decibelsToGain(animationDepthDb)\n",
    "    const leftCalibration = channelCalibrationGainsLinear(\n      this.channelCalibrationStateValue.leftBandOffsetsDb,\n    )\n    const rightCalibration = channelCalibrationGainsLinear(\n      this.channelCalibrationStateValue.rightBandOffsetsDb,\n    )\n    const leftCombined = Float64Array.from(\n      baseBandGainsLinear,\n      (gain, index) => gain * leftCalibration[index],\n    )\n    const rightCombined = Float64Array.from(\n      baseBandGainsLinear,\n      (gain, index) => gain * rightCalibration[index],\n    )\n    const normalPeak =\n      Math.max(\n        estimateFilterBankPeakGain(\n          this.sampleRate,\n          leftCombined,\n          ultrasonicResidualGainLinear,\n        ),\n        estimateFilterBankPeakGain(\n          this.sampleRate,\n          rightCombined,\n          ultrasonicResidualGainLinear,\n        ),\n      ) * decibelsToGain(animationDepthDb)\n",
)
replace(
    path,
    "  private updateCalibrationStimulusTargets(): void {\n",
    "  private updateChannelCalibrationTargets(): void {\n    const left = channelCalibrationGainsLinear(\n      this.channelCalibrationStateValue.leftBandOffsetsDb,\n    )\n    const right = channelCalibrationGainsLinear(\n      this.channelCalibrationStateValue.rightBandOffsetsDb,\n    )\n    for (let band = 0; band < BAND_COUNT; band += 1) {\n      this.calibrationLeftBandSmoothers[band].setTarget(left[band])\n      this.calibrationRightBandSmoothers[band].setTarget(right[band])\n    }\n  }\n\n  private updateCalibrationStimulusTargets(): void {\n",
)
replace(
    path,
    "    this.calibrationStimulusWetSmoother.setTarget(\n      calibrationStimulusWetTarget(state),\n    )\n  }\n",
    "    this.calibrationStimulusWetSmoother.setTarget(\n      calibrationStimulusWetTarget(state),\n    )\n    const [leftMask, rightMask] = calibrationStimulusChannelTargets(state)\n    this.calibrationStimulusLeftMaskSmoother.setTarget(leftMask)\n    this.calibrationStimulusRightMaskSmoother.setTarget(rightMask)\n  }\n",
)
replace(
    path,
    "    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(\n      targets.estimatedShapedPeakLinear,\n    )\n",
    "    this.safetyPreGainTargetValue = this.resolveAnimationAwareSafetyTarget(\n      targets.bandGainsLinear,\n      targets.ultrasonicResidualGainLinear,\n    )\n",
)
