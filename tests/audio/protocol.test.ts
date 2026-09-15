import { describe, expect, it } from 'vitest'
import { createGainStageState } from '../../src/audio/dsp/gainSafety'
import { createSpectrumState } from '../../src/audio/dsp/spectra'
import { createStereoWidthState } from '../../src/audio/dsp/stereo'
import {
  AUDIO_PROTOCOL_VERSION,
  deserializeGainStageState,
  deserializeSpectrumState,
  deserializeStereoWidthState,
  parseMainToWorkletMessage,
  parseWorkletToMainMessage,
  serializeGainStageState,
  serializeSpectrumState,
  serializeStereoWidthState,
} from '../../src/audio/protocol'

describe('AudioWorklet protocol', () => {
  it('serializes spectrum, gain, and stereo state through JSON-safe representations', () => {
    const offsets = new Float64Array(10)
    offsets[2] = 3.5
    offsets[7] = -4.25
    const source = createSpectrumState('pink', offsets)
    const gainStage = createGainStageState(-18, offsets, offsets)
    const stereoWidth = createStereoWidthState(0.73)

    const serializedSpectrum = JSON.parse(
      JSON.stringify(serializeSpectrumState(source)),
    ) as unknown
    const serializedGain = JSON.parse(
      JSON.stringify(serializeGainStageState(gainStage)),
    ) as unknown
    const serializedStereo = JSON.parse(
      JSON.stringify(serializeStereoWidthState(stereoWidth)),
    ) as unknown
    const parsed = parseMainToWorkletMessage({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'initialize',
      requestId: 1,
      seed: 1234,
      spectrum: serializedSpectrum,
      gainStage: serializedGain,
      stereoWidth: serializedStereo,
    })

    expect(parsed?.type).toBe('initialize')
    if (parsed?.type !== 'initialize') {
      throw new Error('Expected initialize message')
    }
    expect(deserializeSpectrumState(parsed.spectrum)).toEqual(source)
    expect(deserializeGainStageState(parsed.gainStage)).toEqual(gainStage)
    expect(deserializeStereoWidthState(parsed.stereoWidth)).toEqual(stereoWidth)
  })

  it('rejects incompatible versions, invalid seeds, malformed spectra, gain state, and stereo width', () => {
    expect(
      parseMainToWorkletMessage({
        version: 1,
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
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-gain-stage',
        requestId: 4,
        gainStage: {
          schemaVersion: 1,
          masterGainDb: 12,
          animationBandOffsetsDb: Array(10).fill(0),
          calibrationBandOffsetsDb: Array(10).fill(0),
        },
      }),
    ).toBeNull()
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-stereo-width',
        requestId: 5,
        stereoWidth: { schemaVersion: 1, width: 1.01 },
      }),
    ).toBeNull()
  })

  it('accepts a bounded stereo-width control message', () => {
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-stereo-width',
        requestId: 6,
        stereoWidth: { schemaVersion: 1, width: 0.42 },
      }),
    ).toEqual({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'set-stereo-width',
      requestId: 6,
      stereoWidth: { schemaVersion: 1, width: 0.42 },
    })
  })

  it('validates ready/status and bounded stereo telemetry messages from the processor', () => {
    expect(
      parseWorkletToMainMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'ready',
        requestId: 4,
        sampleRate: 48_000,
        targetId: 'grey',
        highBandMode: 'degraded-high-shelf',
        stereoWidth: 0.5,
      }),
    ).toEqual({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'ready',
      requestId: 4,
      sampleRate: 48_000,
      targetId: 'grey',
      highBandMode: 'degraded-high-shelf',
      stereoWidth: 0.5,
    })

    const telemetry = {
      version: AUDIO_PROTOCOL_VERSION,
      type: 'telemetry',
      sequence: 3,
      frameCount: 4800,
      peakDbfs: -8.5,
      rmsDbfs: -21.2,
      safetyPreGainDb: -1,
      safetyPreGainTargetDb: -1,
      masterGainDb: -26.02,
      guardInterventions: 0,
      stereoWidth: 0.5,
      stereoCorrelation: Math.SQRT1_2,
    }
    expect(parseWorkletToMainMessage(telemetry)).toEqual(telemetry)
    expect(parseWorkletToMainMessage({ ...telemetry, sequence: 0 })).toBeNull()
    expect(
      parseWorkletToMainMessage({ ...telemetry, peakDbfs: Number.NaN }),
    ).toBeNull()
    expect(
      parseWorkletToMainMessage({ ...telemetry, stereoCorrelation: -0.1 }),
    ).toBeNull()

    expect(
      parseWorkletToMainMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'status',
        requestId: 5,
        sampleRate: 48_000,
        targetId: 'grey',
        highBandMode: 'invalid-mode',
        stereoWidth: 0.5,
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
