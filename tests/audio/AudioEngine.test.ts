import { describe, expect, it } from 'vitest'
import {
  AudioEngine,
  type AudioContextPort,
  type AudioEngineRuntime,
  type AudioWorkletNodePort,
  type WorkletMessagePort,
} from '../../src/audio/AudioEngine'
import { createGainStageState } from '../../src/audio/dsp/gainSafety'
import { createSpectrumState } from '../../src/audio/dsp/spectra'
import {
  AUDIO_PROTOCOL_VERSION,
  type MainToWorkletMessage,
  type TelemetryMessage,
  type WorkletToMainMessage,
} from '../../src/audio/protocol'

class MockMessagePort implements WorkletMessagePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null
  closed = false
  private targetId: 'white' | 'pink' | 'brown' | 'grey' = 'grey'
  private masterGainDb = -26.020599913279625

  constructor(private readonly sampleRate: number) {}

  postMessage(message: MainToWorkletMessage): void {
    let response: WorkletToMainMessage
    switch (message.type) {
      case 'initialize':
        this.targetId = message.spectrum.targetId
        this.masterGainDb = message.gainStage.masterGainDb
        response = {
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ready',
          requestId: message.requestId,
          sampleRate: this.sampleRate,
          targetId: this.targetId,
          highBandMode: 'degraded-high-shelf',
        }
        break
      case 'set-spectrum':
        this.targetId = message.spectrum.targetId
        response = {
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'set-spectrum',
        }
        break
      case 'set-gain-stage':
        this.masterGainDb = message.gainStage.masterGainDb
        response = {
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'set-gain-stage',
        }
        break
      case 'reset-seed':
        response = {
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: message.requestId,
          command: 'reset-seed',
        }
        break
      case 'request-status':
        response = {
          version: AUDIO_PROTOCOL_VERSION,
          type: 'status',
          requestId: message.requestId,
          sampleRate: this.sampleRate,
          targetId: this.targetId,
          highBandMode: 'degraded-high-shelf',
          renderedFrames: 256,
        }
        break
      case 'stop':
        response = {
          version: AUDIO_PROTOCOL_VERSION,
          type: 'stopped',
          requestId: message.requestId,
        }
        break
    }

    queueMicrotask(() => {
      this.onmessage?.({ data: response })
    })
  }

  emitTelemetry(sequence = 1): void {
    const message: TelemetryMessage = {
      version: AUDIO_PROTOCOL_VERSION,
      type: 'telemetry',
      sequence,
      frameCount: 4800,
      peakDbfs: -9.2,
      rmsDbfs: -22.4,
      safetyPreGainDb: -1,
      safetyPreGainTargetDb: -1,
      masterGainDb: this.masterGainDb,
      guardInterventions: 0,
    }
    this.onmessage?.({ data: message })
  }

  close(): void {
    this.closed = true
  }
}

class MockWorkletNode implements AudioWorkletNodePort {
  readonly port: MockMessagePort
  disconnected = false
  private readonly processorErrorListeners = new Set<() => void>()

  constructor(sampleRate: number) {
    this.port = new MockMessagePort(sampleRate)
  }

  connect(destination: unknown): unknown {
    return destination
  }

  disconnect(): void {
    this.disconnected = true
  }

  addEventListener(_type: 'processorerror', listener: () => void): void {
    this.processorErrorListeners.add(listener)
  }

  removeEventListener(_type: 'processorerror', listener: () => void): void {
    this.processorErrorListeners.delete(listener)
  }

  triggerProcessorError(): void {
    for (const listener of this.processorErrorListeners) {
      listener()
    }
  }
}

class MockAudioContext implements AudioContextPort {
  readonly sampleRate = 48_000
  readonly destination = {}
  state = 'suspended'
  closed = false
  moduleUrl: string | null = null
  private readonly stateListeners = new Set<() => void>()

  readonly audioWorklet = {
    addModule: async (moduleUrl: string): Promise<void> => {
      this.moduleUrl = moduleUrl
      if (this.failModuleLoad) {
        throw new Error('fixture module failure')
      }
    },
  }

  constructor(private readonly failModuleLoad: boolean) {}

  async resume(): Promise<void> {
    this.state = 'running'
    this.emitStateChange()
  }

  async close(): Promise<void> {
    this.state = 'closed'
    this.closed = true
    this.emitStateChange()
  }

  addEventListener(_type: 'statechange', listener: () => void): void {
    this.stateListeners.add(listener)
  }

  removeEventListener(_type: 'statechange', listener: () => void): void {
    this.stateListeners.delete(listener)
  }

  setExternalState(state: string): void {
    this.state = state
    this.emitStateChange()
  }

  private emitStateChange(): void {
    for (const listener of this.stateListeners) {
      listener()
    }
  }
}

