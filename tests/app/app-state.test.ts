import { describe, expect, it } from 'vitest'
import { DEFAULT_ENGINE_SEED } from '../../src/audio/dsp/engine'
import { DEFAULT_MASTER_GAIN_DB } from '../../src/audio/dsp/gainSafety'
import { isModifiedPreset } from '../../src/features/generator/uiModel'
import {
  PROFILE_RECORD_SCHEMA_VERSION,
  SOUND_STATE_SCHEMA_VERSION,
  UI_STATE_SCHEMA_VERSION,
  createDefaultProfileState,
  createDefaultSoundState,
  createProfileState,
  createSoundState,
  parseProfileState,
  parseSoundState,
  parseUiState,
  serializeProfileState,
  serializeSoundState,
  soundStateToSpectrumState,
} from '../../src/app/state/appState'

describe('versioned app state schemas', () => {
  it('creates conservative deterministic sound defaults', () => {
    const state = createDefaultSoundState()
    expect(state.schemaVersion).toBe(SOUND_STATE_SCHEMA_VERSION)
    expect(state.seed).toBe(DEFAULT_ENGINE_SEED)
    expect(state.targetId).toBe('grey')
    expect(state.userBandOffsetsDb).toEqual(Array(10).fill(0))
    expect(state.masterGainDb).toBe(DEFAULT_MASTER_GAIN_DB)
  })

  it('migrates the explicit legacy sound v0 fixture deterministically', () => {
    const result = parseSoundState(
      JSON.stringify({
        schemaVersion: 0,
        seed: 123456,
        preset: 'pink',
        bandsDb: [0, 0, 2, 0, 0, 0, 0, 0, 0, -1],
        masterDb: -18,
      }),
    )

    expect(result.code).toBe('migrated')
    expect(result.state.seed).toBe(123456)
    expect(result.state.targetId).toBe('pink')
    expect(result.state.userBandOffsetsDb[2]).toBe(2)
    expect(result.state.userBandOffsetsDb[9]).toBe(-1)
    expect(result.state.masterGainDb).toBe(-18)
    expect(isModifiedPreset(soundStateToSpectrumState(result.state))).toBe(true)
  })

  it('recovers wrong types and clamps finite out-of-range sound values', () => {
    const result = parseSoundState(
      JSON.stringify({
        schemaVersion: SOUND_STATE_SCHEMA_VERSION,
        seed: -4,
        targetId: 'ultraviolet',
        userBandOffsetsDb: [99, -99, null, 4, 5, 6, 7, 8, 9, 10],
        masterGainDb: 12,
      }),
    )

    expect(result.code).toBe('recovered')
    expect(result.state.seed).toBe(DEFAULT_ENGINE_SEED)
    expect(result.state.targetId).toBe('grey')
    expect(result.state.userBandOffsetsDb[0]).toBe(24)
    expect(result.state.userBandOffsetsDb[1]).toBe(-24)
    expect(result.state.userBandOffsetsDb[2]).toBe(0)
    expect(result.state.masterGainDb).toBe(0)
    expect(result.messages.length).toBeGreaterThan(0)
  })

  it('falls back safely on malformed JSON and unknown future sound schemas', () => {
    const malformed = parseSoundState('{not json')
    expect(malformed.code).toBe('malformed')
    expect(malformed.state).toEqual(createDefaultSoundState())

    const future = parseSoundState(
      JSON.stringify({ schemaVersion: 99, targetId: 'white' }),
    )
    expect(future.code).toBe('future-version')
    expect(future.state).toEqual(createDefaultSoundState())
  })

  it('keeps private profiles outside shareable sound serialization', () => {
    const sound = createSoundState({
      seed: 42,
      targetId: 'brown',
      userBandOffsetsDb: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      masterGainDb: -24,
    })
    const profiles = createProfileState([
      {
        recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
        id: 'fixture-headphones',
        name: 'Fixture headphones',
        kind: 'calibration',
        payloadSchemaVersion: 1,
        payload: { correctionDb: [1, 0, -1], note: 'private fixture' },
      },
    ])

    const soundJson = serializeSoundState(sound)
    const profileJson = serializeProfileState(profiles)

    expect(soundJson).not.toContain('profiles')
    expect(soundJson).not.toContain('Fixture headphones')
    expect(soundJson).not.toContain('private fixture')
    expect(profileJson).toContain('Fixture headphones')
    expect(profileJson).toContain('private fixture')
  })

  it('validates private profile envelopes without interpreting future profile payload semantics', () => {
    const valid = parseProfileState(
      JSON.stringify({
        schemaVersion: 1,
        profiles: [
          {
            recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
            id: 'p1',
            name: 'Playback chain A',
            kind: 'playback',
            payloadSchemaVersion: 3,
            payload: { sampleRate: 48000, values: [1, 2, 3] },
          },
        ],
      }),
    )
    expect(valid.code).toBe('ok')
    expect(valid.state.profiles).toHaveLength(1)

    const invalid = parseProfileState(
      JSON.stringify({
        schemaVersion: 1,
        profiles: [
          {
            recordSchemaVersion: PROFILE_RECORD_SCHEMA_VERSION,
            id: '',
            name: 'Broken',
            kind: 'medical',
            payloadSchemaVersion: 1,
            payload: {},
          },
        ],
      }),
    )
    expect(invalid.code).toBe('recovered')
    expect(invalid.state).toEqual(createDefaultProfileState())
  })

  it('recovers UI preferences independently from sound/profile state', () => {
    const valid = parseUiState(
      JSON.stringify({
        schemaVersion: UI_STATE_SCHEMA_VERSION,
        futureFeaturesVisible: false,
      }),
    )
    expect(valid.code).toBe('ok')
    expect(valid.state.futureFeaturesVisible).toBe(false)

    const invalid = parseUiState(
      JSON.stringify({
        schemaVersion: UI_STATE_SCHEMA_VERSION,
        futureFeaturesVisible: 'yes',
      }),
    )
    expect(invalid.code).toBe('recovered')
    expect(invalid.state.futureFeaturesVisible).toBe(true)
  })
})
