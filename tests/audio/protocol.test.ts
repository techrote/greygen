import { describe, expect, it } from 'vitest'
import {
  AUDIO_PROTOCOL_VERSION,
  deserializeSpectrumState,
  parseMainToWorkletMessage,
  parseWorkletToMainMessage,
  serializeSpectrumState,
} from '../../src/audio/protocol'
import { createSpectrumState } from '../../src/audio/dsp/spectra'

describe('AudioWorklet protocol', () => {
  it('serializes spectrum state through a JSON-safe representation', () => {
    const offsets = new Float64Array(10)
    offsets[2] = 3.5
    offsets[7] = -4.25
    const source = createSpectrumState('pink', offsets)

    const serialized = serializeSpectrumState(source)
    const jsonRoundTrip = JSON.parse(JSON.stringify(serialized)) as unknown
    const parsed = parseMainToWorkletMessage({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'initialize',
      requestId: 1,
      seed: 1234,
      spectrum: jsonRoundTrip,
    })

    expect(parsed?.type).toBe('initialize')
    if (parsed?.type !== 'initialize') {
      throw new Error('Expected initialize message')
    }
    expect(deserializeSpectrumState(parsed.spectrum)).toEqual(source)
  })

  it('rejects incompatible versions, invalid seeds, and malformed spectra', () => {
    expect(
      parseMainToWorkletMessage({
        version: 99,
        type: 'request-status',
        requestId: 1,
      }),
    ).toBeNull()
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'reset-seed',
        requestId: 2,
        seed: -1,
      }),
    ).toBeNull()
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-spectrum',
        requestId: 3,
        spectrum: {
          targetId: 'grey',
          userBandOffsetsDb: [0, 0],
        },
      }),
    ).toBeNull()
  })

  it('validates ready/status messages from the processor', () => {
    expect(
      parseWorkletToMainMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'ready',
        requestId: 4,
        sampleRate: 48_000,
        targetId: 'grey',
        highBandMode: 'degraded-high-shelf',
      }),
    ).toEqual({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'ready',
      requestId: 4,
      sampleRate: 48_000,
      targetId: 'grey',
      highBandMode: 'degraded-high-shelf',
    })

    expect(
      parseWorkletToMainMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'status',
        requestId: 5,
        sampleRate: 48_000,
        targetId: 'grey',
        highBandMode: 'invalid-mode',
        renderedFrames: 128,
      }),
    ).toBeNull()
  })

  it('accepts request-scoped processor errors without accepting malformed ones', () => {
    expect(
      parseWorkletToMainMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'error',
        requestId: 8,
        code: 'engine-error',
        message: 'bad state',
      }),
    ).toEqual({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'error',
      requestId: 8,
      code: 'engine-error',
      message: 'bad state',
    })

    expect(
      parseWorkletToMainMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'error',
        code: 'unknown-code',
        message: 'bad state',
      }),
    ).toBeNull()
  })
})
