import { type AnimationState, createAnimationState } from './dsp/animation'
import {
  type ChannelCalibrationState,
  createChannelCalibrationState,
} from './dsp/channelCalibration'
import {
  type CalibrationStimulusState,
  createCalibrationStimulusState,
} from './dsp/calibrationStimulus'
import { DEFAULT_ENGINE_PRESET, DEFAULT_ENGINE_SEED } from './dsp/engine'
import type { HighBandMode } from './dsp/filterBank'
import { type GainStageState, createGainStageState } from './dsp/gainSafety'
import {
  type SpectralPresetId,
  type SpectrumState,
  createSpectrumState,
} from './dsp/spectra'
import {
  DEFAULT_STEREO_WIDTH,
  type StereoWidthState,
  createStereoWidthState,
  stereoWidthToCorrelation,
} from './dsp/stereo'
import {
  AUDIO_PROTOCOL_VERSION,
  type MainToWorkletMessage,
  type SerializedSpectrumState,
  type StatusMessage,
  type TelemetryMessage,
  type WorkletToMainMessage,
  isAudioSeed,
  parseWorkletToMainMessage,
  serializeAnimationState,
  serializeCalibrationStimulusState,
  serializeChannelCalibrationState,
  serializeGainStageState,
  serializeSpectrumState,
  serializeStereoWidthState,
} from './protocol'

export const DEFAULT_WORKLET_REQUEST_TIMEOUT_MS = 3000

export type AudioEngineStatus =
  | 'ready'
  | 'starting'
  | 'running'
  | 'suspended'
  | 'error'
  | 'stopped'
  | 'unsupported'

export type AudioCapability =
  | 'supported'
  | 'insecure-context'
  | 'audio-context-unavailable'
  | 'audio-worklet-node-unavailable'
  | 'audio-worklet-unavailable'

export type AudioEngineErrorCode =
  | Exclude<AudioCapability, 'supported'>
  | 'context-resume-failed'
  | 'module-load-failed'
  | 'node-create-failed'
  | 'processor-error'
  | 'protocol-error'
  | 'request-timeout'
  | 'control-failed'

export interface AudioEngineErrorInfo {
  readonly code: AudioEngineErrorCode
  readonly message: string
  readonly recoverable: boolean
}

export interface AudioEngineSnapshot {
  readonly status: AudioEngineStatus
  readonly capability: AudioCapability
  readonly error: AudioEngineErrorInfo | null
  readonly sampleRate: number | null
  readonly targetId: SpectralPresetId
  readonly highBandMode: HighBandMode | null
  readonly masterGainDb: number
  readonly stereoWidth: number
  readonly stereoCorrelation: number
  readonly telemetry: TelemetryMessage | null
}

export interface WorkletMessagePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null
  postMessage(message: MainToWorkletMessage): void
  start?(): void
  close?(): void
}

export interface AnalyzerNodePort {
  fftSize: number
  minDecibels: number
  maxDecibels: number
  smoothingTimeConstant: number
  readonly frequencyBinCount: number
  connect(destination: unknown): unknown
  disconnect(): void
  getFloatFrequencyData(target: Float32Array): void
}

export interface AnalyzerSpectrumFrame {
  readonly sampleRate: number
  readonly fftSize: number
  readonly minDb: number
  readonly maxDb: number
  readonly values: Float32Array
}

export interface AudioWorkletNodePort {
  readonly port: WorkletMessagePort
  connect(destination: unknown): unknown
  disconnect(): void
  addEventListener(type: 'processorerror', listener: () => void): void
  removeEventListener(type: 'processorerror', listener: () => void): void
}

export interface AudioContextPort {
  readonly sampleRate: number
  readonly destination: unknown
  readonly audioWorklet?: {
    addModule(moduleUrl: string): Promise<void>
  }
  readonly state: string
  createAnalyser?(): AnalyzerNodePort
  resume(): Promise<void>
  close(): Promise<void>
  addEventListener(type: 'statechange', listener: () => void): void
  removeEventListener(type: 'statechange', listener: () => void): void
}

