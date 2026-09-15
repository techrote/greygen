import { GreygenDspEngine } from '../dsp/engine'
import {
  AUDIO_PROTOCOL_VERSION,
  GREYGEN_PROCESSOR_NAME,
  type MainToWorkletMessage,
  type WorkletToMainMessage,
  deserializeAnimationState,
  deserializeGainStageState,
  deserializeSpectrumState,
  deserializeStereoWidthState,
  parseMainToWorkletMessage,
  serializeAnimationState,
} from '../protocol'

declare const sampleRate: number

declare const AudioWorkletProcessor: {
  new (): {
    readonly port: MessagePort
  }
}

type AudioWorkletProcessorConstructor = new () => {
  readonly port: MessagePort
}

declare function registerProcessor(
  name: string,
  processorCtor: AudioWorkletProcessorConstructor,
): void

const TELEMETRY_UPDATES_PER_SECOND = 10

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown DSP engine error'
}

class GreygenAudioProcessor extends AudioWorkletProcessor {
  private readonly engine = new GreygenDspEngine({ sampleRate })
  private readonly telemetryIntervalFrames = Math.max(
    128,
    Math.round(sampleRate / TELEMETRY_UPDATES_PER_SECOND),
  )
  private renderedFrames = 0
  private framesSinceTelemetry = 0
  private telemetrySequence = 0
  private initialized = false
  private stopped = false

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      this.handleMessage(event.data)
    }
  }

  private post(message: WorkletToMainMessage): void {
    this.port.postMessage(message)
  }

  private postError(
    code: 'invalid-message' | 'engine-error',
    message: string,
    requestId?: number,
  ): void {
    this.post({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'error',
      ...(requestId === undefined ? {} : { requestId }),
      code,
      message,
    })
  }

  private handleMessage(value: unknown): void {
    const message = parseMainToWorkletMessage(value)
    if (!message) {
      this.postError(
        'invalid-message',
        'Rejected invalid AudioWorklet control message.',
      )
      return
    }

    try {
      this.applyMessage(message)
    } catch (error) {
      this.postError('engine-error', errorMessage(error), message.requestId)
    }
  }

  private applyMessage(message: MainToWorkletMessage): void {
    switch (message.type) {
      case 'initialize':
        this.engine.reset({
          seed: message.seed,
          spectrumState: deserializeSpectrumState(message.spectrum),
          gainStageState: deserializeGainStageState(message.gainStage),
          stereoWidthState: deserializeStereoWidthState(message.stereoWidth),
          animationState: deserializeAnimationState(message.animation),
        })
        this.renderedFrames = 0
        this.framesSinceTelemetry = 0
        this.telemetrySequence = 0
        this.initialized = true
        this.stopped = false
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ready',
          requestId: message.requestId,
          sampleRate,
          targetId: this.engine.targetId,
          highBandMode: this.engine.highBandMode,
          stereoWidth: this.engine.stereoWidthState.width,
          animation: serializeAnimationState(this.engine.animationState),
        })
        return
      case 'set-spectrum':
        this.engine.setSpectrumState(deserializeSpectrumState(message.spectrum))
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'set-spectrum',
        })
        return
      case 'set-gain-stage':
        this.engine.setGainStageState(
          deserializeGainStageState(message.gainStage),
        )
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'set-gain-stage',
        })
        return
      case 'set-stereo-width':
        this.engine.setStereoWidthState(
          deserializeStereoWidthState(message.stereoWidth),
        )
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'set-stereo-width',
        })
        return
      case 'set-animation':
        this.engine.setAnimationState(
          deserializeAnimationState(message.animation),
        )
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'set-animation',
        })
        return
      case 'reset-seed':
        this.engine.setSeed(message.seed)
        this.renderedFrames = 0
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'reset-seed',
        })
        return
      case 'request-status':
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'status',
          requestId: message.requestId,
          sampleRate,
          targetId: this.engine.targetId,
          highBandMode: this.engine.highBandMode,
          stereoWidth: this.engine.stereoWidthState.width,
          animation: serializeAnimationState(this.engine.animationState),
          renderedFrames: this.renderedFrames,
        })
        return
      case 'stop':
        this.stopped = true
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'stopped',
          requestId: message.requestId,
        })
    }
  }

  private emitTelemetry(): void {
    const telemetry = this.engine.consumeTelemetry()
    this.telemetrySequence += 1
    if (!Number.isSafeInteger(this.telemetrySequence)) {
      this.telemetrySequence = 1
    }

    this.post({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'telemetry',
      sequence: this.telemetrySequence,
      frameCount: telemetry.frameCount,
      peakDbfs: telemetry.peakDbfs,
      rmsDbfs: telemetry.rmsDbfs,
      safetyPreGainDb: telemetry.safetyPreGainDb,
      safetyPreGainTargetDb: telemetry.safetyPreGainTargetDb,
      masterGainDb: telemetry.masterGainDb,
      guardInterventions: telemetry.guardInterventions,
      stereoWidth: telemetry.stereoWidth,
      stereoCorrelation: telemetry.stereoCorrelation,
    })
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0]
    if (!output || output.length === 0) {
      return !this.stopped
    }

    const left = output[0]
    if (!left) {
      return !this.stopped
    }
    const right = output[1]

    if (this.stopped) {
      left.fill(0)
      right?.fill(0)
      return false
    }

    if (!this.initialized) {
      left.fill(0)
      right?.fill(0)
      return true
    }

    if (right) {
      this.engine.renderStereo(left, right)
    } else {
      this.engine.renderMono(left)
    }
    this.renderedFrames += left.length
    this.framesSinceTelemetry += left.length
    if (this.framesSinceTelemetry >= this.telemetryIntervalFrames) {
      this.framesSinceTelemetry = 0
      this.emitTelemetry()
    }
    return true
  }
}

registerProcessor(GREYGEN_PROCESSOR_NAME, GreygenAudioProcessor)
