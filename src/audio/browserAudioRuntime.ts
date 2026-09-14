import workletModuleUrl from './worklet/greygen-processor.ts?worker&url'
import {
  AudioEngine,
  type AudioContextPort,
  type AudioEngineRuntime,
  type AudioWorkletNodePort,
} from './AudioEngine'
import { GREYGEN_PROCESSOR_NAME } from './protocol'

type BrowserGlobal = typeof globalThis & {
  readonly webkitAudioContext?: typeof AudioContext
}

export function createBrowserAudioRuntime(): AudioEngineRuntime {
  const browserGlobal = globalThis as BrowserGlobal
  const AudioContextConstructor =
    browserGlobal.AudioContext ?? browserGlobal.webkitAudioContext
  const AudioWorkletNodeConstructor = browserGlobal.AudioWorkletNode

  return {
    secureContext: browserGlobal.isSecureContext === true,
    audioContextSupported: typeof AudioContextConstructor === 'function',
    audioWorkletNodeSupported:
      typeof AudioWorkletNodeConstructor === 'function',
    workletModuleUrl,
    createAudioContext(): AudioContextPort {
      if (!AudioContextConstructor) {
        throw new Error('AudioContext is unavailable')
      }
      return new AudioContextConstructor({
        latencyHint: 'interactive',
      }) as unknown as AudioContextPort
    },
    createWorkletNode(context: AudioContextPort): AudioWorkletNodePort {
      if (!AudioWorkletNodeConstructor) {
        throw new Error('AudioWorkletNode is unavailable')
      }
      return new AudioWorkletNodeConstructor(
        context as unknown as AudioContext,
        GREYGEN_PROCESSOR_NAME,
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: 'explicit',
        },
      ) as unknown as AudioWorkletNodePort
    },
  }
}

export function createBrowserAudioEngine(): AudioEngine {
  return new AudioEngine(createBrowserAudioRuntime())
}