export interface AudioEngineRuntime {
  readonly secureContext: boolean
  readonly audioContextSupported: boolean
  readonly audioWorkletNodeSupported: boolean
  readonly workletModuleUrl: string
  createAudioContext(): AudioContextPort
  createWorkletNode(context: AudioContextPort): AudioWorkletNodePort
}

type SnapshotListener = (snapshot: AudioEngineSnapshot) => void

type ExpectedResponseType = Exclude<
  WorkletToMainMessage['type'],
  'error' | 'telemetry'
>

type TimerHandle = ReturnType<typeof globalThis.setTimeout>

interface PendingRequest {
  readonly expectedType: ExpectedResponseType
  readonly resolve: (message: WorkletToMainMessage) => void
  readonly reject: (error: Error) => void
  readonly timeoutId: TimerHandle
}

class AudioEngineFailure extends Error {
  constructor(
    readonly code: AudioEngineErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly unsupported = false,
  ) {
    super(message)
  }
}

function initialCapability(runtime: AudioEngineRuntime): AudioCapability {
  if (!runtime.secureContext) {
    return 'insecure-context'
  }
  if (!runtime.audioContextSupported) {
    return 'audio-context-unavailable'
  }
  if (!runtime.audioWorkletNodeSupported) {
    return 'audio-worklet-node-unavailable'
  }
  return 'supported'
}

function capabilityError(
  capability: AudioCapability,
): AudioEngineErrorInfo | null {
  switch (capability) {
    case 'supported':
      return null
    case 'insecure-context':
      return {
        code: capability,
        message:
          'Browser audio processing requires a secure context. Open Greygen over HTTPS or localhost.',
        recoverable: false,
      }
    case 'audio-context-unavailable':
      return {
        code: capability,
        message:
          'This browser does not expose the Web Audio API required by Greygen.',
        recoverable: false,
      }
    case 'audio-worklet-node-unavailable':
      return {
        code: capability,
        message: 'This browser does not expose AudioWorkletNode support.',
        recoverable: false,
      }
    case 'audio-worklet-unavailable':
      return {
        code: capability,
        message:
          'This browser cannot load AudioWorklet processors in the current context.',
        recoverable: false,
      }
  }
}

function errorFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown browser audio error'
}

function canonicalSpectrum(state: SpectrumState): SerializedSpectrumState {
  return serializeSpectrumState(
    createSpectrumState(state.targetId, state.userBandOffsetsDb),
  )
}

function canonicalGainStage(state: GainStageState): GainStageState {
  return createGainStageState(
    state.masterGainDb,
    state.animationBandOffsetsDb,
    state.calibrationBandOffsetsDb,
  )
}

function canonicalChannelCalibration(
  state: ChannelCalibrationState,
): ChannelCalibrationState {
  return createChannelCalibrationState(
    state.leftBandOffsetsDb,
    state.rightBandOffsetsDb,
  )
}

function canonicalStereoWidth(state: StereoWidthState): StereoWidthState {
  return createStereoWidthState(state.width)
}

function canonicalAnimation(state: AnimationState): AnimationState {
  return createAnimationState(
    state.mode,
    state.seed,
    state.depthDb,
    state.speed,
    state.energyPreserving,
  )
}

function canonicalCalibrationStimulus(
  state: CalibrationStimulusState,
): CalibrationStimulusState {
  return createCalibrationStimulusState(
    state.mode,
    state.bandIndex,
    state.levelOffsetDb,
    state.channel,
  )
}

export class AudioEngine {
  private snapshotValue: AudioEngineSnapshot
  private readonly listeners = new Set<SnapshotListener>()
  private readonly pendingRequests = new Map<number, PendingRequest>()
  private context: AudioContextPort | null = null
  private node: AudioWorkletNodePort | null = null
  private analyzer: AnalyzerNodePort | null = null
  private analyzerBuffer: Float32Array | null = null
  private nextRequestId = 1
  private suppressContextState = false
  private seedValue: number
  private spectrumValue: SerializedSpectrumState
  private gainStageValue: GainStageState
  private channelCalibrationValue: ChannelCalibrationState
  private stereoWidthValue: StereoWidthState
  private animationValue: AnimationState

