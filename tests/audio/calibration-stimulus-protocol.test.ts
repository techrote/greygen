import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_STIMULUS_SCHEMA_VERSION,
  createCalibrationStimulusState,
} from '../../src/audio/dsp/calibrationStimulus'
import {
  AUDIO_PROTOCOL_VERSION,
  deserializeCalibrationStimulusState,
  parseMainToWorkletMessage,
  parseWorkletToMainMessage,
  serializeCalibrationStimulusState,
} from '../../src/audio/protocol'

describe('calibration stimulus AudioWorklet protocol', () => {
  it('round-trips a bounded channel-routed transient stimulus command', () => {
    const source = createCalibrationStimulusState('band', 8, 7.5, 'left')
    const parsed = parseMainToWorkletMessage({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'set-calibration-stimulus',
      requestId: 9,
      calibrationStimulus: serializeCalibrationStimulusState(source),
    })
    expect(parsed?.type).toBe('set-calibration-stimulus')
    if (parsed?.type !== 'set-calibration-stimulus') {
      throw new Error('Expected calibration stimulus message')
    }
    expect(
      deserializeCalibrationStimulusState(parsed.calibrationStimulus),
    ).toEqual(source)
  })

  it('rejects malformed, unknown-channel, or out-of-bound stimulus state', () => {
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-calibration-stimulus',
        requestId: 10,
        calibrationStimulus: {
          schemaVersion: CALIBRATION_STIMULUS_SCHEMA_VERSION,
          mode: 'band',
          bandIndex: 10,
          levelOffsetDb: 0,
          channel: 'left',
        },
      }),
    ).toBeNull()
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-calibration-stimulus',
        requestId: 11,
        calibrationStimulus: {
          schemaVersion: CALIBRATION_STIMULUS_SCHEMA_VERSION,
          mode: 'band',
          bandIndex: 1,
          levelOffsetDb: 30,
          channel: 'right',
        },
      }),
    ).toBeNull()
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-calibration-stimulus',
        requestId: 12,
        calibrationStimulus: {
          schemaVersion: CALIBRATION_STIMULUS_SCHEMA_VERSION,
          mode: 'band',
          bandIndex: 1,
          levelOffsetDb: 0,
          channel: 'centre',
        },
      }),
    ).toBeNull()
  })

  it('accepts request-scoped stimulus and channel-calibration acknowledgements', () => {
    for (const command of [
      'set-calibration-stimulus',
      'set-channel-calibration',
    ] as const) {
      expect(
        parseWorkletToMainMessage({
          version: AUDIO_PROTOCOL_VERSION,
          type: 'ack',
          requestId: 20,
          command,
        }),
      ).toEqual({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'ack',
        requestId: 20,
        command,
      })
    }
  })
})
