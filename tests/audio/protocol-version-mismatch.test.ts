import { describe, expect, it } from 'vitest'
import {
  AUDIO_PROTOCOL_VERSION,
  parseWorkletToMainMessage,
} from '../../src/audio/protocol'

describe('stale AudioWorklet protocol boundary', () => {
  it('rejects a ready response from any older worklet protocol', () => {
    const staleVersion = Math.max(0, AUDIO_PROTOCOL_VERSION - 1)

    expect(
      parseWorkletToMainMessage({
        version: staleVersion,
        type: 'ready',
        requestId: 1,
        sampleRate: 48_000,
        targetId: 'grey',
        highBandMode: 'degraded-high-shelf',
        stereoWidth: 0.5,
        animation: {
          schemaVersion: 1,
          mode: 'off',
          seed: 0,
          depthDb: 0,
          speed: 1,
          energyPreserving: true,
        },
      }),
    ).toBeNull()
  })
})