  constructor(
    private readonly runtime: AudioEngineRuntime,
    private readonly requestTimeoutMs = DEFAULT_WORKLET_REQUEST_TIMEOUT_MS,
    seed = DEFAULT_ENGINE_SEED,
    spectrumState: SpectrumState = createSpectrumState(DEFAULT_ENGINE_PRESET),
    gainStageState: GainStageState = createGainStageState(),
    stereoWidthState: StereoWidthState = createStereoWidthState(
      DEFAULT_STEREO_WIDTH,
    ),
    animationState: AnimationState = createAnimationState(),
    channelCalibrationState: ChannelCalibrationState = createChannelCalibrationState(
      gainStageState.calibrationBandOffsetsDb,
    ),
  ) {
    if (!isAudioSeed(seed)) {
      throw new RangeError('seed must be an unsigned 32-bit integer')
    }

    this.seedValue = seed
    this.spectrumValue = canonicalSpectrum(spectrumState)
    this.gainStageValue = canonicalGainStage(gainStageState)
    this.channelCalibrationValue = canonicalChannelCalibration(
      channelCalibrationState,
    )
    this.stereoWidthValue = canonicalStereoWidth(stereoWidthState)
    this.animationValue = canonicalAnimation(animationState)
    const capability = initialCapability(runtime)
    this.snapshotValue = Object.freeze({
      status: capability === 'supported' ? 'ready' : 'unsupported',
      capability,
      error: capabilityError(capability),
      sampleRate: null,
      targetId: this.spectrumValue.targetId,
      highBandMode: null,
      masterGainDb: this.gainStageValue.masterGainDb,
      stereoWidth: this.stereoWidthValue.width,
      stereoCorrelation: stereoWidthToCorrelation(this.stereoWidthValue.width),
      telemetry: null,
    })
  }

