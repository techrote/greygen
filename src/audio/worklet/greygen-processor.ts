import { GreygenDspEngine } from '../dsp/engine'
import {
  AUDIO_PROTOCOL_VERSION,
  GREYGEN_PROCESSOR_NAME,
  type MainToWorkletMessage,
  type WorkletToMainMessage,
  deserializeSpectrumState,
  parseMainToWorkletMessage,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown DSP engine error'
}

class GreygenAudioProcessor extends AudioWorkletProcessor {
  private readonly engine = new GreygenDspEngine({ sampleRate })
  private renderedFrames = 0
  private active = true

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
        })
        this.renderedFrames = 0
        this.active = true
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ready',
          requestId: message.requestId,
          sampleRate,
          targetId: this.engine.targetId,
          highBandMode: this.engine.highBandMode,
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
          renderedFrames: this.renderedFrames,
        })
        return
      case 'stop':
        this.active = false
        this.post({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'stopped',
          requestId: message.requestId,
        })
    }
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0]
    if (!output || output.length === 0) {
      return this.active
    }

    const mono = output[0]
    if (!mono) {
      return this.active
    }

    if (!this.active) {
      mono.fill(0)
      return false
    }

    this.engine.renderMono(mono)
    this.renderedFrames += mono.length
    return true
  }
}

registerProcessor(GREYGEN_PROCESSOR_NAME, GreygenAudioProcessor)