class MockRuntime implements AudioEngineRuntime {
  secureContext = true
  audioContextSupported = true
  audioWorkletNodeSupported = true
  readonly workletModuleUrl = '/assets/greygen-worklet.js'
  createCount = 0
  failModuleLoad = false
  lastContext: MockAudioContext | null = null
  lastNode: MockWorkletNode | null = null

  createAudioContext(): AudioContextPort {
    this.createCount += 1
    const context = new MockAudioContext(this.failModuleLoad)
    this.lastContext = context
    return context
  }

  createWorkletNode(context: AudioContextPort): AudioWorkletNodePort {
    const node = new MockWorkletNode(context.sampleRate)
    this.lastNode = node
    return node
  }
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}

describe('AudioEngine lifecycle', () => {
  it('does not create an AudioContext until the explicit start path is invoked', async () => {
    const runtime = new MockRuntime()
    const engine = new AudioEngine(runtime)

    expect(engine.getSnapshot().status).toBe('ready')
    expect(runtime.createCount).toBe(0)

    await engine.startFromUserGesture()

    expect(runtime.createCount).toBe(1)
    expect(engine.getSnapshot()).toMatchObject({
      status: 'running',
      sampleRate: 48_000,
      targetId: 'grey',
      highBandMode: 'degraded-high-shelf',
      telemetry: null,
    })
    expect(runtime.lastContext?.moduleUrl).toBe(runtime.workletModuleUrl)

    await engine.stop()
    expect(engine.getSnapshot().status).toBe('stopped')
    expect(runtime.lastContext?.closed).toBe(true)
    expect(runtime.lastNode?.disconnected).toBe(true)
    expect(runtime.lastNode?.port.closed).toBe(true)
  })

  it('round-trips spectrum, gain controls, seed, and status through protocol v2', async () => {
    const runtime = new MockRuntime()
    const engine = new AudioEngine(runtime)
    await engine.startFromUserGesture()

    await engine.setSpectrumState(createSpectrumState('pink'))
    await engine.setGainStageState(createGainStageState(-12))
    await engine.resetSeed(1234)
    const status = await engine.requestStatus()

    expect(status).toMatchObject({
      type: 'status',
      targetId: 'pink',
      renderedFrames: 256,
    })
    expect(engine.getSnapshot()).toMatchObject({
      targetId: 'pink',
      masterGainDb: -12,
    })
  })

  it('accepts bounded unsolicited dBFS telemetry without request bookkeeping', async () => {
    const runtime = new MockRuntime()
    const engine = new AudioEngine(runtime)
    await engine.startFromUserGesture()
    await engine.setMasterGainDb(-18)

    runtime.lastNode?.port.emitTelemetry(7)

    expect(engine.getSnapshot().telemetry).toMatchObject({
      type: 'telemetry',
      sequence: 7,
      peakDbfs: -9.2,
      rmsDbfs: -22.4,
      masterGainDb: -18,
      guardInterventions: 0,
    })
  })

  it('maps browser interruption to suspended and resumes only on the resume path', async () => {
    const runtime = new MockRuntime()
    const engine = new AudioEngine(runtime)
    await engine.startFromUserGesture()

    runtime.lastContext?.setExternalState('interrupted')
    expect(engine.getSnapshot().status).toBe('suspended')

    await engine.resumeFromUserGesture()
    expect(engine.getSnapshot().status).toBe('running')
  })

  it('surfaces insecure-context capability without attempting audio creation', async () => {
    const runtime = new MockRuntime()
    runtime.secureContext = false
    const engine = new AudioEngine(runtime)

    expect(engine.getSnapshot()).toMatchObject({
      status: 'unsupported',
      capability: 'insecure-context',
      error: { code: 'insecure-context', recoverable: false },
    })

    await engine.startFromUserGesture()
    expect(runtime.createCount).toBe(0)
  })

  it('surfaces module load failures and closes the failed context', async () => {
    const runtime = new MockRuntime()
    runtime.failModuleLoad = true
    const engine = new AudioEngine(runtime)

    await engine.startFromUserGesture()

    expect(engine.getSnapshot()).toMatchObject({
      status: 'error',
      error: { code: 'module-load-failed', recoverable: true },
    })
    expect(runtime.lastContext?.closed).toBe(true)
  })

  it('turns processorerror into an actionable recoverable error', async () => {
    const runtime = new MockRuntime()
    const engine = new AudioEngine(runtime)
    await engine.startFromUserGesture()

    runtime.lastNode?.triggerProcessorError()
    await flushAsyncWork()

    expect(engine.getSnapshot()).toMatchObject({
      status: 'error',
      error: { code: 'processor-error', recoverable: true },
    })
    expect(runtime.lastContext?.closed).toBe(true)
  })
})