  getSnapshot(): AudioEngineSnapshot {
    return this.snapshotValue
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async startFromUserGesture(): Promise<void> {
    if (this.snapshotValue.capability !== 'supported') {
      return
    }
    if (
      this.snapshotValue.status === 'starting' ||
      this.snapshotValue.status === 'running'
    ) {
      return
    }

    if (this.hasOwnedResources()) {
      await this.cleanupResources()
    }

    this.setSnapshot({
      status: 'starting',
      capability: 'supported',
      error: null,
      sampleRate: null,
      targetId: this.spectrumValue.targetId,
      highBandMode: null,
      masterGainDb: this.gainStageValue.masterGainDb,
      stereoWidth: this.stereoWidthValue.width,
      stereoCorrelation: stereoWidthToCorrelation(this.stereoWidthValue.width),
      telemetry: null,
    })

    try {
      const context = this.runtime.createAudioContext()
      this.context = context
      context.addEventListener('statechange', this.handleContextStateChange)

      if (!context.audioWorklet) {
        throw new AudioEngineFailure(
          'audio-worklet-unavailable',
          'This browser cannot load AudioWorklet processors in the current context.',
          false,
          true,
        )
      }

      if (context.state !== 'running') {
        try {
          await context.resume()
        } catch (error) {
          throw new AudioEngineFailure(
            'context-resume-failed',
            `The browser refused to start audio: ${errorFromUnknown(error)}`,
            true,
          )
        }
      }

      try {
        await context.audioWorklet.addModule(this.runtime.workletModuleUrl)
      } catch (error) {
        throw new AudioEngineFailure(
          'module-load-failed',
          `The audio processor module could not be loaded: ${errorFromUnknown(error)}`,
          true,
        )
      }

      let node: AudioWorkletNodePort
      try {
        node = this.runtime.createWorkletNode(context)
      } catch (error) {
        throw new AudioEngineFailure(
          'node-create-failed',
          `The audio processor could not be created: ${errorFromUnknown(error)}`,
          true,
        )
      }

      this.node = node
      node.addEventListener('processorerror', this.handleProcessorError)
      node.port.onmessage = this.handlePortMessage
      node.port.start?.()
      if (context.createAnalyser) {
        const analyzer = context.createAnalyser()
        analyzer.fftSize = 2048
        analyzer.minDecibels = -120
        analyzer.maxDecibels = 0
        analyzer.smoothingTimeConstant = 0.72
        this.analyzer = analyzer
        this.analyzerBuffer = new Float32Array(analyzer.frequencyBinCount)
        node.connect(analyzer)
        analyzer.connect(context.destination)
      } else {
        node.connect(context.destination)
      }

      const response = await this.request(
        {
          version: AUDIO_PROTOCOL_VERSION,
          type: 'initialize',
          requestId: this.allocateRequestId(),
          seed: this.seedValue,
          spectrum: this.spectrumValue,
          gainStage: serializeGainStageState(this.gainStageValue),
          channelCalibration: serializeChannelCalibrationState(
            this.channelCalibrationValue,
          ),
          stereoWidth: serializeStereoWidthState(this.stereoWidthValue),
          animation: serializeAnimationState(this.animationValue),
        },
        'ready',
      )

      if (response.type !== 'ready') {
        throw new AudioEngineFailure(
          'protocol-error',
          'The audio processor returned an unexpected initialization response.',
          true,
        )
      }

      this.setSnapshot({
        status: context.state === 'running' ? 'running' : 'suspended',
        capability: 'supported',
        error: null,
        sampleRate: response.sampleRate,
        targetId: response.targetId,
        highBandMode: response.highBandMode,
        masterGainDb: this.gainStageValue.masterGainDb,
        stereoWidth: response.stereoWidth,
        stereoCorrelation: stereoWidthToCorrelation(response.stereoWidth),
        telemetry: null,
      })
    } catch (error) {
      await this.fail(error)
    }
  }

  async resumeFromUserGesture(): Promise<void> {
    if (this.snapshotValue.capability !== 'supported') {
      return
    }
    if (!this.context) {
      await this.startFromUserGesture()
      return
    }

    try {
      await this.context.resume()
      this.setSnapshot({
        ...this.snapshotValue,
        status: this.context.state === 'running' ? 'running' : 'suspended',
        error: null,
      })
    } catch (error) {
      this.setSnapshot({
        ...this.snapshotValue,
        status: 'error',
        error: {
          code: 'context-resume-failed',
          message: `The browser could not resume audio: ${errorFromUnknown(error)}`,
          recoverable: true,
        },
      })
    }
  }

  async stop(): Promise<void> {
    if (this.snapshotValue.status === 'unsupported') {
      return
    }

    if (this.node) {
      try {
        await this.request(
          {
            version: AUDIO_PROTOCOL_VERSION,
            type: 'stop',
            requestId: this.allocateRequestId(),
          },
          'stopped',
          Math.min(this.requestTimeoutMs, 750),
        )
      } catch {
        // Cleanup is authoritative even when the processor cannot acknowledge.
      }
    }

    await this.cleanupResources()
    this.setSnapshot({
      status: 'stopped',
      capability: 'supported',
      error: null,
      sampleRate: null,
      targetId: this.spectrumValue.targetId,
      highBandMode: null,
      masterGainDb: this.gainStageValue.masterGainDb,
      stereoWidth: this.stereoWidthValue.width,
      stereoCorrelation: stereoWidthToCorrelation(this.stereoWidthValue.width),
      telemetry: null,
    })
  }

  async dispose(): Promise<void> {
    await this.cleanupResources()
  }

  async setSpectrumState(state: SpectrumState): Promise<void> {
    const serialized = canonicalSpectrum(state)
    this.spectrumValue = serialized

    if (!this.node) {
      this.setSnapshot({ ...this.snapshotValue, targetId: serialized.targetId })
      return
    }

    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-spectrum',
        requestId: this.allocateRequestId(),
        spectrum: serialized,
      },
      'ack',
    )
    if (response.type !== 'ack' || response.command !== 'set-spectrum') {
      throw new Error('Unexpected set-spectrum acknowledgement')
    }
    this.setSnapshot({ ...this.snapshotValue, targetId: serialized.targetId })
  }

  async setGainStageState(state: GainStageState): Promise<void> {
    const canonical = canonicalGainStage(state)
    this.gainStageValue = canonical

    if (!this.node) {
      this.setSnapshot({
        ...this.snapshotValue,
        masterGainDb: canonical.masterGainDb,
      })
      return
    }

    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-gain-stage',
        requestId: this.allocateRequestId(),
        gainStage: serializeGainStageState(canonical),
      },
      'ack',
    )
    if (response.type !== 'ack' || response.command !== 'set-gain-stage') {
      throw new Error('Unexpected set-gain-stage acknowledgement')
    }
    this.setSnapshot({
      ...this.snapshotValue,
      masterGainDb: canonical.masterGainDb,
    })
  }

  async setMasterGainDb(masterGainDb: number): Promise<void> {
    await this.setGainStageState(
      createGainStageState(
        masterGainDb,
        this.gainStageValue.animationBandOffsetsDb,
        this.gainStageValue.calibrationBandOffsetsDb,
      ),
    )
  }

  async setCalibrationBandOffsetsDb(values: ArrayLike<number>): Promise<void> {
    await this.setCalibrationChannelOffsetsDb(values, values)
  }

  async setChannelCalibrationState(
    state: ChannelCalibrationState,
  ): Promise<void> {
    const canonical = canonicalChannelCalibration(state)
    this.channelCalibrationValue = canonical
    if (!this.node) {
      return
    }
    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-channel-calibration',
        requestId: this.allocateRequestId(),
        channelCalibration: serializeChannelCalibrationState(canonical),
      },
      'ack',
    )
    if (
      response.type !== 'ack' ||
      response.command !== 'set-channel-calibration'
    ) {
      throw new Error('Unexpected set-channel-calibration acknowledgement')
    }
  }

  async setCalibrationChannelOffsetsDb(
    leftBandOffsetsDb: ArrayLike<number>,
    rightBandOffsetsDb: ArrayLike<number>,
  ): Promise<void> {
    await this.setChannelCalibrationState(
      createChannelCalibrationState(leftBandOffsetsDb, rightBandOffsetsDb),
    )
  }

  async setStereoWidthState(state: StereoWidthState): Promise<void> {
    const canonical = canonicalStereoWidth(state)
    this.stereoWidthValue = canonical

    if (!this.node) {
      this.setSnapshot({
        ...this.snapshotValue,
        stereoWidth: canonical.width,
        stereoCorrelation: stereoWidthToCorrelation(canonical.width),
      })
      return
    }

    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-stereo-width',
        requestId: this.allocateRequestId(),
        stereoWidth: serializeStereoWidthState(canonical),
      },
      'ack',
    )
    if (response.type !== 'ack' || response.command !== 'set-stereo-width') {
      throw new Error('Unexpected set-stereo-width acknowledgement')
    }
    this.setSnapshot({
      ...this.snapshotValue,
      stereoWidth: canonical.width,
      stereoCorrelation: stereoWidthToCorrelation(canonical.width),
    })
  }

  async setStereoWidth(width: number): Promise<void> {
    await this.setStereoWidthState(createStereoWidthState(width))
  }

  async setAnimationState(state: AnimationState): Promise<void> {
    const canonical = canonicalAnimation(state)
    this.animationValue = canonical

    if (!this.node) {
      return
    }

    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-animation',
        requestId: this.allocateRequestId(),
        animation: serializeAnimationState(canonical),
      },
      'ack',
    )
    if (response.type !== 'ack' || response.command !== 'set-animation') {
      throw new Error('Unexpected set-animation acknowledgement')
    }
  }

  async setCalibrationStimulusState(
    state: CalibrationStimulusState,
  ): Promise<void> {
    const canonical = canonicalCalibrationStimulus(state)
    if (!this.node && canonical.mode !== 'inactive') {
      throw new Error('Calibration stimulus requires running audio')
    }
    if (!this.node) {
      return
    }
    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-calibration-stimulus',
        requestId: this.allocateRequestId(),
        calibrationStimulus: serializeCalibrationStimulusState(canonical),
      },
      'ack',
    )
    if (
      response.type !== 'ack' ||
      response.command !== 'set-calibration-stimulus'
    ) {
      throw new Error('Unexpected set-calibration-stimulus acknowledgement')
    }
  }

  async setCalibrationStimulusBand(
    bandIndex: number,
    levelOffsetDb: number,
    channel: CalibrationStimulusState['channel'] = 'both',
  ): Promise<void> {
    await this.setCalibrationStimulusState(
      createCalibrationStimulusState('band', bandIndex, levelOffsetDb, channel),
    )
  }

  async silenceCalibrationStimulus(): Promise<void> {
    await this.setCalibrationStimulusState(
      createCalibrationStimulusState('silent'),
    )
  }

  async endCalibrationStimulus(): Promise<void> {
    await this.setCalibrationStimulusState(createCalibrationStimulusState())
  }

  async resetSeed(seed: number): Promise<void> {
    if (!isAudioSeed(seed)) {
      throw new RangeError('seed must be an unsigned 32-bit integer')
    }
    this.seedValue = seed

    if (!this.node) {
      return
    }

    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'reset-seed',
        requestId: this.allocateRequestId(),
        seed,
      },
      'ack',
    )
    if (response.type !== 'ack' || response.command !== 'reset-seed') {
      throw new Error('Unexpected reset-seed acknowledgement')
    }
  }

  readAnalyzerFrame(): AnalyzerSpectrumFrame | null {
    const analyzer = this.analyzer
    const buffer = this.analyzerBuffer
    const context = this.context
    if (
      !analyzer ||
      !buffer ||
      !context ||
      this.snapshotValue.status !== 'running'
    ) {
      return null
    }
    analyzer.getFloatFrequencyData(buffer)
    return {
      sampleRate: context.sampleRate,
      fftSize: analyzer.fftSize,
      minDb: analyzer.minDecibels,
      maxDb: analyzer.maxDecibels,
      values: buffer,
    }
  }

  async requestStatus(): Promise<StatusMessage> {
    if (!this.node) {
      throw new Error('Audio engine is not running')
    }
    const response = await this.request(
      {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'request-status',
        requestId: this.allocateRequestId(),
      },
      'status',
    )
    if (response.type !== 'status') {
      throw new Error('Unexpected status response')
    }
    return response
  }

  private hasOwnedResources(): boolean {
    return (
      this.context !== null ||
      this.node !== null ||
      this.analyzer !== null ||
      this.pendingRequests.size > 0
    )
  }

  private setSnapshot(snapshot: AudioEngineSnapshot): void {
    this.snapshotValue = Object.freeze(snapshot)
    for (const listener of this.listeners) {
      listener(this.snapshotValue)
    }
  }

  private allocateRequestId(): number {
    const requestId = this.nextRequestId
    this.nextRequestId += 1
    if (!Number.isSafeInteger(this.nextRequestId)) {
      this.nextRequestId = 1
    }
    return requestId
  }

  private request(
    message: MainToWorkletMessage,
    expectedType: ExpectedResponseType,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<WorkletToMainMessage> {
    const node = this.node
    if (!node) {
      return Promise.reject(new Error('Audio worklet node is unavailable'))
    }

    return new Promise((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        this.pendingRequests.delete(message.requestId)
        reject(
          new AudioEngineFailure(
            'request-timeout',
            `Audio processor did not answer ${message.type} in time.`,
            true,
          ),
        )
      }, timeoutMs)

      this.pendingRequests.set(message.requestId, {
        expectedType,
        resolve,
        reject,
        timeoutId,
      })

      try {
        node.port.postMessage(message)
      } catch (error) {
        globalThis.clearTimeout(timeoutId)
        this.pendingRequests.delete(message.requestId)
        reject(
          new AudioEngineFailure(
            'control-failed',
            `Could not send ${message.type} to the audio processor: ${errorFromUnknown(error)}`,
            true,
          ),
        )
      }
    })
  }

  private readonly handlePortMessage = (event: {
    readonly data: unknown
  }): void => {
    const message = parseWorkletToMainMessage(event.data)
    if (!message) {
      void this.fail(
        new AudioEngineFailure(
          'protocol-error',
          'Received an invalid message from the audio processor.',
          true,
        ),
      )
      return
    }

    if (message.type === 'telemetry') {
      this.setSnapshot({
        ...this.snapshotValue,
        stereoWidth: message.stereoWidth,
        stereoCorrelation: message.stereoCorrelation,
        telemetry: message,
      })
      return
    }

    if (message.type === 'error') {
      if (message.requestId !== undefined) {
        const pending = this.pendingRequests.get(message.requestId)
        if (pending) {
          globalThis.clearTimeout(pending.timeoutId)
          this.pendingRequests.delete(message.requestId)
          pending.reject(new Error(message.message))
          return
        }
      }
      void this.fail(
        new AudioEngineFailure(
          'protocol-error',
          `Audio processor error: ${message.message}`,
          true,
        ),
      )
      return
    }

    const pending = this.pendingRequests.get(message.requestId)
    if (!pending) {
      return
    }

    globalThis.clearTimeout(pending.timeoutId)
    this.pendingRequests.delete(message.requestId)
    if (message.type !== pending.expectedType) {
      pending.reject(
        new AudioEngineFailure(
          'protocol-error',
          `Expected ${pending.expectedType} but received ${message.type}.`,
          true,
        ),
      )
      return
    }
    pending.resolve(message)
  }

  private readonly handleContextStateChange = (): void => {
    if (this.suppressContextState || !this.context) {
      return
    }
    if (this.snapshotValue.status === 'starting') {
      return
    }

    if (this.context.state === 'running' && this.node) {
      this.setSnapshot({
        ...this.snapshotValue,
        status: 'running',
        error: null,
      })
      return
    }

    if (
      (this.context.state === 'suspended' ||
        this.context.state === 'interrupted') &&
      this.node
    ) {
      this.setSnapshot({ ...this.snapshotValue, status: 'suspended' })
      return
    }

    if (this.context.state === 'closed') {
      this.setSnapshot({
        ...this.snapshotValue,
        status: 'stopped',
        sampleRate: null,
        highBandMode: null,
        telemetry: null,
      })
    }
  }

  private readonly handleProcessorError = (): void => {
    void this.fail(
      new AudioEngineFailure(
        'processor-error',
        'The browser audio processor stopped unexpectedly. You can retry from a fresh audio context.',
        true,
      ),
    )
  }

  private async fail(error: unknown): Promise<void> {
    const failure =
      error instanceof AudioEngineFailure
        ? error
        : new AudioEngineFailure(
            'control-failed',
            errorFromUnknown(error),
            true,
          )

    await this.cleanupResources()
    const capability: AudioCapability = failure.unsupported
      ? (failure.code as AudioCapability)
      : this.snapshotValue.capability
    this.setSnapshot({
      status: failure.unsupported ? 'unsupported' : 'error',
      capability,
      error: {
        code: failure.code,
        message: failure.message,
        recoverable: failure.recoverable,
      },
      sampleRate: null,
      targetId: this.spectrumValue.targetId,
      highBandMode: null,
      masterGainDb: this.gainStageValue.masterGainDb,
      stereoWidth: this.stereoWidthValue.width,
      stereoCorrelation: stereoWidthToCorrelation(this.stereoWidthValue.width),
      telemetry: null,
    })
  }

  private async cleanupResources(): Promise<void> {
    this.suppressContextState = true

    for (const pending of this.pendingRequests.values()) {
      globalThis.clearTimeout(pending.timeoutId)
      pending.reject(
        new Error('Audio engine was stopped before the request completed'),
      )
    }
    this.pendingRequests.clear()

    if (this.node) {
      this.node.removeEventListener('processorerror', this.handleProcessorError)
      this.node.port.onmessage = null
      this.node.port.close?.()
      try {
        this.node.disconnect()
      } catch {
        // Disconnect may throw if the browser already tore the graph down.
      }
    }

    if (this.analyzer) {
      try {
        this.analyzer.disconnect()
      } catch {
        // Disconnect may throw if the browser already tore the graph down.
      }
    }

    const context = this.context
    if (context) {
      context.removeEventListener('statechange', this.handleContextStateChange)
      if (context.state !== 'closed') {
        try {
          await context.close()
        } catch {
          // Cleanup is best-effort; lifecycle state remains explicit in the facade.
        }
      }
    }

    this.node = null
    this.analyzer = null
    this.analyzerBuffer = null
    this.context = null
    this.suppressContextState = false
  }
}
