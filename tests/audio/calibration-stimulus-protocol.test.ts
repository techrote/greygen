import { describe, expect, it } from 'vitest'
import { createCalibrationStimulusState } from '../../src/audio/dsp/calibrationStimulus'
import {
  AUDIO_PROTOCOL_VERSION,
  deserializeCalibrationStimulusState,
  parseMainToWorkletMessage,
  parseWorkletToMainMessage,
  serializeCalibrationStimulusState,
} from '../../src/audio/protocol'

describe('calibration stimulus AudioWorklet protocol', () => {
  it('round-trips a bounded transient stimulus command', () => {
    const source = createCalibrationStimulusState('band', 8, 7.5)
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

  it('rejects malformed or out-of-bound stimulus state', () => {
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-calibration-stimulus',
        requestId: 10,
        calibrationStimulus: {
          schemaVersion: 1,
          mode: 'band',
          bandIndex: 10,
          levelOffsetDb: 0,
        },
      }),
    ).toBeNull()
    expect(
      parseMainToWorkletMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'set-calibration-stimulus',
        requestId: 11,
        calibrationStimulus: {
          schemaVersion: 1,
          mode: 'band',
          bandIndex: 1,
          levelOffsetDb: 30,
        },
      }),
    ).toBeNull()
  })

  it('accepts a request-scoped stimulus acknowledgement', () => {
    expect(
      parseWorkletToMainMessage({
        version: AUDIO_PROTOCOL_VERSION,
        type: 'ack',
        requestId: 12,
        command: 'set-calibration-stimulus',
      }),
    ).toEqual({
      version: AUDIO_PROTOCOL_VERSION,
      type: 'ack',
      requestId: 12,
      command: 'set-calibration-stimulus',
    })
  })
})
