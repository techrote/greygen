import { describe, expect, it } from 'vitest'
import {
  AudioEngine,
  type AnalyzerNodePort,
  type AudioContextPort,
  type AudioEngineRuntime,
  type AudioWorkletNodePort,
  type WorkletMessagePort,
} from '../../src/audio/AudioEngine'
import {
  AUDIO_PROTOCOL_VERSION,
  type MainToWorkletMessage,
  type WorkletToMainMessage,
} from '../../src/audio/protocol'

class TrackingAnalyzer implements AnalyzerNodePort {
  fftSize = 2048
  minDecibels = -120
  maxDecibels = 0
  smoothingTimeConstant = 0.72
  readonly frequencyBinCount = 1024
  connectCount = 0
  disconnectCount = 0
  readCount = 0

  connect(destination: unknown): unknown {
    this.connectCount += 1
    return destination
  }

  disconnect(): void {
    this.disconnectCount += 1
  }

  getFloatFrequencyData(target: Float32Array): void {
    this.readCount += 1
    target.fill(-60)
  }
}

class TrackingPort implements WorkletMessagePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null
  closeCount = 0

  postMessage(message: MainToWorkletMessage): void {
    let response: WorkletToMainMessage | null = null
    if (message.type === 'initialize') {
      response = {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'ready',
        requestId: message.requestId,
        sampleRate: 48_000,
        targetId: message.spectrum.targetId,
        highBandMode: 'degraded-high-shelf',
        stereoWidth: message.stereoWidth.width,
        animation: message.animation,
      }
    } else if (message.type === 'stop') {
      response = {
        version: AUDIO_PROTOCOL_VERSION,
        type: 'stopped',
        requestId: message.requestId,
      }
    }

    if (response) {
      queueMicrotask(() => this.onmessage?.({ data: response }))
    }
  }

  close(): void {
    this.closeCount += 1
  }
}

class TrackingNode implements AudioWorkletNodePort {
  readonly port = new TrackingPort()
  connectCount = 0
  disconnectCount = 0

  connect(destination: unknown): unknown {
    this.connectCount += 1
    return destination
  }

  disconnect(): void {
    this.disconnectCount += 1
  }

  addEventListener(_type: 'processorerror', _listener: () => void): void {}
  removeEventListener(_type: 'processorerror', _listener: () => void): void {}
}

class TrackingContext implements AudioContextPort {
  readonly sampleRate = 48_000
  readonly destination = {}
  state = 'suspended'
  closeCount = 0
  readonly analyzer = new TrackingAnalyzer()
  readonly audioWorklet = {
    addModule: async (_moduleUrl: string): Promise<void> => {},
  }

  createAnalyser(): AnalyzerNodePort {
    return this.analyzer
  }

  async resume(): Promise<void> {
    this.state = 'running'
  }

  async close(): Promise<void> {
    this.closeCount += 1
    this.state = 'closed'
  }

  addEventListener(_type: 'statechange', _listener: () => void): void {}
  removeEventListener(_type: 'statechange', _listener: () => void): void {}
}

class TrackingRuntime implements AudioEngineRuntime {
  readonly secureContext = true
  readonly audioContextSupported = true
  readonly audioWorkletNodeSupported = true
  readonly workletModuleUrl = '/assets/greygen-worklet.js'
  readonly contexts: TrackingContext[] = []
  readonly nodes: TrackingNode[] = []

  createAudioContext(): AudioContextPort {
    const context = new TrackingContext()
    this.contexts.push(context)
    return context
  }

  createWorkletNode(_context: AudioContextPort): AudioWorkletNodePort {
    const node = new TrackingNode()
    this.nodes.push(node)
    return node
  }
}

describe('AudioEngine conformance lifecycle', () => {
  it('samples the analyzer without disconnecting the live output graph', async () => {
    const runtime = new TrackingRuntime()
    const engine = new AudioEngine(runtime)

    await engine.startFromUserGesture()
    const context = runtime.contexts[0]
    const analyzer = context.analyzer

    expect(analyzer.connectCount).toBe(1)
    expect(analyzer.disconnectCount).toBe(0)

    for (let index = 0; index < 8; index += 1) {
      const frame = engine.readAnalyzerFrame()
      expect(frame?.sampleRate).toBe(48_000)
      expect(frame?.values[0]).toBe(-60)
    }

    expect(analyzer.readCount).toBe(8)
    expect(analyzer.disconnectCount).toBe(0)

    await engine.stop()
    expect(analyzer.disconnectCount).toBe(1)
  })

  it('repeated start/stop releases each context, node, analyzer, and port exactly once', async () => {
    const runtime = new TrackingRuntime()
    const engine = new AudioEngine(runtime)

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await engine.startFromUserGesture()
      expect(engine.getSnapshot().status).toBe('running')
      expect(engine.readAnalyzerFrame()).not.toBeNull()

      await engine.stop()
      expect(engine.getSnapshot().status).toBe('stopped')
    }

    expect(runtime.contexts).toHaveLength(5)
    expect(runtime.nodes).toHaveLength(5)
    for (const context of runtime.contexts) {
      expect(context.closeCount).toBe(1)
      expect(context.analyzer.disconnectCount).toBe(1)
    }
    for (const node of runtime.nodes) {
      expect(node.disconnectCount).toBe(1)
      expect(node.port.closeCount).toBe(1)
    }
  })
})
